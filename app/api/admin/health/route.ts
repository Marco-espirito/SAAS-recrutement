import { db, tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    let database: 'ok' | 'degraded' = 'ok';
    try {
      await db()`select 1`;
    } catch {
      database = 'degraded';
    }
    const heartbeats = await db()<
      Array<{
        service: string;
        lastRunAt: Date;
        lastStatus: string;
        lastError: string | null;
      }>
    >`select service, last_run_at as "lastRunAt", last_status as "lastStatus", last_error as "lastError"
      from worker_heartbeats order by service`;

    const metrics = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const [automationQueue] = await sql<
          Array<{
            queued: number;
            running: number;
            oldestQueuedAgeSeconds: number | null;
          }>
        >`select
            count(*) filter (where status = 'QUEUED')::int as queued,
            count(*) filter (where status = 'RUNNING')::int as running,
            extract(epoch from (now() - min(available_at) filter (where status = 'QUEUED')))::int as "oldestQueuedAgeSeconds"
          from automation_runs where organization_id = ${session.organizationId}`;
        const [oauth] = await sql<
          Array<{ connectionsWithErrors: number; staleConnections: number }>
        >`select
            count(*) filter (where last_error is not null)::int as "connectionsWithErrors",
            count(*) filter (where disconnected_at is null and next_sync_at < now() - interval '1 hour')::int as "staleConnections"
          from oauth_connections where organization_id = ${session.organizationId}`;
        const [aiProposals] = await sql<Array<{ pending: number }>>`
          select count(*)::int as pending from ai_action_proposals
          where organization_id = ${session.organizationId} and status = 'PENDING'`;
        const [notifications] = await sql<Array<{ last24h: number }>>`
          select count(*)::int as "last24h" from notifications
          where organization_id = ${session.organizationId} and created_at > now() - interval '24 hours'`;
        return { automationQueue, oauth, aiProposals, notifications };
      },
    );

    return Response.json(
      { database, workerHeartbeats: heartbeats, ...metrics },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
