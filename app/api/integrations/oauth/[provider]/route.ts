import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';
import { providerSchema } from '@/lib/server/oauth';

export async function DELETE(
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
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      update oauth_connections set disconnected_at = now(), access_token_cipher = '', refresh_token_cipher = null,
        expires_at = null, sync_state = '{}'::jsonb, updated_at = now()
      where organization_id = ${session.organizationId} and user_id = ${session.id} and provider = ${parsed.data}
        and disconnected_at is null returning id`,
    );
    if (!rows.length)
      throw new ApiError(
        404,
        'Compte non connecté',
        'INTEGRATION_NOT_CONNECTED',
      );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'integration.oauth.disconnected',
      entityType: 'oauth_connection',
      entityId: rows[0].id as string,
      request,
      metadata: { provider: parsed.data },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
