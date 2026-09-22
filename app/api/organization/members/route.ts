import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const members = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select u.id, u.name, u.email::text, m.role, m.created_at as "joinedAt",
        (u.email_verified_at is not null) as "emailVerified", u.mfa_enabled as "mfaEnabled"
      from memberships m join users u on u.id = m.user_id
      where m.organization_id = ${session.organizationId}
      order by case m.role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, u.name`,
    );
    return Response.json({ members });
  } catch (error) {
    return handleApiError(error);
  }
}
