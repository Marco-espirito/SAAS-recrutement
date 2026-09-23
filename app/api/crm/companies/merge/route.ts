import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const input = z
  .object({ primaryId: z.uuid(), duplicateId: z.uuid() })
  .strict()
  .refine((value) => value.primaryId !== value.duplicateId);

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const body = await readJson(request, input);
    const merged = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const companies = await sql<
          Array<{ id: string }>
        >`select id from companies where organization_id = ${session.organizationId} and id in (${body.primaryId}, ${body.duplicateId}) for update`;
        if (companies.length !== 2)
          throw new ApiError(404, 'Entreprise introuvable', 'NOT_FOUND');
        await sql`update companies p set
          tags = coalesce((select array_agg(distinct tag) from unnest(p.tags || d.tags) tag), '{}'::text[]),
          website = coalesce(nullif(p.website, ''), d.website),
          industry = coalesce(nullif(p.industry, ''), d.industry),
          size_label = coalesce(nullif(p.size_label, ''), d.size_label),
          owner_id = coalesce(p.owner_id, d.owner_id), updated_at = now()
          from companies d where p.id = ${body.primaryId} and d.id = ${body.duplicateId}
            and p.organization_id = ${session.organizationId} and d.organization_id = ${session.organizationId}`;
        await sql`update contacts set company_id = ${body.primaryId}, updated_at = now() where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`update opportunities set company_id = ${body.primaryId}, updated_at = now() where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`update applications set company_id = ${body.primaryId}, updated_at = now() where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`update activities set company_id = ${body.primaryId} where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`update tasks set company_id = ${body.primaryId}, updated_at = now() where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`update documents set company_id = ${body.primaryId} where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`update client_portal_links set company_id = ${body.primaryId} where organization_id = ${session.organizationId} and company_id = ${body.duplicateId}`;
        await sql`delete from companies where id = ${body.duplicateId} and organization_id = ${session.organizationId}`;
        return true;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.company.merged',
      entityType: 'company',
      entityId: body.primaryId,
      request,
      metadata: { duplicateId: body.duplicateId },
    });
    return Response.json({ merged });
  } catch (error) {
    return handleApiError(error);
  }
}
