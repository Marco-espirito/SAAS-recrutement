import { processNextAutomationRun } from '@/lib/server/automation-engine';
import {
  generateDigestNotifications,
  generateReminderNotifications,
} from '@/lib/server/notifications';
import { recordHeartbeat } from '@/lib/server/observability';
import { processNextOAuthSync } from '@/lib/server/oauth-sync';
import { runRetentionSweep } from '@/lib/server/retention';

export const maxDuration = 60;

const SERVICE = 'vercel-cron';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16)
    return Response.json({ error: 'Cron non configuré' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: 'Accès refusé' }, { status: 401 });

  let processed = 0;
  const deadline = Date.now() + 45_000;
  try {
    while (processed < 20 && Date.now() < deadline) {
      if (!(await processNextAutomationRun())) break;
      processed++;
    }
    let synced = 0;
    while (synced < 3 && Date.now() < deadline) {
      if (!(await processNextOAuthSync())) break;
      synced++;
    }
    const retention = await runRetentionSweep();
    const reminders = await generateReminderNotifications();
    const digests = await generateDigestNotifications();
    await recordHeartbeat(SERVICE, 'OK', undefined, { processed, synced });
    return Response.json({
      ok: true,
      processed,
      synced,
      retention,
      reminders,
      digests,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'automation-cron',
        message,
      }),
    );
    await recordHeartbeat(SERVICE, 'ERROR', message).catch(() => undefined);
    return Response.json(
      { error: 'Traitement indisponible', processed },
      { status: 500 },
    );
  }
}
