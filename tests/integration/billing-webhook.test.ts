import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as me } from '@/app/api/auth/me/route';
import { GET as getBilling } from '@/app/api/billing/route';
import { registerAccount, resetTestCookies } from './helpers';

// A signing secret only ever used locally to sign+verify fixtures below —
// this never talks to Stripe's servers, so it needs no real Stripe account.
const WEBHOOK_SECRET = 'whsec_test_fixture_only';
const STARTER_PRICE_ID = 'price_test_starter';

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture_only');
vi.stubEnv('STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET);
vi.stubEnv('STRIPE_PRICE_STARTER', STARTER_PRICE_ID);

function signedRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return new Request('http://localhost:3000/api/billing/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body,
  });
}

function subscriptionUpdatedEvent(
  eventId: string,
  organizationId: string,
  overrides?: Partial<{ status: string; priceId: string }>,
) {
  return {
    id: eventId,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_fixture_${organizationId}`,
        // Real Stripe customer ids are unique per customer; the fixture
        // must mirror that or organization_billing_customer_idx (rightly)
        // rejects a second organization claiming the same customer id.
        customer: `cus_fixture_${organizationId}`,
        status: overrides?.status ?? 'active',
        metadata: { organizationId },
        trial_end: null,
        items: {
          data: [
            {
              price: { id: overrides?.priceId ?? STARTER_PRICE_ID },
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
            },
          ],
        },
      },
    },
  };
}

function uniqueEventId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function currentOrganizationId() {
  const response = await me();
  const body = (await response.json()) as { user: { organizationId: string } };
  return body.user.organizationId;
}

beforeEach(() => {
  resetTestCookies();
});

describe('Stripe webhook against a real database (signature verified with a local fixture secret)', () => {
  it('rejects a request with an invalid signature', async () => {
    const { POST: webhook } = await import('@/app/api/billing/webhook/route');
    const response = await webhook(
      new Request('http://localhost:3000/api/billing/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=not-a-real-signature' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('upgrades the organization plan from a subscription.updated event', async () => {
    const { POST: webhook } = await import('@/app/api/billing/webhook/route');
    await registerAccount({ accountType: 'RECRUITER' });
    const organizationId = await currentOrganizationId();

    const before = await getBilling();
    expect((await before.json()).plan).toBe('STARTER'); // 14-day trial default

    const response = await webhook(
      signedRequest(
        subscriptionUpdatedEvent(uniqueEventId('evt_upgrade'), organizationId),
      ),
    );
    expect(response.status).toBe(200);

    const after = await getBilling();
    const afterBody = (await after.json()) as {
      plan: string;
      subscriptionStatus: string;
    };
    expect(afterBody.plan).toBe('STARTER');
    expect(afterBody.subscriptionStatus).toBe('active');
  });

  it('does not reprocess the same event id twice (Stripe redelivery safety)', async () => {
    const { POST: webhook } = await import('@/app/api/billing/webhook/route');
    await registerAccount({ accountType: 'RECRUITER' });
    const organizationId = await currentOrganizationId();
    const eventId = uniqueEventId('evt_dup');

    const first = await webhook(
      signedRequest(subscriptionUpdatedEvent(eventId, organizationId)),
    );
    expect((await first.json()).duplicate).toBeUndefined();

    const second = await webhook(
      signedRequest(
        subscriptionUpdatedEvent(eventId, organizationId, {
          status: 'past_due',
        }),
      ),
    );
    const secondBody = (await second.json()) as { duplicate?: boolean };
    expect(secondBody.duplicate).toBe(true);

    // The second payload (past_due) must not have been applied — proves the
    // idempotency check runs before any business logic, not just logging.
    const billing = (await (await getBilling()).json()) as {
      subscriptionStatus: string;
    };
    expect(billing.subscriptionStatus).toBe('active');
  });
});
