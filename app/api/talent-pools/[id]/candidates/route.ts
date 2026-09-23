import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, 'Pool invalide', 'VALIDATION_ERROR');
    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const pools = await sql<
          Array<{
            filters: { skill?: string; location?: string; tag?: string };
          }>
        >`select filters from talent_pools where id = ${id} and organization_id = ${session.organizationId}`;
        if (!pools[0]) throw new ApiError(404, 'Pool introuvable', 'NOT_FOUND');
        const { skill, location, tag } = pools[0].filters;
        const candidates = await sql`
        select id, first_name as "firstName", last_name as "lastName", headline, location, skills, tags
        from candidates where organization_id = ${session.organizationId}
          and (${!location} or strpos(lower(coalesce(location, '')), ${location?.toLowerCase() ?? ''}) > 0)
          and (${!tag} or ${tag ?? ''} = any(tags))
          and (${!skill} or exists (select 1 from jsonb_array_elements_text(skills) value where strpos(lower(value), ${skill?.toLowerCase() ?? ''}) > 0))
        order by updated_at desc limit 200`;
        return candidates;
      },
    );
    return Response.json({ candidates: result });
  } catch (error) {
    return handleApiError(error);
  }
}
