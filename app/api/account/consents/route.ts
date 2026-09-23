import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const consentTypes = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'EXTERNAL_AI_PROCESSING',
] as const;

const input = z
  .object({
    type: z.enum(consentTypes),
    version: z.string().trim().min(1).max(40),
    status: z.enum(['GRANTED', 'REVOKED']),
  })
  .strict();

export async function GET() {
  try {
    const session = await requireSession();
    const consents = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select distinct on (type) type, version, status, occurred_at as "occurredAt"
      from user_consents
      where organization_id = ${session.organizationId} and user_id = ${session.id}
      order by type, occurred_at desc`,
    );
    return Response.json({ consents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into user_consents (organization_id, user_id, type, version, status)
      values (${session.organizationId}, ${session.id}, ${body.type}, ${body.version}, ${body.status})
      returning id`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: body.status === 'GRANTED' ? 'consent.granted' : 'consent.revoked',
      entityType: 'user_consent',
      entityId: rows[0].id,
      request,
      metadata: { type: body.type, version: body.version },
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
