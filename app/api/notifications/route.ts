import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

const query = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const url = new URL(request.url);
    const parsed = query.safeParse({
      unreadOnly: url.searchParams.get('unreadOnly') ?? undefined,
    });
    if (!parsed.success)
      throw new ApiError(400, 'Requête invalide', 'VALIDATION_ERROR');
    const unreadOnly = parsed.data.unreadOnly === 'true';
    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const notifications = await sql`
          select id, category, type, title, body, link, metadata,
            read_at as "readAt", created_at as "createdAt"
          from notifications
          where organization_id = ${session.organizationId} and user_id = ${session.id}
            and (${unreadOnly} = false or read_at is null)
          order by created_at desc
          limit 50`;
        const [{ count: unreadCount }] = await sql<Array<{ count: number }>>`
          select count(*)::int as count from notifications
          where organization_id = ${session.organizationId} and user_id = ${session.id} and read_at is null`;
        return { notifications, unreadCount };
      },
    );
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return handleApiError(error);
  }
}
