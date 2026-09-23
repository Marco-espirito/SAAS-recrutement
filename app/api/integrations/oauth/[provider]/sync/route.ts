import { audit } from '@/lib/server/audit';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';
import { providerSchema } from '@/lib/server/oauth';
import { syncOAuthConnection } from '@/lib/server/oauth-sync';
import { rateLimit } from '@/lib/server/rate-limit';

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { provider: value } = await context.params;
    const parsed = providerSchema.safeParse(value);
    if (!parsed.success)
      throw new ApiError(404, 'Fournisseur inconnu', 'NOT_FOUND');
    await rateLimit(`oauth:sync:${session.id}`, 12, 3_600);
    const result = await syncOAuthConnection(
      session.organizationId,
      session.id,
      parsed.data,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'integration.oauth.synced',
      entityType: 'oauth_connection',
      request,
      metadata: { provider: parsed.data, ...result },
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
