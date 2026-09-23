import { createBillingPortalSession } from '@/lib/server/billing';
import { env } from '@/lib/server/env';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(['OWNER']);
    const appUrl = env().APP_URL.replace(/\/$/, '');
    const url = await createBillingPortalSession({
      organizationId: session.organizationId,
      returnUrl: `${appUrl}/`,
    });
    if (!url)
      throw new ApiError(502, 'Stripe n’a pas renvoyé de lien', 'STRIPE_ERROR');
    return Response.json({ url });
  } catch (error) {
    return handleApiError(error);
  }
}
