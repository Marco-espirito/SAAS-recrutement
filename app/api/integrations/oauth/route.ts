import { tenantTransaction } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession();
    const connections = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select id, provider, display_name as "displayName", external_account_id as "externalAccountId",
        scopes, last_synced_at as "lastSyncedAt", last_error as "lastError", expires_at as "expiresAt"
      from oauth_connections where organization_id = ${session.organizationId} and user_id = ${session.id}
        and disconnected_at is null order by provider`,
    );
    const config = env();
    return Response.json(
      {
        providers: {
          google: Boolean(
            config.GOOGLE_OAUTH_CLIENT_ID &&
            config.GOOGLE_OAUTH_CLIENT_SECRET &&
            config.APP_ENCRYPTION_KEY,
          ),
          microsoft: Boolean(
            config.MICROSOFT_OAUTH_CLIENT_ID &&
            config.MICROSOFT_OAUTH_CLIENT_SECRET &&
            config.APP_ENCRYPTION_KEY,
          ),
          slack: Boolean(
            config.SLACK_OAUTH_CLIENT_ID &&
            config.SLACK_OAUTH_CLIENT_SECRET &&
            config.APP_ENCRYPTION_KEY,
          ),
        },
        connections,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
