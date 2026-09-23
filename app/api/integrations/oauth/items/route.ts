import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const kind = z
      .enum(['email', 'event', 'notification'])
      .nullable()
      .safeParse(url.searchParams.get('kind'));
    if (!kind.success)
      throw new ApiError(400, 'Type invalide', 'VALIDATION_ERROR');
    const items = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select i.id, i.kind, i.title, i.summary, i.occurred_at as "occurredAt", i.metadata,
        c.provider, c.display_name as "accountName"
      from external_items i join oauth_connections c on c.id = i.connection_id
      where i.organization_id = ${session.organizationId} and c.organization_id = ${session.organizationId}
        and c.user_id = ${session.id} and c.disconnected_at is null and i.deleted_at is null
        and (${kind.data === null} or i.kind = ${kind.data})
      order by i.occurred_at desc nulls last limit 100`,
    );
    return Response.json(
      { items },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
