import { processNextAutomationRun } from '../lib/server/automation-engine';
import { db } from '../lib/server/db';

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'automation-worker',
      message: 'Worker started',
    }),
  );
  let stopping = false;
  let lastCleanup = 0;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  while (!stopping) {
    try {
      const processed = await processNextAutomationRun();
      if (Date.now() - lastCleanup > 60 * 60 * 1000) {
        await db()`delete from sessions where expires_at < now()`;
        await db()`delete from api_rate_limits where reset_at < now() - interval '24 hours'`;
        await db()`update automation_runs
          set status = 'FAILED', error = coalesce(error, 'Nombre maximal de reprises atteint'), finished_at = now()
          where status = 'RUNNING' and attempts >= 3 and locked_at < now() - interval '15 minutes'`;
        lastCleanup = Date.now();
      }
      if (!processed) await pause(2_000);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'automation-worker',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      await pause(5_000);
    }
  }
  await db().end();
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'automation-worker',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
