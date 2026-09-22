import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const updateInput = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: z.email().max(254).optional(),
    headline: z.string().trim().max(200).optional(),
    location: z.string().trim().max(160).optional(),
    skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    source: z.string().trim().max(100).optional(),
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
      update candidates set first_name = coalesce(${body.firstName ?? null}, first_name), last_name = coalesce(${body.lastName ?? null}, last_name),
        email = coalesce(${body.email ?? null}, email), headline = coalesce(${body.headline ?? null}, headline),
        location = coalesce(${body.location ?? null}, location), skills = coalesce(${body.skills ? sql.json(jsonValue(body.skills)) : null}, skills),
        source = coalesce(${body.source ?? null}, source), updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId}
      returning id, first_name as "firstName", last_name as "lastName", email::text, headline, location, skills, source, updated_at as "updatedAt"`,
    );
    if (!rows[0]) throw new ApiError(404, 'Candidat introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.updated',
      entityType: 'candidate',
      entityId: id,
      request,
    });
    return Response.json({ candidate: rows[0] });
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
      delete from candidates where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0]) throw new ApiError(404, 'Candidat introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.deleted',
      entityType: 'candidate',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
