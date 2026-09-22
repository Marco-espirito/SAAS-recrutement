import { db } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession();
    const organizations = await db()`
      select o.id, o.name, m.role, o.id = ${session.organizationId}::uuid as current
      from memberships m join organizations o on o.id = m.organization_id
      where m.user_id = ${session.id}
      order by current desc, o.name asc`;
    return Response.json({ organizations });
  } catch (error) {
    return handleApiError(error);
  }
}
