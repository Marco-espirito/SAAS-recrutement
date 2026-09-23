import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const data = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const [companies, contacts, opportunities, tasks, activities] =
          await Promise.all([
            sql`select id, name, website, industry, size_label as "sizeLabel", status, tags, owner_id as "ownerId", updated_at as "updatedAt" from companies where organization_id = ${session.organizationId} order by updated_at desc limit 100`,
            sql`select c.id, c.company_id as "companyId", c.first_name as "firstName", c.last_name as "lastName", c.title, c.email::text from contacts c where c.organization_id = ${session.organizationId} order by c.updated_at desc limit 200`,
            sql`select id, company_id as "companyId", title, status, location, employment_type as "employmentType", updated_at as "updatedAt" from opportunities where organization_id = ${session.organizationId} order by updated_at desc limit 100`,
            sql`select id, company_id as "companyId", title, status, due_at as "dueAt" from tasks where organization_id = ${session.organizationId} order by due_at asc nulls last limit 100`,
            sql`select id, company_id as "companyId", type, title, body, occurred_at as "occurredAt" from activities where organization_id = ${session.organizationId} order by occurred_at desc limit 100`,
          ]);
        return { companies, contacts, opportunities, tasks, activities };
      },
    );
    return Response.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
