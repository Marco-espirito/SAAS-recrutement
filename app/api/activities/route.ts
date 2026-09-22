import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const activityInput = z
  .object({
    type: z.enum(['NOTE', 'EMAIL', 'CALL', 'MEETING', 'DOCUMENT']),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(20_000).optional(),
    companyId: z.uuid().optional(),
    contactId: z.uuid().optional(),
    opportunityId: z.uuid().optional(),
    applicationId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      value.companyId ||
      value.contactId ||
      value.opportunityId ||
      value.applicationId,
    'Une entité CRM est requise',
  );

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, activityInput);
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const references: Array<[string | undefined, string]> = [
          [body.companyId, 'companies'],
          [body.contactId, 'contacts'],
          [body.opportunityId, 'opportunities'],
          [body.applicationId, 'applications'],
        ];
        for (const [id, table] of references) {
          if (!id) continue;
          const found = await sql.unsafe(
            `select 1 from ${table} where id = $1 and organization_id = $2 limit 1`,
            [id, session.organizationId],
          );
          if (!found[0])
            throw new ApiError(404, 'Entité CRM introuvable', 'NOT_FOUND');
        }
        const activities = await sql<Array<{ id: string }>>`
        insert into activities (organization_id, company_id, contact_id, opportunity_id, application_id, actor_id, type, title, body)
        values (${session.organizationId}, ${body.companyId ?? null}, ${body.contactId ?? null}, ${body.opportunityId ?? null}, ${body.applicationId ?? null}, ${session.id}, ${body.type}, ${body.title}, ${body.body ?? null})
        returning id, type, title, body, occurred_at as "occurredAt"`;
        if (
          body.applicationId &&
          ['EMAIL', 'CALL', 'MEETING'].includes(body.type)
        ) {
          await sql`
            update applications set last_contact_at = now(), updated_at = now()
            where id = ${body.applicationId} and organization_id = ${session.organizationId}`;
        }
        return activities;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'activity.created',
      entityType: 'activity',
      entityId: rows[0].id,
      request,
      metadata: { type: body.type },
    });
    return Response.json({ activity: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
