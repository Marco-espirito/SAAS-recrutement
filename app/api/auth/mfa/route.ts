import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import {
  createMfaSecret,
  decryptSecret,
  encryptSecret,
  verifyPassword,
  verifyTotp,
} from '@/lib/server/security';

const input = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('setup'),
    password: z.string().min(1).max(128),
  }),
  z.object({ action: z.literal('confirm'), code: z.string().regex(/^\d{6}$/) }),
  z.object({
    action: z.literal('disable'),
    password: z.string().min(1).max(128),
    code: z.string().regex(/^\d{6}$/),
  }),
]);

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    const key = env().APP_ENCRYPTION_KEY;
    if (!key)
      throw new ApiError(
        503,
        'Le chiffrement MFA n’est pas configuré',
        'MFA_NOT_CONFIGURED',
      );
    const users = await db()<
      Array<{
        email: string;
        passwordHash: string;
        encrypted: string | null;
        enabled: boolean;
      }>
    >`
      select email::text, password_hash as "passwordHash", mfa_secret_encrypted as encrypted, mfa_enabled as enabled
      from users where id = ${session.id}`;
    const user = users[0];
    if (!user) throw new ApiError(404, 'Utilisateur introuvable', 'NOT_FOUND');
    if (body.action === 'setup') {
      if (user.enabled)
        throw new ApiError(
          409,
          'Le MFA est déjà actif. Désactivez-le avant de le reconfigurer.',
          'MFA_ALREADY_ENABLED',
        );
      if (!(await verifyPassword(body.password, user.passwordHash)))
        throw new ApiError(
          401,
          'Mot de passe incorrect',
          'INVALID_CREDENTIALS',
        );
      const secret = createMfaSecret();
      await db()`update users set mfa_secret_encrypted = ${encryptSecret(secret, key)}, mfa_enabled = false, updated_at = now() where id = ${session.id}`;
      const issuer = encodeURIComponent('Nexora');
      const account = encodeURIComponent(user.email);
      return Response.json({
        secret,
        otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&digits=6&period=30`,
      });
    }
    if (!user.encrypted)
      throw new ApiError(
        409,
        'Initialisez d’abord le MFA',
        'MFA_SETUP_REQUIRED',
      );
    const secret = decryptSecret(user.encrypted, key);
    if (!verifyTotp(secret, body.code))
      throw new ApiError(401, 'Code MFA incorrect', 'INVALID_MFA_CODE');
    if (body.action === 'disable') {
      if (!(await verifyPassword(body.password, user.passwordHash)))
        throw new ApiError(
          401,
          'Mot de passe incorrect',
          'INVALID_CREDENTIALS',
        );
      await db()`update users set mfa_secret_encrypted = null, mfa_enabled = false, updated_at = now() where id = ${session.id}`;
      await audit({
        organizationId: session.organizationId,
        actorId: session.id,
        action: 'auth.mfa.disabled',
        entityType: 'user',
        entityId: session.id,
        request,
      });
      return Response.json({ enabled: false });
    }
    await db()`update users set mfa_enabled = true, updated_at = now() where id = ${session.id}`;
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'auth.mfa.enabled',
      entityType: 'user',
      entityId: session.id,
      request,
    });
    return Response.json({ enabled: true });
  } catch (error) {
    return handleApiError(error);
  }
}
