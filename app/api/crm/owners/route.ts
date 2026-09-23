import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const owners = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select u.id, u.name from memberships m join users u on u.id = m.user_id
      where m.organization_id = ${session.organizationId} and m.role in ('OWNER','ADMIN','RECRUITER')
      order by u.name`,
    );
    return Response.json({ owners });
  } catch (error) {
    return handleApiError(error);
  }
}
