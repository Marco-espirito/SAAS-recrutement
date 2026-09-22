import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const taskInput = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5_000).optional(),
  dueAt: z.iso.datetime().optional(),
  applicationId: z.uuid().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const tasks = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select id, title, description, status, due_at as "dueAt", application_id as "applicationId", created_at as "createdAt"
      from tasks where organization_id = ${session.organizationId} order by due_at asc nulls last, created_at desc`,
    );
    return Response.json({ tasks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, taskInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into tasks (organization_id, assignee_id, application_id, title, description, due_at)
      values (${session.organizationId}, ${session.id}, ${body.applicationId ?? null}, ${body.title}, ${body.description ?? null}, ${body.dueAt ? new Date(body.dueAt) : null})
      returning id, title, description, status, due_at as "dueAt", application_id as "applicationId", created_at as "createdAt"`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'task.created',
      entityType: 'task',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ task: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
