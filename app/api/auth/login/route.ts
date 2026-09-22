import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { createSession } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { ApiError, handleApiError, readJson } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { verifyPassword } from '@/lib/server/security';
import { decryptSecret, verifyTotp } from '@/lib/server/security';
import { env } from '@/lib/server/env';

const credentials = z.object({
  email: z.email().trim(),
  password: z.string().min(1).max(128),
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request, credentials);
    await rateLimit(`login:${body.email.toLowerCase()}`, 10, 900);
    const rows = await db()<
      Array<{
        id: string;
        passwordHash: string;
        organizationId: string;
        emailVerified: boolean;
        mfaEnabled: boolean;
        mfaSecretEncrypted: string | null;
      }>
    >`
      select u.id, u.password_hash as "passwordHash", m.organization_id as "organizationId",
        (u.email_verified_at is not null) as "emailVerified", u.mfa_enabled as "mfaEnabled",
        u.mfa_secret_encrypted as "mfaSecretEncrypted"
      from users u join memberships m on m.user_id = u.id
      where u.email = ${body.email} order by m.created_at asc limit 1`;
    const account = rows[0];
    if (
      !account ||
      !(await verifyPassword(body.password, account.passwordHash))
    ) {
      throw new ApiError(401, 'Identifiants incorrects', 'INVALID_CREDENTIALS');
    }
    if (env().REQUIRE_EMAIL_VERIFICATION && !account.emailVerified)
      throw new ApiError(
        403,
        'Adresse e-mail non validée',
        'EMAIL_NOT_VERIFIED',
      );
    if (account.mfaEnabled) {
      if (!body.otp) throw new ApiError(428, 'Code MFA requis', 'MFA_REQUIRED');
      const key = env().APP_ENCRYPTION_KEY;
      if (!key || !account.mfaSecretEncrypted)
        throw new ApiError(
          500,
          'Configuration MFA invalide',
          'MFA_CONFIG_ERROR',
        );
      const secret = decryptSecret(account.mfaSecretEncrypted, key);
      if (!verifyTotp(secret, body.otp))
        throw new ApiError(401, 'Code MFA incorrect', 'INVALID_MFA_CODE');
    }
    await createSession(account.id, account.organizationId);
    await audit({
      organizationId: account.organizationId,
      actorId: account.id,
      action: 'auth.login',
      entityType: 'session',
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
