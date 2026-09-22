import { z } from 'zod';
import { createSession } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { ApiError, handleApiError, readJson } from '@/lib/server/http';
import { hashPassword, hashToken, verifyPassword } from '@/lib/server/security';

const input = z
  .object({
    token: z.string().min(32).max(200),
    name: z.string().trim().min(2).max(100).optional(),
    password: z.string().min(12).max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await readJson(request, input);
    const tokenHash = hashToken(body.token);
    const resolved = await db()<Array<{ organizationId: string }>>`
      select resolve_invitation_organization(${tokenHash}) as "organizationId"`;
    const organizationId = resolved[0]?.organizationId;
    if (!organizationId)
      throw new ApiError(
        400,
        'Invitation invalide ou expirée',
        'INVALID_TOKEN',
      );
    const result = await db().begin(async (sql) => {
      await sql`select set_config('app.organization_id', ${organizationId}, true)`;
      const invitations = await sql<
        Array<{ id: string; email: string; role: string }>
      >`
        select id, email::text, role from organization_invitations
        where token_hash = ${tokenHash} and accepted_at is null and revoked_at is null and expires_at > now()
        for update`;
      const invitation = invitations[0];
      if (!invitation)
        throw new ApiError(
          400,
          'Invitation invalide ou expirée',
          'INVALID_TOKEN',
        );
      const users = await sql<Array<{ id: string; passwordHash: string }>>`
        select id, password_hash as "passwordHash" from users where email = ${invitation.email}`;
      let userId = users[0]?.id;
      if (users[0]) {
        if (!(await verifyPassword(body.password, users[0].passwordHash)))
          throw new ApiError(
            401,
            'Mot de passe incorrect',
            'INVALID_CREDENTIALS',
          );
      } else {
        if (!body.name)
          throw new ApiError(
            400,
            'Le nom est requis pour créer le compte',
            'NAME_REQUIRED',
          );
        const created = await sql<
          Array<{ id: string }>
        >`insert into users (name, email, password_hash, email_verified_at)
          values (${body.name}, ${invitation.email}, ${await hashPassword(body.password)}, now()) returning id`;
        userId = created[0].id;
      }
      await sql`insert into memberships (organization_id, user_id, role)
        values (${organizationId}, ${userId}, ${invitation.role}) on conflict (organization_id, user_id) do nothing`;
      await sql`update organization_invitations set accepted_at = now() where id = ${invitation.id}`;
      return { invitationId: invitation.id, userId: userId as string };
    });
    await createSession(result.userId, organizationId);
    await audit({
      organizationId,
      actorId: result.userId,
      action: 'invitation.accepted',
      entityType: 'organization_invitation',
      entityId: result.invitationId,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
