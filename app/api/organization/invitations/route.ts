import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { emailProviderConfigured, sendSystemEmail } from '@/lib/server/email';
import { env } from '@/lib/server/env';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { createSessionToken, hashToken } from '@/lib/server/security';

const input = z
  .object({
    email: z.email().trim().max(254),
    role: z.enum(['ADMIN', 'RECRUITER', 'CANDIDATE']),
  })
  .strict();

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const invitations = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select i.id, i.email::text, i.role, i.expires_at as "expiresAt", i.created_at as "createdAt",
        i.accepted_at as "acceptedAt", i.revoked_at as "revokedAt", u.name as "invitedBy"
      from organization_invitations i left join users u on u.id = i.invited_by
      where i.organization_id = ${session.organizationId}
      order by i.created_at desc limit 100`,
    );
    return Response.json({ invitations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const body = await readJson(request, input);
    if (body.role === 'ADMIN' && session.role !== 'OWNER')
      return Response.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Seul un propriétaire peut inviter un administrateur',
          },
        },
        { status: 403 },
      );
    const token = createSessionToken();
    const invitations = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const existing =
          await sql`select 1 from memberships m join users u on u.id = m.user_id
        where m.organization_id = ${session.organizationId} and u.email = ${body.email} limit 1`;
        if (existing.length)
          throw new ApiError(
            409,
            'Cette personne est déjà membre',
            'ALREADY_MEMBER',
          );
        await sql`update organization_invitations set revoked_at = now()
        where organization_id = ${session.organizationId} and email = ${body.email}
          and accepted_at is null and revoked_at is null`;
        return sql<Array<{ id: string }>>`insert into organization_invitations
        (organization_id, email, role, token_hash, invited_by, expires_at)
        values (${session.organizationId}, ${body.email}, ${body.role}, ${hashToken(token)}, ${session.id}, now() + interval '7 days')
        returning id, email::text, role, expires_at as "expiresAt", created_at as "createdAt"`;
      },
    );
    const inviteUrl = `${env().APP_URL}/?invite=${encodeURIComponent(token)}`;
    const delivered = emailProviderConfigured()
      ? await sendSystemEmail({
          to: body.email,
          subject: `Invitation à rejoindre ${session.organizationName}`,
          text: `${session.name} vous invite à rejoindre ${session.organizationName} sur Nexora (${body.role}). Acceptez ici : ${inviteUrl}`,
        })
      : false;
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'invitation.created',
      entityType: 'organization_invitation',
      entityId: invitations[0].id,
      request,
      metadata: { email: body.email, role: body.role, delivered },
    });
    return Response.json(
      {
        invitation: invitations[0],
        delivered,
        ...(!delivered &&
        ['localhost', '127.0.0.1'].includes(new URL(env().APP_URL).hostname)
          ? { inviteUrl }
          : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
