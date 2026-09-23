import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession();
    const jobs = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        await sql`update job_offers set status = 'EXPIRED', updated_at = now()
        where organization_id = ${session.organizationId} and status = 'ACTIVE'
          and expires_at is not null and expires_at <= now()`;
        return sql`
        select o.id, o.company, o.title, o.location, o.salary, o.url, o.skills,
          o.status, o.first_seen_at as "firstSeenAt", o.last_seen_at as "lastSeenAt",
          o.expires_at as "expiresAt", o.removed_at as "removedAt",
          m.id as "matchId", m.score as match, m.data_complete as "dataComplete",
          m.breakdown as "matchBreakdown", m.missing_skills as "missingSkills",
          m.matched_skills as "matchedSkills", m.feedback
        from job_offers o
        left join candidate_profiles p on p.organization_id = o.organization_id and p.user_id = ${session.id}
        left join candidate_offer_matches m on m.offer_id = o.id and m.profile_id = p.id
        where o.organization_id = ${session.organizationId}
        order by o.last_seen_at desc limit 200`;
      },
    );
    return Response.json({ jobs });
  } catch (error) {
    return handleApiError(error);
  }
}
