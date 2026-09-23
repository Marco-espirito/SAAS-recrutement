import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Lien invalide', 'VALIDATION_ERROR');
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      update client_portal_links set revoked_at = now()
      where id = ${id} and organization_id = ${session.organizationId} and revoked_at is null returning id`,
    );
    if (!rows.length) throw new ApiError(404, 'Lien introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'client_portal.link.revoked',
      entityType: 'client_portal_link',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
