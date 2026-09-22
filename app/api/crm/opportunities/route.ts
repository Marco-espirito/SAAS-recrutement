import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const opportunityInput = z.object({
  companyId: z.uuid(),
  title: z.string().trim().min(2).max(180),
  status: z
    .enum(['DRAFT', 'OPEN', 'ON_HOLD', 'FILLED', 'CLOSED'])
    .default('OPEN'),
  location: z.string().trim().max(160).optional(),
  employmentType: z.string().trim().max(80).optional(),
  description: z.string().trim().max(20_000).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(request, opportunityInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into opportunities (organization_id, company_id, title, status, location, employment_type, description, owner_id)
      select ${session.organizationId}, c.id, ${body.title}, ${body.status}, ${body.location ?? null}, ${body.employmentType ?? null}, ${body.description ?? null}, ${session.id}
      from companies c where c.id = ${body.companyId} and c.organization_id = ${session.organizationId}
      returning id, company_id as "companyId", title, status, location, employment_type as "employmentType", description`,
    );
    if (!rows[0])
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Entreprise introuvable' } },
        { status: 404 },
      );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.opportunity.created',
      entityType: 'opportunity',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ opportunity: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
