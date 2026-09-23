import { z } from 'zod';
import { db } from '@/lib/server/db';
import { ApiError, handleApiError, readJson } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { createSessionToken, hashToken } from '@/lib/server/security';
import { emailProviderConfigured, sendSystemEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';

const input = z.object({ email: z.email().trim().max(254) }).strict();

export async function POST(request: Request) {
  try {
    if (
      !emailProviderConfigured() &&
      !['localhost', '127.0.0.1'].includes(new URL(env().APP_URL).hostname)
    )
      throw new ApiError(
        503,
        'Réinitialisation indisponible : envoi d’e-mails non configuré',
        'EMAIL_PROVIDER_REQUIRED',
      );
    const body = await readJson(request, input);
    await rateLimit(`password-reset:${body.email.toLowerCase()}`, 5, 3_600);
    const users = await db()<Array<{ id: string }>>`
      select id from users where email = ${body.email} limit 1`;
    let resetUrl: string | undefined;
    if (users[0]) {
      const token = createSessionToken();
      await db().begin(async (sql) => {
        await sql`delete from password_reset_tokens where user_id = ${users[0].id}`;
        await sql`insert into password_reset_tokens (token_hash, user_id, expires_at)
          values (${hashToken(token)}, ${users[0].id}, now() + interval '1 hour')`;
      });
      resetUrl = `${env().APP_URL}/?reset=${encodeURIComponent(token)}`;
      const delivered = await sendSystemEmail({
        to: body.email,
        subject: 'Réinitialisez votre mot de passe Nexora',
        text: `Réinitialisez votre mot de passe en ouvrant ce lien : ${resetUrl}`,
      });
      if (
        delivered ||
        !['localhost', '127.0.0.1'].includes(new URL(env().APP_URL).hostname)
      )
        resetUrl = undefined;
    }
    return Response.json({ ok: true, ...(resetUrl ? { resetUrl } : {}) });
  } catch (error) {
    return handleApiError(error);
  }
}
