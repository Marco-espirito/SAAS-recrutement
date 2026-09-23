import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Entreprise invalide', 'VALIDATION_ERROR');
    const items = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select kind, id, title, detail, "occurredAt" from (
        select 'activity' as kind, a.id, a.title, coalesce(a.body, '') as detail, a.occurred_at as "occurredAt"
          from activities a where a.organization_id = ${session.organizationId} and a.company_id = ${id}
        union all
        select 'task', t.id, t.title, t.status, t.created_at from tasks t
          where t.organization_id = ${session.organizationId} and t.company_id = ${id}
        union all
        select 'document', d.id, d.name, d.mime_type, d.created_at from documents d
          where d.organization_id = ${session.organizationId} and d.company_id = ${id}
        union all
        select 'interview', i.id, a.role_title, i.status, i.starts_at from interviews i
          join applications a on a.id = i.application_id and a.organization_id = ${session.organizationId}
          where i.organization_id = ${session.organizationId} and a.company_id = ${id}
      ) timeline order by "occurredAt" desc limit 200`,
    );
    return Response.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}
