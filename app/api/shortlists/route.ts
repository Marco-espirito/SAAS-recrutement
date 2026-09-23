import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const shortlists = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select s.id, s.name, s.opportunity_id as "opportunityId", o.title as "opportunityTitle", count(sc.candidate_id)::int as "candidateCount"
      from shortlists s left join opportunities o on o.id = s.opportunity_id
      left join shortlist_candidates sc on sc.shortlist_id = s.id
      where s.organization_id = ${session.organizationId}
      group by s.id, o.title order by s.updated_at desc`,
    );
    return Response.json({ shortlists });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(
      request,
      z
        .object({
          name: z.string().trim().min(2).max(120),
          opportunityId: z.uuid().nullable().optional(),
        })
        .strict(),
    );
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        if (body.opportunityId) {
          const opportunity =
            await sql`select 1 from opportunities where id = ${body.opportunityId} and organization_id = ${session.organizationId}`;
          if (!opportunity.length)
            throw new ApiError(404, 'Poste introuvable', 'NOT_FOUND');
        }
        return sql<
          Array<{ id: string }>
        >`insert into shortlists (organization_id, opportunity_id, name, created_by)
        values (${session.organizationId}, ${body.opportunityId ?? null}, ${body.name}, ${session.id}) returning id`;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'shortlist.created',
      entityType: 'shortlist',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
