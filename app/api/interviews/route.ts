import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const interviewInput = z
  .object({
    applicationId: z.uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().trim().max(300).optional(),
    meetingUrl: z.url().optional().or(z.literal('')),
    notes: z.string().max(10_000).optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    path: ['endsAt'],
    message: 'Fin invalide',
  });

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const interviews = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select i.id, i.application_id as "applicationId", i.starts_at as "startsAt", i.ends_at as "endsAt", i.location,
        i.meeting_url as "meetingUrl", i.status, i.notes, a.role_title as "roleTitle", c.name as "companyName",
        concat(candidate.first_name, ' ', candidate.last_name) as "candidateName"
      from interviews i join applications a on a.id = i.application_id
      left join companies c on c.id = a.company_id left join candidates candidate on candidate.id = a.candidate_id
      where i.organization_id = ${session.organizationId} order by i.starts_at asc`,
    );
    return Response.json({ interviews });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(request, interviewInput);
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const inserted = await sql<Array<{ id: string }>>`
        insert into interviews (organization_id, application_id, starts_at, ends_at, location, meeting_url, notes)
        select ${session.organizationId}, a.id, ${body.startsAt}, ${body.endsAt}, ${body.location ?? null}, ${body.meetingUrl || null}, ${body.notes ?? null}
        from applications a where a.id = ${body.applicationId} and a.organization_id = ${session.organizationId}
        returning id, application_id as "applicationId", starts_at as "startsAt", ends_at as "endsAt", location, meeting_url as "meetingUrl", status, notes`;
        if (!inserted[0])
          throw new ApiError(404, 'Candidature introuvable', 'NOT_FOUND');
        await sql`update applications set stage = 'INTERVIEW', updated_at = now() where id = ${body.applicationId}`;
        return inserted;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'interview.created',
      entityType: 'interview',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ interview: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
