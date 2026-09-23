import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from './env';
import { tenantTransaction } from './db';
import { ApiError } from './http';
import { decryptSecret, encryptSecret, hashToken } from './security';

export const providerSchema = z.enum(['google', 'microsoft', 'slack']);
export type OAuthProvider = z.infer<typeof providerSchema>;

const tokenSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
    ok: z.boolean().optional(),
    team: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  })
  .loose();
export type OAuthToken = z.infer<typeof tokenSchema>;

export function oauthConfig(provider: OAuthProvider) {
  const config = env();
  if (!config.APP_ENCRYPTION_KEY)
    throw new ApiError(
      503,
      'Chiffrement OAuth non configuré',
      'INTEGRATION_NOT_CONFIGURED',
    );
  const values =
    provider === 'google'
      ? {
          clientId: config.GOOGLE_OAUTH_CLIENT_ID,
          clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
          authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          scopes: [
            'openid',
            'email',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/calendar.events',
          ],
        }
      : provider === 'microsoft'
        ? {
            clientId: config.MICROSOFT_OAUTH_CLIENT_ID,
            clientSecret: config.MICROSOFT_OAUTH_CLIENT_SECRET,
            authorizeUrl: `https://login.microsoftonline.com/${config.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/authorize`,
            tokenUrl: `https://login.microsoftonline.com/${config.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/token`,
            scopes: [
              'openid',
              'profile',
              'email',
              'offline_access',
              'User.Read',
              'Mail.Read',
              'Mail.Send',
              'Calendars.ReadWrite',
              'ChannelMessage.Send',
            ],
          }
        : {
            clientId: config.SLACK_OAUTH_CLIENT_ID,
            clientSecret: config.SLACK_OAUTH_CLIENT_SECRET,
            authorizeUrl: 'https://slack.com/oauth/v2/authorize',
            tokenUrl: 'https://slack.com/api/oauth.v2.access',
            scopes: ['chat:write'],
          };
  if (!values.clientId || !values.clientSecret)
    throw new ApiError(
      503,
      `${provider} OAuth non configuré`,
      'INTEGRATION_NOT_CONFIGURED',
    );
  return {
    ...values,
    clientId: values.clientId,
    clientSecret: values.clientSecret,
    redirectUri: `${config.APP_URL.replace(/\/$/, '')}/api/integrations/oauth/${provider}/callback`,
    encryptionKey: config.APP_ENCRYPTION_KEY,
  };
}

export function createOAuthChallenge() {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { state, stateHash: hashToken(state), verifier, challenge };
}

export function authorizationUrl(
  provider: OAuthProvider,
  state: string,
  challenge: string,
) {
  const config = oauthConfig(provider);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  if (provider === 'slack') {
    url.searchParams.set('scope', config.scopes.join(','));
  } else {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (provider === 'google') {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
    }
  }
  return url.toString();
}

async function tokenRequest(
  provider: OAuthProvider,
  values: Record<string, string>,
): Promise<OAuthToken> {
  const config = oauthConfig(provider);
  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      ...values,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const raw: unknown = await response.json().catch(() => null);
  const parsed = tokenSchema.safeParse(raw);
  if (!response.ok || !parsed.success || parsed.data.ok === false)
    throw new ApiError(
      502,
      `${provider} a refusé l'autorisation`,
      'OAUTH_PROVIDER_ERROR',
    );
  return parsed.data;
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  code: string,
  verifier: string | null,
) {
  const values: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: oauthConfig(provider).redirectUri,
  };
  if (provider !== 'slack' && verifier) values.code_verifier = verifier;
  return tokenRequest(provider, values);
}

export async function refreshOAuthToken(
  provider: OAuthProvider,
  refreshToken: string,
) {
  return tokenRequest(provider, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export function encryptOAuth(value: string) {
  return encryptSecret(value, oauthConfigKey());
}
export function decryptOAuth(value: string) {
  return decryptSecret(value, oauthConfigKey());
}
function oauthConfigKey() {
  const key = env().APP_ENCRYPTION_KEY;
  if (!key)
    throw new ApiError(
      503,
      'Chiffrement OAuth non configuré',
      'INTEGRATION_NOT_CONFIGURED',
    );
  return key;
}

export async function oauthIdentity(
  provider: OAuthProvider,
  accessToken: string,
  token: OAuthToken,
) {
  if (provider === 'slack') {
    if (!token.team?.id)
      throw new ApiError(
        502,
        'Espace Slack non identifié',
        'OAUTH_PROVIDER_ERROR',
      );
    return {
      externalAccountId: token.team.id,
      displayName: token.team.name ?? token.team.id,
    };
  }
  const endpoint =
    provider === 'google'
      ? 'https://www.googleapis.com/oauth2/v3/userinfo'
      : 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName';
  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new ApiError(
      502,
      'Identité du compte indisponible',
      'OAUTH_PROVIDER_ERROR',
    );
  const raw = await response.json();
  const parsed =
    provider === 'google'
      ? z
          .object({ sub: z.string(), email: z.string().optional() })
          .safeParse(raw)
      : z
          .object({
            id: z.string(),
            displayName: z.string().optional(),
            mail: z.string().nullable().optional(),
            userPrincipalName: z.string().optional(),
          })
          .safeParse(raw);
  if (!parsed.success)
    throw new ApiError(
      502,
      'Identité du compte invalide',
      'OAUTH_PROVIDER_ERROR',
    );
  return provider === 'google'
    ? {
        externalAccountId: (parsed.data as { sub: string }).sub,
        displayName: (parsed.data as { email?: string }).email ?? 'Google',
      }
    : {
        externalAccountId: (parsed.data as { id: string }).id,
        displayName:
          (
            parsed.data as {
              displayName?: string;
              mail?: string | null;
              userPrincipalName?: string;
            }
          ).mail ??
          (parsed.data as { userPrincipalName?: string }).userPrincipalName ??
          (parsed.data as { displayName?: string }).displayName ??
          'Microsoft',
      };
}

export async function connectionAccessToken(
  organizationId: string,
  userId: string,
  provider: OAuthProvider,
) {
  return tenantTransaction(organizationId, async (sql) => {
    const [connection] = await sql<
      Array<{
        id: string;
        accessCipher: string;
        refreshCipher: string | null;
        expiresAt: Date | null;
      }>
    >`
      select id, access_token_cipher as "accessCipher", refresh_token_cipher as "refreshCipher", expires_at as "expiresAt"
      from oauth_connections where organization_id = ${organizationId} and user_id = ${userId}
        and provider = ${provider} and disconnected_at is null for update`;
    if (!connection)
      throw new ApiError(
        404,
        'Compte non connecté',
        'INTEGRATION_NOT_CONNECTED',
      );
    if (
      !connection.expiresAt ||
      new Date(connection.expiresAt).getTime() > Date.now() + 120_000
    )
      return {
        connectionId: connection.id,
        accessToken: decryptOAuth(connection.accessCipher),
      };
    if (!connection.refreshCipher)
      throw new ApiError(401, 'Reconnectez ce compte', 'OAUTH_EXPIRED');
    const refreshed = await refreshOAuthToken(
      provider,
      decryptOAuth(connection.refreshCipher),
    );
    await sql`update oauth_connections set access_token_cipher = ${encryptOAuth(refreshed.access_token)},
      refresh_token_cipher = ${refreshed.refresh_token ? encryptOAuth(refreshed.refresh_token) : connection.refreshCipher},
      expires_at = ${refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null},
      updated_at = now(), last_error = null where id = ${connection.id}`;
    return { connectionId: connection.id, accessToken: refreshed.access_token };
  });
}
