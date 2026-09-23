import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';
import { stageProposalSchema, taskProposalSchema } from '@/lib/domain/ai';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const rows = await sql<Array<{ toolName: string; arguments: unknown }>>`
        select tool_name as "toolName", arguments from ai_action_proposals
        where id = ${id} and organization_id = ${session.organizationId} and user_id = ${session.id} and status = 'PENDING' and expires_at > now()
        for update`;
        const proposal = rows[0];
        if (!proposal)
          throw new ApiError(
            404,
            'Proposition introuvable ou expirée',
            'PROPOSAL_NOT_FOUND',
          );
        let result: { created?: number; updated?: number };
        if (proposal.toolName === 'propose_create_tasks') {
          const parsed = taskProposalSchema.safeParse(proposal.arguments);
          if (!parsed.success)
            throw new ApiError(400, 'Proposition invalide', 'INVALID_PROPOSAL');
          for (const task of parsed.data.tasks) {
            await sql`insert into tasks (organization_id, assignee_id, title, due_at)
              values (${session.organizationId}, ${session.id}, ${task.title}, now() + (${task.dueInDays} * interval '1 day'))`;
          }
          result = { created: parsed.data.tasks.length };
        } else if (
          proposal.toolName === 'propose_batch_stage_updates' &&
          session.role !== 'CANDIDATE'
        ) {
          const parsed = stageProposalSchema.safeParse(proposal.arguments);
          if (!parsed.success)
            throw new ApiError(400, 'Proposition invalide', 'INVALID_PROPOSAL');
          if (
            new Set(parsed.data.updates.map((item) => item.applicationId))
              .size !== parsed.data.updates.length
          )
            throw new ApiError(400, 'Candidature répétée', 'INVALID_PROPOSAL');
          for (const update of parsed.data.updates) {
            const [current] = await sql<
              Array<{
                stage: string;
                companyId: string | null;
                opportunityId: string | null;
              }>
            >`
              select stage, company_id as "companyId", opportunity_id as "opportunityId" from applications
              where id = ${update.applicationId} and organization_id = ${session.organizationId} for update`;
            if (!current)
              throw new ApiError(404, 'Candidature introuvable', 'NOT_FOUND');
            await sql`update applications set stage = ${update.stage}, updated_at = now()
              where id = ${update.applicationId} and organization_id = ${session.organizationId}`;
            await sql`insert into activities (organization_id, company_id, opportunity_id, application_id, actor_id, type, title, body)
              values (${session.organizationId}, ${current.companyId}, ${current.opportunityId}, ${update.applicationId}, ${session.id}, 'STATUS_CHANGE', 'Étape modifiée via Nexora AI', ${`${current.stage} → ${update.stage}`})`;
          }
          result = { updated: parsed.data.updates.length };
        } else
          throw new ApiError(
            400,
            'Action non prise en charge',
            'UNSUPPORTED_ACTION',
          );
        await sql`update ai_action_proposals set status = 'EXECUTED', confirmed_at = now(), executed_at = now(), result = ${sql.json(jsonValue(result))} where id = ${id}`;
        return result;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'ai.proposal.executed',
      entityType: 'ai_action_proposal',
      entityId: id,
      request,
      metadata: result,
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    return handleApiError(error);
  }
}
