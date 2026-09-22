import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import {
  type AssistantTool,
  resolveAiProvider,
  runAssistant,
} from '@/lib/server/ai';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { taskProposalSchema } from '@/lib/domain/ai';

const assistantInput = z.object({
  message: z.string().trim().min(2).max(4_000),
  allowExternalAI: z.literal(true),
});

const tools: AssistantTool[] = [
  {
    name: 'propose_create_tasks',
    description:
      'Proposer des tâches. Elles ne seront créées qu’après une seconde confirmation explicite.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tasks: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              dueInDays: { type: 'integer', minimum: 0, maximum: 90 },
            },
            required: ['title', 'dueInDays'],
          },
        },
      },
      required: ['tasks'],
    },
  },
];

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, assistantInput);
    await rateLimit(`ai:${session.id}`, 30, 3_600);
    if (!resolveAiProvider())
      throw new ApiError(
        503,
        'Nexora AI nécessite OPENAI_API_KEY ou GEMINI_API_KEY côté serveur',
        'AI_NOT_CONFIGURED',
      );

    const metrics = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const rows = await sql<
          Array<{
            applicationCount: number;
            interviewCount: number;
            pendingFollowups: number;
            averageMatch: number | null;
            openTasks: number;
          }>
        >`
        select
          count(*)::int as "applicationCount",
          count(*) filter (where stage = 'INTERVIEW')::int as "interviewCount",
          count(*) filter (where stage in ('SENT','FOLLOW_UP') and coalesce(last_contact_at, applied_at, created_at) < now() - interval '7 days')::int as "pendingFollowups",
          round(avg(match_score))::int as "averageMatch",
          (select count(*)::int from tasks where organization_id = ${session.organizationId} and status not in ('DONE','CANCELLED')) as "openTasks"
        from applications where organization_id = ${session.organizationId}`;
        return rows[0];
      },
    );

    const result = await runAssistant({
      instructions: `Tu es Nexora AI, assistant de recrutement en français. Tu reçois uniquement des indicateurs agrégés, jamais les fiches CRM brutes. Ne prétends jamais avoir envoyé un email ou modifié une donnée. Pour créer des tâches, utilise l’outil de proposition. Indicateurs: ${JSON.stringify(metrics)}`,
      message: body.message,
      tools,
    }).catch((cause: unknown) => {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'AI provider call failed',
          error: cause instanceof Error ? cause.message : String(cause),
        }),
      );
      throw new ApiError(
        502,
        'Fournisseur IA indisponible',
        'AI_PROVIDER_ERROR',
      );
    });

    const proposals: Array<{
      id: string;
      toolName: string;
      arguments: unknown;
    }> = [];
    for (const call of result.toolCalls) {
      if (call.name !== 'propose_create_tasks') continue;
      const parsed = taskProposalSchema.safeParse(call.arguments);
      if (!parsed.success) continue;
      const args = parsed.data;
      const rows = await tenantTransaction(
        session.organizationId,
        (sql) => sql<Array<{ id: string }>>`
        insert into ai_action_proposals (organization_id, user_id, tool_name, arguments)
        values (${session.organizationId}, ${session.id}, ${call.name}, ${sql.json(jsonValue(args))}) returning id`,
      );
      proposals.push({ id: rows[0].id, toolName: call.name, arguments: args });
    }
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'ai.assistant.requested',
      entityType: 'ai_response',
      entityId: result.responseId,
      request,
      metadata: { proposalCount: proposals.length, contextMode: 'aggregate' },
    });
    return Response.json({
      answer:
        result.text ||
        (proposals.length
          ? 'J’ai préparé ces actions. Confirmez-les pour les exécuter.'
          : 'Je n’ai pas trouvé assez de données pour répondre.'),
      proposals,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
