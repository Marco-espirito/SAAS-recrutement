import { z } from 'zod';
import { db } from '@/lib/server/db';
import { emailProviderConfigured, sendSystemEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';
import { ApiError, handleApiError, readJson } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import {
  createSessionToken,
  hashToken,
  verifyPassword,
} from '@/lib/server/security';

const input = z
  .object({
    email: z.email().trim().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await readJson(request, input);
    await rateLimit(`verify-resend:${body.email.toLowerCase()}`, 3, 3_600);
    if (!emailProviderConfigured())
      throw new ApiError(
        503,
        'Le fournisseur e-mail est indisponible',
        'EMAIL_PROVIDER_REQUIRED',
      );
    const users = await db()<
      Array<{ id: string; passwordHash: string; verified: boolean }>
    >`
      select id, password_hash as "passwordHash", email_verified_at is not null as verified from users where email = ${body.email} limit 1`;
    const user = users[0];
    if (!user || !(await verifyPassword(body.password, user.passwordHash)))
      throw new ApiError(401, 'Identifiants incorrects', 'INVALID_CREDENTIALS');
    if (user.verified) return Response.json({ ok: true });
    const token = createSessionToken();
    await db().begin(async (sql) => {
      await sql`delete from email_verification_tokens where user_id = ${user.id}`;
      await sql`insert into email_verification_tokens (token_hash, user_id, expires_at)
        values (${hashToken(token)}, ${user.id}, now() + interval '24 hours')`;
    });
    await sendSystemEmail({
      to: body.email,
      subject: 'Validez votre adresse Nexora',
      text: `Validez votre adresse en ouvrant ce lien : ${env().APP_URL}/?verify=${encodeURIComponent(token)}`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
