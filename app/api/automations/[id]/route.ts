import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const updateInput = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    enabled: z.boolean().optional(),
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
      update automations set name = coalesce(${body.name ?? null}, name), enabled = coalesce(${body.enabled ?? null}, enabled), updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId}
      returning id, name, enabled, updated_at as "updatedAt"`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Automatisation introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'automation.updated',
      entityType: 'automation',
      entityId: id,
      request,
      metadata: { enabled: body.enabled },
    });
    return Response.json({ automation: rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(['OWNER', 'ADMIN']);
    const { id } = await context.params;
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      update automations set enabled = false, updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Automatisation introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'automation.disabled',
      entityType: 'automation',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
