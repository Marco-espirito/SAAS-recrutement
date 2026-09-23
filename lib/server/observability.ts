import 'server-only';
import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { db, jsonValue } from './db';

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Vercel stamps every invocation with `x-vercel-id`, which already threads
 * through retries and edge/origin hops — reused as-is instead of inventing
 * a parallel id. Falls back to a fresh id outside a request scope (e.g. the
 * standalone worker script) or in local dev, where it won't correlate
 * across log lines of the same request — documented in docs/OBSERVABILITY.md.
 */
export async function correlationId(): Promise<string> {
  try {
    const list = await headers();
    return list.get('x-vercel-id') ?? list.get('x-request-id') ?? randomUUID();
  } catch {
    return randomUUID();
  }
}

/**
 * Single choke point for structured, correlation-tagged logs. Plug a real
 * error tracker in here once one is configured: e.g. after installing
 * @sentry/nextjs and setting SENTRY_DSN, forward `level === 'error'` entries
 * to `Sentry.captureException`/`captureMessage`. Left unwired for now since
 * no such account exists yet — see docs/OBSERVABILITY.md.
 */
export async function log(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
) {
  const entry = {
    level,
    service: 'nexora',
    message,
    correlationId: await correlationId(),
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export async function recordHeartbeat(
  service: string,
  status: 'OK' | 'ERROR',
  error?: string,
  metadata?: Record<string, unknown>,
) {
  await db()`insert into worker_heartbeats (service, last_run_at, last_status, last_error, metadata, updated_at)
    values (${service}, now(), ${status}, ${error ?? null}, ${db().json(jsonValue(metadata ?? {}))}, now())
    on conflict (service) do update set
      last_run_at = now(), last_status = excluded.last_status,
      last_error = excluded.last_error, metadata = excluded.metadata, updated_at = now()`;
}
