import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { ApiError, requireSession } from '@/lib/server/http';
import {
  decryptOAuth,
  encryptOAuth,
  exchangeOAuthCode,
  oauthConfig,
  oauthIdentity,
  providerSchema,
} from '@/lib/server/oauth';
import { hashToken } from '@/lib/server/security';

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: value } = await context.params;
  const parsed = providerSchema.safeParse(value);
  const provider = parsed.success ? parsed.data : null;
  const destination = new URL(env().APP_URL);
  destination.searchParams.set('oauth', 'error');
  if (provider) destination.searchParams.set('provider', provider);
  try {
    if (!provider) throw new ApiError(404, 'Fournisseur inconnu', 'NOT_FOUND');
    const session = await requireSession();
    const url = new URL(request.url);
    if (url.searchParams.has('error'))
      throw new ApiError(400, 'Autorisation refusée', 'OAUTH_DENIED');
    const state = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code') ?? '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096)
      throw new ApiError(400, 'Retour OAuth invalide', 'OAUTH_INVALID');
    const [attempt] = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ verifierCipher: string | null }>>`
      update oauth_authorizations set used_at = now()
      where state_hash = ${hashToken(state)} and organization_id = ${session.organizationId}
        and user_id = ${session.id} and provider = ${provider} and used_at is null and expires_at > now()
      returning verifier_cipher as "verifierCipher"`,
    );
    if (!attempt)
      throw new ApiError(
        400,
        'Autorisation expirée ou déjà utilisée',
        'OAUTH_INVALID',
      );
    const token = await exchangeOAuthCode(
      provider,
      code,
      attempt.verifierCipher ? decryptOAuth(attempt.verifierCipher) : null,
    );
    const identity = await oauthIdentity(provider, token.access_token, token);
    const refreshCipher = token.refresh_token
      ? encryptOAuth(token.refresh_token)
      : null;
    const config = oauthConfig(provider);
    await tenantTransaction(session.organizationId, async (sql) => {
      const [existing] = await sql<
        Array<{
          externalAccountId: string | null;
          refreshCipher: string | null;
        }>
      >`
        select external_account_id as "externalAccountId", refresh_token_cipher as "refreshCipher" from oauth_connections
        where organization_id = ${session.organizationId} and user_id = ${session.id} and provider = ${provider} for update`;
      if (
        provider !== 'slack' &&
        !refreshCipher &&
        !(
          existing?.externalAccountId === identity.externalAccountId &&
          existing.refreshCipher
        )
      )
        throw new ApiError(
          400,
          'Accès hors ligne non accordé. Reconnectez le compte.',
          'OAUTH_REFRESH_MISSING',
        );
      const effectiveRefresh = refreshCipher ?? existing?.refreshCipher ?? null;
      await sql`insert into oauth_connections
        (organization_id, user_id, provider, external_account_id, display_name, access_token_cipher, refresh_token_cipher, expires_at, scopes)
        values (${session.organizationId}, ${session.id}, ${provider}, ${identity.externalAccountId}, ${identity.displayName}, ${encryptOAuth(token.access_token)}, ${effectiveRefresh}, ${token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null}, ${sql.array(token.scope ? token.scope.split(provider === 'slack' ? ',' : ' ') : config.scopes)})
        on conflict (organization_id, user_id, provider) do update set
          external_account_id = excluded.external_account_id, display_name = excluded.display_name,
          access_token_cipher = excluded.access_token_cipher, refresh_token_cipher = excluded.refresh_token_cipher,
          expires_at = excluded.expires_at, scopes = excluded.scopes, disconnected_at = null,
          sync_state = case when oauth_connections.external_account_id = excluded.external_account_id then oauth_connections.sync_state else '{}'::jsonb end,
          last_error = null, updated_at = now()`;
    });
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'integration.oauth.connected',
      entityType: 'oauth_connection',
      request,
      metadata: { provider },
    });
    destination.searchParams.set('oauth', 'connected');
    return Response.redirect(destination, 303);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'warn',
        service: 'oauth-callback',
        provider,
        code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
      }),
    );
    return Response.redirect(destination, 303);
  }
}
