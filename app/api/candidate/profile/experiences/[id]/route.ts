import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { experienceInput } from '../route';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Expérience invalide', 'VALIDATION_ERROR');
    const body = await readJson(request, experienceInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      update candidate_experiences e set type = ${body.type}, title = ${body.title}, organization_name = ${body.organizationName ?? null},
        location = ${body.location ?? null}, description = ${body.description ?? null}, started_at = ${body.startedAt ?? null},
        ended_at = ${body.current ? null : (body.endedAt ?? null)}, current = ${body.current}, skills = ${sql.array(body.skills)},
        position = ${body.position}, updated_at = now()
      from candidate_profiles p where e.id = ${id} and e.profile_id = p.id and p.user_id = ${session.id}
        and e.organization_id = ${session.organizationId} returning e.id`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Expérience introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.experience.updated',
      entityType: 'candidate_experience',
      entityId: id,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Expérience invalide', 'VALIDATION_ERROR');
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      delete from candidate_experiences e using candidate_profiles p
      where e.id = ${id} and e.profile_id = p.id and p.user_id = ${session.id} and e.organization_id = ${session.organizationId}
      returning e.id`,
    );
    if (!rows[0])
      throw new ApiError(404, 'Expérience introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.experience.deleted',
      entityType: 'candidate_experience',
      entityId: id,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
