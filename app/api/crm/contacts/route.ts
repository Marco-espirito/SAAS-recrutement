import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const contactInput = z.object({
  companyId: z.uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  title: z.string().trim().max(120).optional(),
  email: z.email().trim().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  linkedinUrl: z.url().optional().or(z.literal('')),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(request, contactInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into contacts (organization_id, company_id, first_name, last_name, title, email, phone, linkedin_url)
      select ${session.organizationId}, c.id, ${body.firstName}, ${body.lastName}, ${body.title ?? null}, ${body.email || null}, ${body.phone ?? null}, ${body.linkedinUrl || null}
      from companies c where c.id = ${body.companyId} and c.organization_id = ${session.organizationId}
      returning id, company_id as "companyId", first_name as "firstName", last_name as "lastName", title, email::text, phone, linkedin_url as "linkedinUrl"`,
    );
    if (!rows[0])
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Entreprise introuvable' } },
        { status: 404 },
      );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.contact.created',
      entityType: 'contact',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ contact: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
