import type Stripe from 'stripe';
import type { PlanKey } from '@/lib/domain/billing';
import {
  findOrganizationByStripeCustomer,
  markWebhookEventProcessed,
  stripeClient,
  upsertOrganizationBilling,
} from '@/lib/server/billing';
import { env } from '@/lib/server/env';
import { ApiError, handleApiError } from '@/lib/server/http';
import { log } from '@/lib/server/observability';

function planFromPriceId(priceId: string | undefined): PlanKey {
  const configuration = env();
  if (priceId && priceId === configuration.STRIPE_PRICE_STARTER)
    return 'STARTER';
  if (priceId && priceId === configuration.STRIPE_PRICE_PRO) return 'PRO';
  return 'FREE';
}

function customerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
) {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

async function organizationForSubscription(subscription: Stripe.Subscription) {
  return (
    subscription.metadata.organizationId ||
    (await findOrganizationByStripeCustomer(
      customerId(subscription.customer) ?? '',
    ))
  );
}

async function syncSubscription(
  organizationId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  await upsertOrganizationBilling({
    organizationId,
    plan: planFromPriceId(item?.price.id),
    stripeCustomerId: customerId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    trialEndsAt: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
  });
}

// Stripe redelivers webhooks on timeout/5xx and there is no per-organization
// context yet (that's exactly what this endpoint establishes) — it cannot
// go through assertSameOrigin/readJson like browser-originated routes; the
// raw body is required to verify the `stripe-signature` header.
export async function POST(request: Request) {
  try {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret)
      throw new ApiError(
        503,
        'Webhook Stripe non configuré',
        'INTEGRATION_NOT_CONFIGURED',
      );
    const signature = request.headers.get('stripe-signature');
    if (!signature)
      throw new ApiError(400, 'Signature manquante', 'INVALID_SIGNATURE');
    const payload = await request.text();
    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      throw new ApiError(400, 'Signature invalide', 'INVALID_SIGNATURE');
    }

    const isNew = await markWebhookEventProcessed(event.id, event.type);
    if (!isNew) return Response.json({ ok: true, duplicate: true });

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const organizationId = session.client_reference_id;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : null;
      if (organizationId && subscriptionId) {
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(organizationId, subscription);
      }
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.created'
    ) {
      const subscription = event.data.object;
      const organizationId = await organizationForSubscription(subscription);
      if (organizationId) await syncSubscription(organizationId, subscription);
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const organizationId = await organizationForSubscription(subscription);
      if (organizationId)
        await upsertOrganizationBilling({
          organizationId,
          plan: 'FREE',
          stripeCustomerId: customerId(subscription.customer),
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: 'canceled',
          trialEndsAt: null,
          currentPeriodEnd: null,
        });
    } else {
      await log('info', 'Unhandled Stripe webhook event', { type: event.type });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
