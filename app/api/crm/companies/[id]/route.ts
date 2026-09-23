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
    website: z.url().or(z.literal('')).optional(),
    industry: z.string().trim().max(120).optional(),
    sizeLabel: z.string().trim().max(80).optional(),
    status: z.enum(['PROSPECT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    ownerId: z.uuid().nullable().optional(),
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
    const requestedOwnerId = body.ownerId;
    if (requestedOwnerId) {
      const owner = await tenantTransaction(
        session.organizationId,
        (sql) =>
          sql`select 1 from memberships where organization_id = ${session.organizationId} and user_id = ${requestedOwnerId}`,
      );
      if (!owner.length)
        throw new ApiError(400, 'Propriétaire invalide', 'VALIDATION_ERROR');
    }
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
        update companies set
          name = coalesce(${body.name ?? null}, name),
          website = coalesce(${body.website || null}, website),
          industry = coalesce(${body.industry ?? null}, industry),
          size_label = coalesce(${body.sizeLabel ?? null}, size_label),
          status = coalesce(${body.status ?? null}, status),
          tags = case when ${body.tags !== undefined} then ${body.tags ? sql.array(body.tags) : sql.array([])} else tags end,
          owner_id = case when ${body.ownerId !== undefined} then ${body.ownerId ?? null}::uuid else owner_id end,
          updated_at = now()
        where id = ${id} and organization_id = ${session.organizationId}
        returning id, name, website, industry, size_label as "sizeLabel", status, tags, owner_id as "ownerId", updated_at as "updatedAt"`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Entreprise introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.company.updated',
      entityType: 'company',
      entityId: id,
      request,
    });
    return Response.json({ company: rows[0] });
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
      update companies set status = 'ARCHIVED', updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Entreprise introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.company.archived',
      entityType: 'company',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
