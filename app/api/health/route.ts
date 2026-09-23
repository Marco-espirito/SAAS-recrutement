import { db } from '@/lib/server/db';
import { log } from '@/lib/server/observability';

export const dynamic = 'force-dynamic';

// Whichever deployment mode is active reports under its own service name;
// the other simply never appears in worker_heartbeats and is skipped below.
const staleAfterSeconds: Record<string, number> = {
  'docker-worker': 5 * 60,
  'vercel-cron': 26 * 60 * 60,
};

export async function GET() {
  let database: 'ready' | 'unavailable' = 'ready';
  try {
    await db()`select 1`;
  } catch (error) {
    database = 'unavailable';
    await log('error', 'Health check: database unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const heartbeats = await db()<
    Array<{ service: string; lastRunAt: Date; lastStatus: string }>
  >`select service, last_run_at as "lastRunAt", last_status as "lastStatus" from worker_heartbeats`.catch(
    () => [],
  );
  const now = Date.now();
  const workers = heartbeats.map((row) => {
    const ageSeconds = (now - row.lastRunAt.getTime()) / 1000;
    const stale = ageSeconds > (staleAfterSeconds[row.service] ?? 3_600);
    return {
      service: row.service,
      ageSeconds: Math.round(ageSeconds),
      status: row.lastStatus === 'ERROR' || stale ? 'degraded' : 'ok',
    };
  });
  const degraded =
    database === 'unavailable' || workers.some((w) => w.status === 'degraded');

  return Response.json(
    {
      status: degraded ? 'degraded' : 'ok',
      service: 'nexora',
      database,
      workers,
      timestamp: new Date().toISOString(),
    },
    { status: degraded ? 503 : 200 },
  );
}
