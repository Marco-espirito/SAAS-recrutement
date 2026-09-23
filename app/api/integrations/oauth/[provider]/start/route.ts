import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';
import {
  authorizationUrl,
  createOAuthChallenge,
  encryptOAuth,
  oauthConfig,
  providerSchema,
} from '@/lib/server/oauth';
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
    const provider = parsed.data;
    oauthConfig(provider);
    await rateLimit(`oauth:start:${session.id}`, 10, 3_600);
    const { state, stateHash, verifier, challenge } = createOAuthChallenge();
    await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      insert into oauth_authorizations (organization_id, user_id, provider, state_hash, verifier_cipher, expires_at)
      values (${session.organizationId}, ${session.id}, ${provider}, ${stateHash}, ${provider === 'slack' ? null : encryptOAuth(verifier)}, now() + interval '10 minutes')`,
    );
    return Response.json(
      { authorizationUrl: authorizationUrl(provider, state, challenge) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
