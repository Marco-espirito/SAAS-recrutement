import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { enqueueAutomationEvent } from '@/lib/server/automation-engine';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const updateInput = z.object({
  stage: z.enum([
    'TO_APPLY',
    'SENT',
    'FOLLOW_UP',
    'INTERVIEW',
    'OFFER',
    'REJECTED',
    'PLACED',
  ]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request, updateInput);
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const updated = await sql<Array<{ id: string; stage: string }>>`
        update applications set stage = ${body.stage}, updated_at = now(),
          applied_at = case when ${body.stage} = 'SENT' and applied_at is null then now() else applied_at end
        where id = ${id} and organization_id = ${session.organizationId}
        returning id, stage`;
        if (!updated[0])
          throw new ApiError(404, 'Candidature introuvable', 'NOT_FOUND');
        await sql`insert into activities (organization_id, application_id, actor_id, type, title, metadata)
        values (${session.organizationId}, ${id}, ${session.id}, 'STATUS_CHANGE', 'Statut modifié', ${sql.json({ stage: body.stage })})`;
        return updated;
      },
    );
    await enqueueAutomationEvent(
      session.organizationId,
      'APPLICATION_STAGE_CHANGED',
      { applicationId: id, stage: body.stage },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'application.stage.changed',
      entityType: 'application',
      entityId: id,
      request,
      metadata: { stage: body.stage },
    });
    return Response.json({ application: rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const removed = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      delete from applications where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!removed[0])
      throw new ApiError(404, 'Candidature introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'application.deleted',
      entityType: 'application',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
