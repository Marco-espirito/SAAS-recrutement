import 'server-only';
import Stripe from 'stripe';
import {
  isSubscriptionUsable,
  planLimits,
  quotaExceeded,
  type PlanKey,
} from '../domain/billing';
import { db, tenantTransaction } from './db';
import { env } from './env';
import { ApiError } from './http';

let client: Stripe | undefined;

export function stripeClient() {
  const key = env().STRIPE_SECRET_KEY;
  if (!key)
    throw new ApiError(
      503,
      'Facturation non configurée',
      'INTEGRATION_NOT_CONFIGURED',
    );
  client ??= new Stripe(key);
  return client;
}

export function priceIdForPlan(plan: 'STARTER' | 'PRO') {
  const configuration = env();
  const priceId =
    plan === 'STARTER'
      ? configuration.STRIPE_PRICE_STARTER
      : configuration.STRIPE_PRICE_PRO;
  if (!priceId)
    throw new ApiError(
      503,
      `Le plan ${plan} n'a pas de prix Stripe configuré`,
      'INTEGRATION_NOT_CONFIGURED',
    );
  return priceId;
}

export type OrganizationBilling = {
  plan: PlanKey;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
};

export async function getOrganizationBilling(
  organizationId: string,
): Promise<OrganizationBilling> {
  return tenantTransaction(organizationId, async (sql) => {
    const [row] = await sql<Array<OrganizationBilling>>`
      select plan, stripe_customer_id as "stripeCustomerId",
        stripe_subscription_id as "stripeSubscriptionId",
        subscription_status as "subscriptionStatus",
        trial_ends_at as "trialEndsAt", current_period_end as "currentPeriodEnd"
      from organization_billing where organization_id = ${organizationId}`;
    return (
      row ?? {
        plan: 'FREE',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
      }
    );
  });
}

export async function recordAiUsage(
  organizationId: string,
  userId: string,
  provider: string,
) {
  await tenantTransaction(
    organizationId,
    (
      sql,
    ) => sql`insert into ai_usage_events (organization_id, user_id, provider)
      values (${organizationId}, ${userId}, ${provider})`,
  );
}

export async function assertAiQuotaAvailable(organizationId: string) {
  const billing = await getOrganizationBilling(organizationId);
  const limit = planLimits[billing.plan].aiRequestsPerMonth;
  const used = await tenantTransaction(organizationId, async (sql) => {
    const [{ count }] = await sql<Array<{ count: number }>>`
      select count(*)::int as count from ai_usage_events
      where organization_id = ${organizationId}
        and created_at > date_trunc('month', now())`;
    return count;
  });
  if (quotaExceeded(used, limit))
    throw new ApiError(
      429,
      `Quota IA du plan ${billing.plan} atteint pour ce mois (${limit} requêtes). Passez à un plan supérieur pour continuer.`,
      'AI_QUOTA_EXCEEDED',
    );
}

/** Whether the organization's current plan/subscription actually grants access to it (used beyond simple display). */
export function planIsActive(billing: OrganizationBilling): boolean {
  if (billing.plan === 'FREE') return true;
  return isSubscriptionUsable(billing.subscriptionStatus);
}

export async function createCheckoutSession(input: {
  organizationId: string;
  plan: 'STARTER' | 'PRO';
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = stripeClient();
  const billing = await getOrganizationBilling(input.organizationId);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceIdForPlan(input.plan), quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer: billing.stripeCustomerId ?? undefined,
    customer_email: billing.stripeCustomerId ? undefined : input.customerEmail,
    client_reference_id: input.organizationId,
    subscription_data: { metadata: { organizationId: input.organizationId } },
  });
  return session.url;
}

export async function createBillingPortalSession(input: {
  organizationId: string;
  returnUrl: string;
}) {
  const stripe = stripeClient();
  const billing = await getOrganizationBilling(input.organizationId);
  if (!billing.stripeCustomerId)
    throw new ApiError(
      404,
      'Aucun client Stripe pour cette organisation encore',
      'NO_STRIPE_CUSTOMER',
    );
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: input.returnUrl,
  });
  return session.url;
}

export async function findOrganizationByStripeCustomer(
  stripeCustomerId: string,
) {
  const rows = await db()<Array<{ organizationId: string | null }>>`
    select find_organization_by_stripe_customer(${stripeCustomerId}) as "organizationId"`;
  return rows[0]?.organizationId ?? null;
}

export async function upsertOrganizationBilling(input: {
  organizationId: string;
  plan: PlanKey;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}) {
  await db()`select upsert_organization_billing(
    ${input.organizationId}, ${input.plan}, ${input.stripeCustomerId},
    ${input.stripeSubscriptionId}, ${input.subscriptionStatus},
    ${input.trialEndsAt}, ${input.currentPeriodEnd}
  )`;
}

export async function expireBillingTrials() {
  const rows = await db()<Array<{ downgraded: number }>>`
    select downgraded from expire_billing_trials()`;
  return rows[0];
}

/** Marks a Stripe event as processed; returns false if it already was (idempotency — Stripe may redeliver). */
export async function markWebhookEventProcessed(id: string, type: string) {
  const rows = await db()<Array<{ id: string }>>`
    insert into stripe_webhook_events (id, type) values (${id}, ${type})
    on conflict (id) do nothing
    returning id`;
  return Boolean(rows[0]);
}
