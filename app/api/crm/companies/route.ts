import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const companyInput = z.object({
  name: z.string().trim().min(2).max(160),
  website: z.url().optional().or(z.literal('')),
  industry: z.string().trim().max(120).optional(),
  sizeLabel: z.string().trim().max(80).optional(),
  status: z
    .enum(['PROSPECT', 'ACTIVE', 'PAUSED', 'ARCHIVED'])
    .default('PROSPECT'),
});

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const companies = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select c.id, c.name, c.website, c.industry, c.size_label as "sizeLabel", c.status, c.created_at as "createdAt", c.updated_at as "updatedAt",
        count(distinct ct.id)::int as "contactCount", count(distinct o.id)::int as "opportunityCount"
      from companies c
      left join contacts ct on ct.company_id = c.id
      left join opportunities o on o.company_id = c.id
      where c.organization_id = ${session.organizationId}
      group by c.id order by c.updated_at desc`,
    );
    return Response.json({ companies });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(request, companyInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into companies (organization_id, name, website, industry, size_label, status, owner_id)
      values (${session.organizationId}, ${body.name}, ${body.website || null}, ${body.industry ?? null}, ${body.sizeLabel ?? null}, ${body.status}, ${session.id})
      returning id, name, website, industry, size_label as "sizeLabel", status, created_at as "createdAt", updated_at as "updatedAt"`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.company.created',
      entityType: 'company',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ company: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
