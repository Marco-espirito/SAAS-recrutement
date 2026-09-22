import { z } from 'zod';
import { createSession } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { ApiError, handleApiError, readJson } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import {
  createSessionToken,
  hashPassword,
  hashToken,
} from '@/lib/server/security';
import { emailProviderConfigured, sendSystemEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';

const registration = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().trim().max(254),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(120),
  accountType: z.enum(['CANDIDATE', 'RECRUITER']).default('RECRUITER'),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request, registration);
    await rateLimit(`register:${body.email.toLowerCase()}`, 5, 3_600);
    const configuration = env();
    if (configuration.REQUIRE_EMAIL_VERIFICATION && !emailProviderConfigured())
      throw new ApiError(
        503,
        'La validation e-mail est requise mais le fournisseur e-mail est indisponible',
        'EMAIL_PROVIDER_REQUIRED',
      );
    const passwordHash = await hashPassword(body.password);
    const verificationToken = createSessionToken();
    const slugBase =
      body.organizationName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'organisation';
    const result = await db().begin(async (sql) => {
      const existing =
        await sql`select 1 from users where email = ${body.email} limit 1`;
      if (existing.length)
        throw new ApiError(
          409,
          'Un compte existe déjà avec cette adresse',
          'EMAIL_EXISTS',
        );
      const organizations = await sql<
        Array<{ id: string }>
      >`insert into organizations (name, slug)
        values (${body.organizationName}, ${`${slugBase}-${crypto.randomUUID().slice(0, 8)}`}) returning id`;
      const users = await sql<
        Array<{ id: string }>
      >`insert into users (name, email, password_hash, email_verified_at)
        values (${body.name}, ${body.email}, ${passwordHash}, ${configuration.REQUIRE_EMAIL_VERIFICATION ? null : new Date()}) returning id`;
      const organizationId = organizations[0].id;
      const userId = users[0].id;
      const role = body.accountType === 'CANDIDATE' ? 'CANDIDATE' : 'OWNER';
      await sql`insert into memberships (organization_id, user_id, role) values (${organizationId}, ${userId}, ${role})`;
      if (configuration.REQUIRE_EMAIL_VERIFICATION)
        await sql`insert into email_verification_tokens (token_hash, user_id, expires_at)
          values (${hashToken(verificationToken)}, ${userId}, now() + interval '24 hours')`;
      return { organizationId, userId };
    });
    const verificationUrl = `${configuration.APP_URL}/?verify=${encodeURIComponent(verificationToken)}`;
    if (configuration.REQUIRE_EMAIL_VERIFICATION) {
      await sendSystemEmail({
        to: body.email,
        subject: 'Validez votre adresse Nexora',
        text: `Validez votre adresse en ouvrant ce lien : ${verificationUrl}`,
      });
    } else {
      await createSession(result.userId, result.organizationId);
    }
    await audit({
      organizationId: result.organizationId,
      actorId: result.userId,
      action: 'auth.register',
      entityType: 'user',
      entityId: result.userId,
      request,
      metadata: { accountType: body.accountType },
    });
    return Response.json(
      {
        ok: true,
        verificationRequired: configuration.REQUIRE_EMAIL_VERIFICATION,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
