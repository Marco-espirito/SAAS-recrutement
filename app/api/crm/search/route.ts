import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const parsed = z
      .string()
      .trim()
      .min(2)
      .max(100)
      .safeParse(new URL(request.url).searchParams.get('q'));
    if (!parsed.success)
      throw new ApiError(400, 'Recherche invalide', 'VALIDATION_ERROR');
    const q = parsed.data.toLowerCase();
    const results = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select kind, id, label, detail, "companyId" from (
        select 'company' as kind, id, name as label, coalesce(industry, '') as detail, id as "companyId" from companies
          where organization_id = ${session.organizationId} and strpos(lower(name), ${q}) > 0
        union all
        select 'contact', id, first_name || ' ' || last_name, coalesce(email::text, ''), company_id from contacts
          where organization_id = ${session.organizationId} and strpos(lower(first_name || ' ' || last_name || ' ' || coalesce(email::text, '')), ${q}) > 0
        union all
        select 'opportunity', id, title, coalesce(location, ''), company_id from opportunities
          where organization_id = ${session.organizationId} and strpos(lower(title), ${q}) > 0
        union all
        select 'candidate', id, first_name || ' ' || last_name, coalesce(headline, ''), null::uuid from candidates
          where organization_id = ${session.organizationId} and strpos(lower(first_name || ' ' || last_name || ' ' || coalesce(email::text, '')), ${q}) > 0
      ) results order by kind, label limit 50`,
    );
    return Response.json({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
