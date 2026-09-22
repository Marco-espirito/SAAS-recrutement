import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const input = z
  .object({
    documentId: z.uuid().nullable().optional(),
    score: z.number().int().min(0).max(100),
    detectedKeywords: z
      .array(z.string().trim().min(1).max(80))
      .max(100)
      .default([]),
    checks: z
      .array(
        z.object({
          label: z.string().max(100),
          passed: z.boolean(),
          detail: z.string().max(300),
        }),
      )
      .max(50)
      .default([]),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        if (body.documentId) {
          const document =
            await sql`select 1 from documents where id = ${body.documentId} and organization_id = ${session.organizationId} and owner_id = ${session.id}`;
          if (!document.length)
            throw new ApiError(
              404,
              'Document introuvable',
              'DOCUMENT_NOT_FOUND',
            );
        }
        return sql<Array<{ id: string }>>`insert into candidate_ats_analyses
        (organization_id, user_id, document_id, score, detected_keywords, checks)
        values (${session.organizationId}, ${session.id}, ${body.documentId ?? null}, ${body.score}, ${sql.array(body.detectedKeywords)}, ${sql.json(jsonValue(body.checks))})
        returning id, score, created_at as "createdAt"`;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.ats.analyzed',
      entityType: 'candidate_ats_analysis',
      entityId: rows[0].id,
      request,
      metadata: { score: body.score },
    });
    return Response.json({ analysis: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
