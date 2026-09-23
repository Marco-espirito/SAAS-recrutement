import { automationInput } from '@/lib/domain/automation-schema';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const automations = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select a.id, a.name, a.enabled, a.trigger_type as "triggerType", a.trigger_config as "triggerConfig", a.conditions, a.actions,
        a.created_at as "createdAt", count(r.id)::int as "runCount", max(r.created_at) as "lastRunAt",
        (array_agg(r.status order by r.created_at desc) filter (where r.id is not null))[1] as "lastRunStatus",
        count(r.id) filter (where r.status = 'FAILED')::int as "failedRunCount"
      from automations a left join automation_runs r on r.automation_id = a.id
      where a.organization_id = ${session.organizationId}
      group by a.id order by a.updated_at desc`,
    );
    return Response.json({ automations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(request, automationInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into automations (organization_id, name, enabled, trigger_type, trigger_config, conditions, actions, created_by)
      values (${session.organizationId}, ${body.name}, ${body.enabled}, ${body.triggerType}, ${sql.json(jsonValue({ delayDays: body.delayDays }))}, ${sql.json(jsonValue(body.conditions))}, ${sql.json(jsonValue(body.actions))}, ${session.id})
      returning id, name, enabled, trigger_type as "triggerType", trigger_config as "triggerConfig", conditions, actions, created_at as "createdAt"`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'automation.created',
      entityType: 'automation',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ automation: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
