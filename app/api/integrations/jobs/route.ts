import { z } from 'zod';
import {
  buildOfferDedupKey,
  buildOfferQueryKey,
  selectOffersToRemove,
} from '@/lib/domain/offers';
import {
  scoreCandidateOffer,
  type CandidateMatchProfile,
} from '@/lib/domain/matching';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

const SOURCE = 'JOBS_PROVIDER';

const querySchema = z.object({
  query: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional(),
});

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  company: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(180),
  location: z.string().trim().max(160).default('Non précisé'),
  salary: z.string().trim().max(120).default('Non précisé'),
  match: z.number().int().min(0).max(100).default(0),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  url: z.url().optional(),
  expiresAt: z.string().trim().max(40).optional(),
});

type PersistedOffer = {
  id: string;
  dedupKey: string;
  externalId: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string | null;
  skills: string[];
  status: string;
  providerMatch: number;
};

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    await rateLimit(`jobs:${session.id}`, 60, 3_600);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      query: url.searchParams.get('query'),
      location: url.searchParams.get('location') || undefined,
    });
    if (!parsed.success)
      throw new ApiError(400, 'Recherche invalide', 'VALIDATION_ERROR');
    const configuration = env();
    if (
      !configuration.JOBS_PROVIDER_URL ||
      !configuration.JOBS_PROVIDER_API_KEY
    )
      throw new ApiError(
        503,
        'Fournisseur d’offres non configuré',
        'INTEGRATION_NOT_CONFIGURED',
      );
    const providerUrl = new URL(configuration.JOBS_PROVIDER_URL);
    providerUrl.searchParams.set('query', parsed.data.query);
    if (parsed.data.location)
      providerUrl.searchParams.set('location', parsed.data.location);
    const response = await fetch(providerUrl, {
      headers: {
        authorization: `Bearer ${configuration.JOBS_PROVIDER_API_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'Fournisseur d’offres indisponible',
        'PROVIDER_ERROR',
      );
    const payload = z
      .object({ jobs: z.array(jobSchema).max(100) })
      .safeParse(await response.json());
    if (!payload.success)
      throw new ApiError(
        502,
        'Réponse du fournisseur invalide',
        'PROVIDER_ERROR',
      );

    const queryKey = buildOfferQueryKey(
      SOURCE,
      parsed.data.query,
      parsed.data.location,
    );

    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const persisted: PersistedOffer[] = [];
        for (const job of payload.data.jobs) {
          const externalId = String(job.id);
          const dedupKey = buildOfferDedupKey({
            source: SOURCE,
            externalId,
            company: job.company,
            title: job.title,
            location: job.location,
          });
          const expiresAt = job.expiresAt ? new Date(job.expiresAt) : null;
          const rows = await sql<Array<PersistedOffer>>`
          insert into job_offers (
            organization_id, source, external_id, query_key, dedup_key,
            title, company, location, salary, url, skills, expires_at, raw_payload,
            status, first_seen_at, last_seen_at
          )
          values (
            ${session.organizationId}, ${SOURCE}, ${externalId}, ${queryKey}, ${dedupKey},
            ${job.title}, ${job.company}, ${job.location}, ${job.salary}, ${job.url ?? null},
            ${sql.array(job.skills)}, ${expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null},
            ${sql.json(jsonValue(job))}, 'ACTIVE', now(), now()
          )
          on conflict (organization_id, dedup_key) do update set
            query_key = ${queryKey},
            title = ${job.title},
            company = ${job.company},
            location = ${job.location},
            salary = ${job.salary},
            url = ${job.url ?? null},
            skills = ${sql.array(job.skills)},
            expires_at = ${expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null},
            raw_payload = ${sql.json(jsonValue(job))},
            status = 'ACTIVE',
            removed_at = null,
            last_seen_at = now(),
            updated_at = now()
          returning id, dedup_key as "dedupKey", external_id as "externalId",
            title, company, location, salary, url, skills, status,
            ${job.match} as "providerMatch"`;
          persisted.push(rows[0]);
        }

        const seenDedupKeys = new Set(persisted.map((offer) => offer.dedupKey));
        const activeForQuery = await sql<
          Array<{ id: string; dedupKey: string }>
        >`
        select id, dedup_key as "dedupKey" from job_offers
        where organization_id = ${session.organizationId}
          and source = ${SOURCE} and query_key = ${queryKey} and status = 'ACTIVE'`;
        const staleIds = selectOffersToRemove(activeForQuery, seenDedupKeys);
        if (staleIds.length)
          await sql`update job_offers set status = 'REMOVED', removed_at = now(), updated_at = now()
          where id = any(${sql.array(staleIds)})`;
        await sql`update job_offers set status = 'EXPIRED', updated_at = now()
        where organization_id = ${session.organizationId} and status = 'ACTIVE'
          and expires_at is not null and expires_at <= now()`;

        const profile = await sql<
          Array<{ id: string } & CandidateMatchProfile>
        >`
        select id, skills, desired_locations as "desiredLocations",
          remote_preference as "remotePreference", salary_min as "salaryMin", salary_max as "salaryMax"
        from candidate_profiles
        where organization_id = ${session.organizationId} and user_id = ${session.id}`;

        const matches = new Map<
          string,
          {
            id: string;
            score: number;
            dataComplete: boolean;
            breakdown: unknown;
            missingSkills: unknown;
            matchedSkills: string[];
          }
        >();
        if (profile[0]) {
          const experienceSkills = await sql<Array<{ skill: string }>>`
          select distinct skill from candidate_experiences, unnest(skills) as skill
          where organization_id = ${session.organizationId} and profile_id = ${profile[0].id}`;
          const candidate: CandidateMatchProfile = {
            skills: profile[0].skills,
            experienceSkills: experienceSkills.map((row) => row.skill),
            desiredLocations: profile[0].desiredLocations,
            remotePreference: profile[0].remotePreference,
            salaryMin: profile[0].salaryMin,
            salaryMax: profile[0].salaryMax,
          };
          for (const offer of persisted) {
            const match = scoreCandidateOffer(candidate, {
              title: offer.title,
              skills: offer.skills,
              location: offer.location,
              salary: offer.salary,
            });
            const rows = await sql<Array<{ id: string }>>`
            insert into candidate_offer_matches (
              organization_id, profile_id, offer_id, score, data_complete, breakdown, matched_skills, missing_skills
            )
            values (
              ${session.organizationId}, ${profile[0].id}, ${offer.id}, ${match.score}, ${match.dataComplete},
              ${sql.json(jsonValue(match.breakdown))}, ${sql.array(match.matchedSkills)}, ${sql.json(jsonValue(match.missingSkills))}
            )
            on conflict (organization_id, profile_id, offer_id) do update set
              score = ${match.score},
              data_complete = ${match.dataComplete},
              breakdown = ${sql.json(jsonValue(match.breakdown))},
              matched_skills = ${sql.array(match.matchedSkills)},
              missing_skills = ${sql.json(jsonValue(match.missingSkills))},
              updated_at = now()
            returning id`;
            matches.set(offer.id, {
              id: rows[0].id,
              score: match.score,
              dataComplete: match.dataComplete,
              breakdown: match.breakdown,
              missingSkills: match.missingSkills,
              matchedSkills: match.matchedSkills,
            });
          }
        }

        return persisted
          .filter((offer) => offer.status !== 'REMOVED')
          .map((offer) => {
            const match = matches.get(offer.id);
            return {
              id: offer.id,
              company: offer.company,
              title: offer.title,
              location: offer.location,
              salary: offer.salary,
              url: offer.url ?? undefined,
              skills: offer.skills,
              match: match ? match.score : offer.providerMatch,
              matchId: match?.id,
              dataComplete: match?.dataComplete ?? false,
              matchBreakdown: match?.breakdown,
              missingSkills: match?.missingSkills,
              matchedSkills: match?.matchedSkills,
            };
          });
      },
    );

    return Response.json({ jobs: result });
  } catch (error) {
    return handleApiError(error);
  }
}
