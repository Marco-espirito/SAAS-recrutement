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
      throw new ApiError(400, 'Candidat invalide', 'VALIDATION_ERROR');
    const comments = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select c.id, c.body, c.created_at as "createdAt", u.name as "authorName"
      from candidate_comments c left join users u on u.id = c.author_id
      where c.organization_id = ${session.organizationId} and c.candidate_id = ${id}
      order by c.created_at desc limit 100`,
    );
    return Response.json({ comments });
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
      throw new ApiError(400, 'Candidat invalide', 'VALIDATION_ERROR');
    const body = await readJson(
      request,
      z.object({ body: z.string().trim().min(1).max(5_000) }).strict(),
    );
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into candidate_comments (organization_id, candidate_id, author_id, body)
      select ${session.organizationId}, c.id, ${session.id}, ${body.body} from candidates c
      where c.id = ${id} and c.organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0]) throw new ApiError(404, 'Candidat introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.commented',
      entityType: 'candidate_comment',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
