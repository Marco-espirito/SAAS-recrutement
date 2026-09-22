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
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5_000).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request, updateInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      update tasks set
        title = coalesce(${body.title ?? null}, title),
        description = coalesce(${body.description ?? null}, description),
        status = coalesce(${body.status ?? null}, status),
        due_at = case when ${body.dueAt === null} then null else coalesce(${body.dueAt ?? null}::timestamptz, due_at) end,
        updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId}
      returning id, title, description, status, due_at as "dueAt", updated_at as "updatedAt"`,
    );
    if (!rows[0]) throw new ApiError(404, 'Tâche introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'task.updated',
      entityType: 'task',
      entityId: id,
      request,
      metadata: { status: body.status },
    });
    return Response.json({ task: rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}
