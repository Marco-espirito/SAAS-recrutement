import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { db, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const roleInput = z
  .object({ role: z.enum(['OWNER', 'ADMIN', 'RECRUITER', 'CANDIDATE']) })
  .strict();

async function targetMembership(organizationId: string, userId: string) {
  const rows = await tenantTransaction(
    organizationId,
    (sql) => sql<Array<{ role: string }>>`
    select role from memberships where organization_id = ${organizationId} and user_id = ${userId}`,
  );
  if (!rows[0]) throw new ApiError(404, 'Membre introuvable', 'NOT_FOUND');
  return rows[0];
}

async function ensureOwnerRemains(
  organizationId: string,
  currentRole: string,
  nextRole?: string,
) {
  if (currentRole !== 'OWNER' || nextRole === 'OWNER') return;
  const rows = await tenantTransaction(
    organizationId,
    (sql) => sql<Array<{ count: number }>>`
    select count(*)::int as count from memberships where organization_id = ${organizationId} and role = 'OWNER'`,
  );
  if ((rows[0]?.count ?? 0) <= 1)
    throw new ApiError(
      409,
      'L’organisation doit conserver au moins un propriétaire',
      'LAST_OWNER',
    );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const { userId } = await context.params;
    const parsedId = z.uuid().safeParse(userId);
    if (!parsedId.success)
      throw new ApiError(400, 'Membre invalide', 'VALIDATION_ERROR');
    const body = await readJson(request, roleInput);
    const target = await targetMembership(session.organizationId, userId);
    if (
      (target.role === 'OWNER' || body.role === 'OWNER') &&
      session.role !== 'OWNER'
    )
      throw new ApiError(
        403,
        'Seul un propriétaire peut gérer ce rôle',
        'FORBIDDEN',
      );
    await ensureOwnerRemains(session.organizationId, target.role, body.role);
    await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      update memberships set role = ${body.role}
      where organization_id = ${session.organizationId} and user_id = ${userId}`,
    );
    await db()`delete from sessions where user_id = ${userId} and organization_id = ${session.organizationId}`;
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'member.role.changed',
      entityType: 'membership',
      entityId: userId,
      request,
      metadata: { from: target.role, to: body.role },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const { userId } = await context.params;
    if (!z.uuid().safeParse(userId).success)
      throw new ApiError(400, 'Membre invalide', 'VALIDATION_ERROR');
    const target = await targetMembership(session.organizationId, userId);
    if (target.role === 'OWNER' && session.role !== 'OWNER')
      throw new ApiError(
        403,
        'Seul un propriétaire peut révoquer ce rôle',
        'FORBIDDEN',
      );
    await ensureOwnerRemains(session.organizationId, target.role);
    await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      delete from memberships where organization_id = ${session.organizationId} and user_id = ${userId}`,
    );
    await db()`delete from sessions where user_id = ${userId} and organization_id = ${session.organizationId}`;
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'member.access.revoked',
      entityType: 'membership',
      entityId: userId,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
