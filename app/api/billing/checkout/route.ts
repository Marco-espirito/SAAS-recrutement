import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { createCheckoutSession } from '@/lib/server/billing';
import { env } from '@/lib/server/env';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const input = z.object({ plan: z.enum(['STARTER', 'PRO']) }).strict();

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER']);
    const body = await readJson(request, input);
    const appUrl = env().APP_URL.replace(/\/$/, '');
    const url = await createCheckoutSession({
      organizationId: session.organizationId,
      plan: body.plan,
      customerEmail: session.email,
      successUrl: `${appUrl}/?billing=success`,
      cancelUrl: `${appUrl}/?billing=cancelled`,
    });
    if (!url)
      throw new ApiError(502, 'Stripe n’a pas renvoyé de lien', 'STRIPE_ERROR');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'billing.checkout.started',
      entityType: 'organization_billing',
      request,
      metadata: { plan: body.plan },
    });
    return Response.json({ url });
  } catch (error) {
    return handleApiError(error);
  }
}
