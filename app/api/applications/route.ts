import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { enqueueAutomationEvent } from '@/lib/server/automation-engine';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const applicationInput = z
  .object({
    companyName: z.string().trim().min(2).max(160).optional(),
    companyId: z.uuid().optional(),
    candidateId: z.uuid().optional(),
    opportunityId: z.uuid().optional(),
    roleTitle: z.string().trim().min(2).max(180),
    stage: z
      .enum([
        'TO_APPLY',
        'SENT',
        'FOLLOW_UP',
        'INTERVIEW',
        'OFFER',
        'REJECTED',
        'PLACED',
      ])
      .default('TO_APPLY'),
    matchScore: z.number().int().min(0).max(100).optional(),
  })
  .refine(
    (value) => value.companyName || value.companyId || value.opportunityId,
    'Une entreprise ou une opportunité est requise',
  );

export async function GET() {
  try {
    const session = await requireSession();
    const applications = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select a.id, a.role_title as "roleTitle", a.stage, a.match_score as "matchScore", a.applied_at as "appliedAt",
        a.last_contact_at as "lastContactAt", a.created_at as "createdAt", a.updated_at as "updatedAt",
        (a.stage in ('SENT','FOLLOW_UP') and coalesce(a.last_contact_at, a.applied_at, a.created_at) < now() - interval '7 days') as "needsFollowUp",
        c.id as "companyId", c.name as "companyName", a.candidate_id as "candidateId", a.opportunity_id as "opportunityId",
        concat(candidate.first_name, ' ', candidate.last_name) as "candidateName"
      from applications a left join companies c on c.id = a.company_id
      left join candidates candidate on candidate.id = a.candidate_id
      where a.organization_id = ${session.organizationId}
      order by a.updated_at desc`,
    );
    return Response.json({ applications });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, applicationInput);
    const application = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        let companyId = body.companyId;
        let companyName = body.companyName;
        if (body.opportunityId) {
          const opportunities = await sql<
            Array<{ companyId: string; companyName: string }>
          >`
            select o.company_id as "companyId", c.name as "companyName"
            from opportunities o join companies c on c.id = o.company_id
            where o.id = ${body.opportunityId} and o.organization_id = ${session.organizationId}`;
          if (!opportunities[0])
            throw new ApiError(404, 'Opportunité introuvable', 'NOT_FOUND');
          companyId = opportunities[0].companyId;
          companyName = opportunities[0].companyName;
        } else if (companyId) {
          const companies = await sql<Array<{ id: string; name: string }>>`
            select id, name from companies where id = ${companyId} and organization_id = ${session.organizationId}`;
          if (!companies[0])
            throw new ApiError(404, 'Entreprise introuvable', 'NOT_FOUND');
          companyName = companies[0].name;
        } else {
          const companies = await sql<Array<{ id: string }>>`
            insert into companies (organization_id, name, owner_id)
            values (${session.organizationId}, ${companyName!}, ${session.id})
            on conflict (organization_id, name) do update set updated_at = now()
            returning id`;
          companyId = companies[0].id;
        }
        if (body.candidateId) {
          const candidates = await sql`
            select id from candidates where id = ${body.candidateId} and organization_id = ${session.organizationId}`;
          if (!candidates[0])
            throw new ApiError(404, 'Candidat introuvable', 'NOT_FOUND');
        }
        const rows = await sql<Array<{ id: string }>>`
        insert into applications (organization_id, company_id, candidate_id, opportunity_id, role_title, stage, match_score, applied_at)
        values (${session.organizationId}, ${companyId!}, ${body.candidateId ?? null}, ${body.opportunityId ?? null}, ${body.roleTitle}, ${body.stage}, ${body.matchScore ?? null}, ${body.stage === 'SENT' ? new Date() : null})
        returning id, role_title as "roleTitle", stage, match_score as "matchScore", created_at as "createdAt"`;
        await sql`insert into activities (organization_id, company_id, application_id, actor_id, type, title, metadata)
        values (${session.organizationId}, ${companyId!}, ${rows[0].id}, ${session.id}, 'STATUS_CHANGE', 'Candidature créée', ${sql.json({ stage: body.stage })})`;
        return {
          ...rows[0],
          companyId,
          companyName,
          candidateId: body.candidateId,
          opportunityId: body.opportunityId,
        };
      },
    );
    await enqueueAutomationEvent(
      session.organizationId,
      'APPLICATION_CREATED',
      { applicationId: application.id, stage: body.stage },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'application.created',
      entityType: 'application',
      entityId: application.id,
      request,
    });
    return Response.json({ application }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
