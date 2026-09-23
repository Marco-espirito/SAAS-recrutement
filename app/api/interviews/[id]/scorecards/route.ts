import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const input = z
  .object({
    criteria: z
      .array(
        z.object({
          label: z.string().trim().min(2).max(100),
          score: z.number().int().min(1).max(5),
          comment: z.string().trim().max(500).optional(),
        }),
      )
      .min(1)
      .max(20),
    recommendation: z.enum(['STRONG_YES', 'YES', 'MIXED', 'NO', 'STRONG_NO']),
    notes: z.string().trim().max(5_000).optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Entretien invalide', 'VALIDATION_ERROR');
    const scorecards = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select s.id, s.criteria, s.recommendation, s.notes, s.reviewer_id as "reviewerId", u.name as "reviewerName", s.updated_at as "updatedAt"
      from interview_scorecards s join users u on u.id = s.reviewer_id
      where s.organization_id = ${session.organizationId} and s.interview_id = ${id}
      order by s.updated_at desc`,
    );
    return Response.json({ scorecards });
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
      throw new ApiError(400, 'Entretien invalide', 'VALIDATION_ERROR');
    const body = await readJson(request, input);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into interview_scorecards (organization_id, interview_id, reviewer_id, criteria, recommendation, notes)
      select ${session.organizationId}, i.id, ${session.id}, ${sql.json(jsonValue(body.criteria))}, ${body.recommendation}, ${body.notes ?? null}
      from interviews i where i.id = ${id} and i.organization_id = ${session.organizationId}
      on conflict (organization_id, interview_id, reviewer_id) do update set
        criteria = excluded.criteria, recommendation = excluded.recommendation, notes = excluded.notes, updated_at = now()
      returning id`,
    );
    if (!rows[0]) throw new ApiError(404, 'Entretien introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'interview.scorecard.saved',
      entityType: 'interview_scorecard',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ id: rows[0].id });
  } catch (error) {
    return handleApiError(error);
  }
}
