import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession();
    type MatchRow = {
      id: string;
      score: number;
      dataComplete: boolean;
      breakdown: unknown;
      matchedSkills: string[];
      missingSkills: unknown;
      feedback: 'RELEVANT' | 'NOT_RELEVANT' | 'APPLIED' | null;
      feedbackAt: string | null;
      createdAt: string;
      updatedAt: string;
      offerId: string;
      title: string;
      company: string;
      location: string;
      salary: string;
      url: string | null;
      offerStatus: string;
    };
    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const matches = await sql<Array<MatchRow>>`
        select m.id, m.score, m.data_complete as "dataComplete", m.breakdown,
          m.matched_skills as "matchedSkills", m.missing_skills as "missingSkills",
          m.feedback, m.feedback_at as "feedbackAt", m.created_at as "createdAt", m.updated_at as "updatedAt",
          o.id as "offerId", o.title, o.company, o.location, o.salary, o.url, o.status as "offerStatus"
        from candidate_offer_matches m
        join candidate_profiles p on p.id = m.profile_id
        join job_offers o on o.id = m.offer_id
        where m.organization_id = ${session.organizationId} and p.user_id = ${session.id}
        order by m.score desc, m.updated_at desc
        limit 200`;
        const feedbackGiven = matches.filter((m) => m.feedback);
        const relevant = feedbackGiven.filter(
          (m) => m.feedback === 'RELEVANT' || m.feedback === 'APPLIED',
        );
        const quality = {
          totalMatches: matches.length,
          feedbackCount: feedbackGiven.length,
          relevanceRate: feedbackGiven.length
            ? Math.round((relevant.length / feedbackGiven.length) * 100)
            : null,
        };
        return { matches, quality };
      },
    );
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
