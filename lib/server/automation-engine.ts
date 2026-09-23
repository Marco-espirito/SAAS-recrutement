import { db, jsonValue, tenantTransaction } from './db';
import {
  calculateAvailableAt,
  matchesConditions,
  retryDelayMinutes,
  type AutomationCondition,
} from '@/lib/domain/automation';

type AutomationAction = {
  type: 'CREATE_TASK' | 'CREATE_EMAIL_DRAFT' | 'UPDATE_APPLICATION_STAGE';
  title?: string;
  body?: string;
  stage?: string;
  dueInDays?: number;
};

export async function enqueueAutomationEvent(
  organizationId: string,
  triggerType: string,
  payload: Record<string, unknown>,
) {
  return tenantTransaction(organizationId, async (sql) => {
    const automations = await sql<
      Array<{
        id: string;
        triggerConfig: Record<string, unknown>;
        conditions: AutomationCondition[];
      }>
    >`
      select id, trigger_config as "triggerConfig", conditions from automations
      where organization_id = ${organizationId} and enabled = true and trigger_type = ${triggerType}`;
    for (const automation of automations) {
      if (!matchesConditions(automation.conditions, payload)) continue;
      const delayDays = Number(automation.triggerConfig.delayDays ?? 0);
      await sql`insert into automation_runs (organization_id, automation_id, event_payload, available_at)
        values (${organizationId}, ${automation.id}, ${sql.json(jsonValue(payload))}, ${calculateAvailableAt(new Date(), delayDays)})`;
    }
    return automations.filter((automation) =>
      matchesConditions(automation.conditions, payload),
    ).length;
  });
}

export async function processNextAutomationRun() {
  const claimed = await db().begin(async (sql) => {
    const rows = await sql<
      Array<{
        id: string;
        organizationId: string;
        actions: AutomationAction[];
        payload: Record<string, unknown>;
        createdAt: Date;
        attempts: number;
      }>
    >`
      select r.id, r.organization_id as "organizationId", a.actions,
        r.event_payload as payload, r.created_at as "createdAt", r.attempts
      from automation_runs r join automations a on a.id = r.automation_id
      where (
        (r.status = 'QUEUED' and r.available_at <= now())
        or (r.status = 'RUNNING' and r.locked_at < now() - interval '15 minutes')
      ) and r.attempts < 3 and a.enabled = true
      order by r.available_at asc for update skip locked limit 1`;
    const run = rows[0];
    if (!run) return null;
    await sql`update automation_runs set status = 'RUNNING', started_at = coalesce(started_at, now()), locked_at = now(), attempts = attempts + 1 where id = ${run.id}`;
    return run;
  });
  if (!claimed) return false;

  try {
    await tenantTransaction(claimed.organizationId, async (sql) => {
      const applicationId =
        typeof claimed.payload.applicationId === 'string'
          ? claimed.payload.applicationId
          : null;
      const preparesFollowUp = claimed.actions.some(
        (action) => action.type === 'CREATE_EMAIL_DRAFT',
      );
      if (applicationId && preparesFollowUp) {
        const applications = await sql<
          Array<{ stage: string; lastContactAt: Date | null }>
        >`
          select stage, coalesce(last_contact_at, applied_at, created_at) as "lastContactAt"
          from applications
          where id = ${applicationId} and organization_id = ${claimed.organizationId}`;
        const application = applications[0];
        if (
          !application ||
          application.stage !== 'SENT' ||
          (application.lastContactAt &&
            application.lastContactAt > claimed.createdAt)
        ) {
          await sql`update automation_runs
            set status = 'SUCCEEDED',
              result = ${sql.json({ ok: true, skipped: true, reason: 'application_changed' })},
              finished_at = now()
            where id = ${claimed.id}`;
          return;
        }
      }
      for (const action of claimed.actions) {
        if (action.type === 'CREATE_TASK') {
          await sql`insert into tasks (organization_id, application_id, title, description, due_at)
            values (${claimed.organizationId}, ${applicationId}, ${action.title ?? 'Action automatique'}, ${action.body ?? null}, now() + (${action.dueInDays ?? 0} * interval '1 day'))`;
        }
        if (action.type === 'CREATE_EMAIL_DRAFT') {
          await sql`insert into activities (organization_id, application_id, type, title, body, metadata)
            values (${claimed.organizationId}, ${applicationId}, 'EMAIL', ${action.title ?? 'Brouillon de relance'}, ${action.body ?? ''}, '{"status":"draft","source":"automation"}'::jsonb)`;
        }
        if (
          action.type === 'UPDATE_APPLICATION_STAGE' &&
          action.stage &&
          applicationId
        ) {
          await sql`update applications set stage = ${action.stage}, updated_at = now()
            where id = ${applicationId} and organization_id = ${claimed.organizationId}`;
        }
      }
      await sql`update automation_runs set status = 'SUCCEEDED', result = '{"ok":true}'::jsonb, finished_at = now() where id = ${claimed.id}`;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const nextAttempt = claimed.attempts + 1;
    const delayMinutes = retryDelayMinutes(nextAttempt);
    if (delayMinutes !== null) {
      await db()`update automation_runs
        set status = 'QUEUED', error = ${message}, locked_at = null,
          available_at = now() + (${delayMinutes} * interval '1 minute')
        where id = ${claimed.id}`;
    } else {
      await db()`update automation_runs
        set status = 'FAILED', error = ${message}, finished_at = now()
        where id = ${claimed.id}`;
    }
  }
  return true;
}
