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
    title: z.string().trim().min(2).max(200).optional(),
    status: z.enum(['DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CLOSED']).optional(),
    location: z.string().trim().max(160).optional(),
    employmentType: z.string().trim().max(80).optional(),
    description: z.string().max(20_000).optional(),
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
      update opportunities set
        title = coalesce(${body.title ?? null}, title), status = coalesce(${body.status ?? null}, status),
        location = coalesce(${body.location ?? null}, location), employment_type = coalesce(${body.employmentType ?? null}, employment_type),
        description = coalesce(${body.description ?? null}, description), updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId}
      returning id, company_id as "companyId", title, status, location, employment_type as "employmentType", description, updated_at as "updatedAt"`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Opportunité introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.opportunity.updated',
      entityType: 'opportunity',
      entityId: id,
      request,
    });
    return Response.json({ opportunity: rows[0] });
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
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      update opportunities set status = 'CLOSED', updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Opportunité introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.opportunity.closed',
      entityType: 'opportunity',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
