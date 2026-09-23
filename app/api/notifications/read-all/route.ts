import { tenantTransaction } from '@/lib/server/db';
import {
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      update notifications set read_at = now()
      where organization_id = ${session.organizationId} and user_id = ${session.id} and read_at is null`,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
