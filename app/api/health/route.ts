import { db } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db()`select 1`;
    return Response.json({
      status: 'ok',
      service: 'nexora',
      database: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'nexora',
        check: 'database',
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      {
        status: 'degraded',
        service: 'nexora',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
