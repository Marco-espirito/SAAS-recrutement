import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const updateInput = z
  .object({
    status: z
      .enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
      .optional(),
    notes: z.string().max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    const body = await readJson(request, updateInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      update interviews set status = coalesce(${body.status ?? null}, status), notes = coalesce(${body.notes ?? null}, notes)
      where id = ${id} and organization_id = ${session.organizationId}
      returning id, application_id as "applicationId", starts_at as "startsAt", ends_at as "endsAt", status, notes`,
    );
    if (!rows[0]) throw new ApiError(404, 'Entretien introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'interview.updated',
      entityType: 'interview',
      entityId: id,
      request,
      metadata: { status: body.status },
    });
    return Response.json({ interview: rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
