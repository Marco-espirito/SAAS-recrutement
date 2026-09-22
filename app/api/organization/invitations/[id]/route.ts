import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Invitation invalide', 'VALIDATION_ERROR');
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      update organization_invitations set revoked_at = now()
      where id = ${id} and organization_id = ${session.organizationId} and accepted_at is null and revoked_at is null
      returning id`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Invitation active introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'invitation.revoked',
      entityType: 'organization_invitation',
      entityId: id,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
