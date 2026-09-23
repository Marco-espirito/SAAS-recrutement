import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Notification invalide', 'VALIDATION_ERROR');
    const updated = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      update notifications set read_at = coalesce(read_at, now())
      where id = ${id} and organization_id = ${session.organizationId} and user_id = ${session.id}
      returning id`,
    );
    if (!updated[0])
      throw new ApiError(404, 'Notification introuvable', 'NOT_FOUND');
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
