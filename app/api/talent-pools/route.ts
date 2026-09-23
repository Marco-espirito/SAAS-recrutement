import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

const filters = z
  .object({
    skill: z.string().trim().max(80).optional(),
    location: z.string().trim().max(120).optional(),
    tag: z.string().trim().max(40).optional(),
  })
  .strict();

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const pools = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select id, name, filters, created_at as "createdAt" from talent_pools
      where organization_id = ${session.organizationId} order by updated_at desc`,
    );
    return Response.json({ pools });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(
      request,
      z.object({ name: z.string().trim().min(2).max(120), filters }).strict(),
    );
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into talent_pools (organization_id, name, filters, created_by)
      values (${session.organizationId}, ${body.name}, ${sql.json(jsonValue(body.filters))}, ${session.id}) returning id`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'talent_pool.created',
      entityType: 'talent_pool',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
