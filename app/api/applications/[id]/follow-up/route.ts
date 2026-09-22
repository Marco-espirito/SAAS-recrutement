import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { enqueueAutomationEvent } from '@/lib/server/automation-engine';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const input = z.object({
  message: z.string().trim().min(1).max(20_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request, input);
    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const applications = await sql<
          Array<{ id: string; roleTitle: string }>
        >`
          update applications
          set stage = 'FOLLOW_UP', last_contact_at = now(), updated_at = now()
          where id = ${id} and organization_id = ${session.organizationId}
          returning id, role_title as "roleTitle"`;
        if (!applications[0])
          throw new ApiError(404, 'Candidature introuvable', 'NOT_FOUND');
        const activities = await sql<Array<{ id: string }>>`
          insert into activities (organization_id, application_id, actor_id, type, title, body)
          values (${session.organizationId}, ${id}, ${session.id}, 'EMAIL', ${`Relance — ${applications[0].roleTitle}`}, ${body.message})
          returning id`;
        const completedTasks = await sql`
          update tasks set status = 'DONE', updated_at = now()
          where organization_id = ${session.organizationId}
            and application_id = ${id}
            and status in ('TODO', 'IN_PROGRESS')
          returning id`;
        return {
          application: applications[0],
          activityId: activities[0].id,
          completedTaskCount: completedTasks.length,
        };
      },
    );
    await enqueueAutomationEvent(
      session.organizationId,
      'APPLICATION_STAGE_CHANGED',
      { applicationId: id, stage: 'FOLLOW_UP' },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'application.follow_up.sent',
      entityType: 'application',
      entityId: id,
      request,
      metadata: { completedTaskCount: result.completedTaskCount },
    });
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
