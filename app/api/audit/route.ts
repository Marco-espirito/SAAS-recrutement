import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      before: url.searchParams.get('before') ?? undefined,
    });
    if (!parsed.success)
      throw new ApiError(400, 'Paramètres invalides', 'VALIDATION_ERROR');
    const query = parsed.data;
    const logs = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select l.id, l.action, l.entity_type as "entityType", l.entity_id as "entityId",
        l.metadata, l.created_at as "createdAt", u.name as "actorName"
      from audit_logs l left join users u on u.id = l.actor_id
      where l.organization_id = ${session.organizationId}
        and (${query.before ?? null}::timestamptz is null or l.created_at < ${query.before ?? null}::timestamptz)
      order by l.created_at desc limit ${query.limit}`,
    );
    return Response.json({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
