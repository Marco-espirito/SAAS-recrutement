import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const feedbackInput = z
  .object({
    feedback: z.enum(['RELEVANT', 'NOT_RELEVANT', 'APPLIED']),
  })
  .strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const body = await readJson(request, feedbackInput);
    const updated = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const rows = await sql<Array<{ id: string; score: number }>>`
          update candidate_offer_matches m set
            feedback = ${body.feedback}, feedback_at = now(), feedback_by = ${session.id}
          from candidate_profiles p
          where m.profile_id = p.id and p.user_id = ${session.id}
            and m.id = ${id} and m.organization_id = ${session.organizationId}
          returning m.id, m.score`;
        if (!rows[0])
          throw new ApiError(404, 'Recommandation introuvable', 'NOT_FOUND');
        return rows[0];
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.match.feedback',
      entityType: 'candidate_offer_match',
      entityId: id,
      request,
      metadata: { feedback: body.feedback, score: updated.score },
    });
    return Response.json({ match: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
