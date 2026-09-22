import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';
import { taskProposalSchema } from '@/lib/domain/ai';

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
        if (proposal.toolName !== 'propose_create_tasks')
          throw new ApiError(
            400,
            'Action non prise en charge',
            'UNSUPPORTED_ACTION',
          );
        const parsed = taskProposalSchema.safeParse(proposal.arguments);
        if (!parsed.success)
          throw new ApiError(400, 'Proposition invalide', 'INVALID_PROPOSAL');
        let created = 0;
        for (const task of parsed.data.tasks) {
          await sql`insert into tasks (organization_id, assignee_id, title, due_at)
          values (${session.organizationId}, ${session.id}, ${task.title}, now() + (${task.dueInDays} * interval '1 day'))`;
          created++;
        }
        await sql`update ai_action_proposals set status = 'EXECUTED', confirmed_at = now(), executed_at = now(), result = ${sql.json(jsonValue({ created }))} where id = ${id}`;
        return { created };
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
