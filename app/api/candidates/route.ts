import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const candidateInput = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.email().max(254).optional().or(z.literal('')),
  headline: z.string().trim().max(200).optional(),
  location: z.string().trim().max(160).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  source: z.string().trim().max(100).optional(),
});

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const candidates = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select c.id, c.first_name as "firstName", c.last_name as "lastName", c.email::text,
        c.headline, c.location, c.skills, c.source, c.created_at as "createdAt", c.updated_at as "updatedAt",
        count(a.id)::int as "applicationCount"
      from candidates c left join applications a on a.candidate_id = c.id
      where c.organization_id = ${session.organizationId}
      group by c.id order by c.updated_at desc limit 500`,
    );
    return Response.json({ candidates });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(request, candidateInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into candidates (organization_id, first_name, last_name, email, headline, location, skills, source)
      values (${session.organizationId}, ${body.firstName}, ${body.lastName}, ${body.email || null}, ${body.headline ?? null}, ${body.location ?? null}, ${sql.json(jsonValue(body.skills))}, ${body.source ?? null})
      returning id, first_name as "firstName", last_name as "lastName", email::text, headline, location, skills, source, created_at as "createdAt"`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.created',
      entityType: 'candidate',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ candidate: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
