import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Shortlist invalide', 'VALIDATION_ERROR');
    const candidates = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select c.id, c.first_name as "firstName", c.last_name as "lastName", c.headline, c.skills, sc.added_at as "addedAt"
      from shortlist_candidates sc join candidates c on c.id = sc.candidate_id
      where sc.organization_id = ${session.organizationId} and sc.shortlist_id = ${id}
      order by sc.added_at desc`,
    );
    return Response.json({ candidates });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Shortlist invalide', 'VALIDATION_ERROR');
    const body = await readJson(
      request,
      z.object({ candidateId: z.uuid() }).strict(),
    );
    const inserted = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const rows =
          await sql`insert into shortlist_candidates (organization_id, shortlist_id, candidate_id, added_by)
        select ${session.organizationId}, s.id, c.id, ${session.id}
        from shortlists s cross join candidates c
        where s.id = ${id} and s.organization_id = ${session.organizationId}
          and c.id = ${body.candidateId} and c.organization_id = ${session.organizationId}
        on conflict (shortlist_id, candidate_id) do nothing returning candidate_id`;
        return rows.length > 0;
      },
    );
    if (!inserted)
      throw new ApiError(404, 'Candidat absent ou déjà présent', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'shortlist.candidate.added',
      entityType: 'shortlist',
      entityId: id,
      request,
      metadata: { candidateId: body.candidateId },
    });
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
