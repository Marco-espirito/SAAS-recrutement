import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const optionalUrl = z.union([z.url(), z.literal(''), z.null()]).optional();
const input = z
  .object({
    phone: z.string().trim().max(40).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    headline: z.string().trim().max(200).nullable().optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    linkedinUrl: optionalUrl,
    websiteUrl: optionalUrl,
    desiredRoles: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
    desiredLocations: z
      .array(z.string().trim().min(1).max(160))
      .max(30)
      .optional(),
    remotePreference: z
      .enum(['ONSITE', 'HYBRID', 'REMOTE', 'FLEXIBLE'])
      .optional(),
    employmentTypes: z
      .array(z.string().trim().min(1).max(60))
      .max(20)
      .optional(),
    salaryMin: z.number().int().min(0).max(10_000_000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(10_000_000).nullable().optional(),
    availabilityDate: z.iso.date().nullable().optional(),
    skills: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
    languages: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          level: z.string().trim().min(1).max(80),
        }),
      )
      .max(30)
      .optional(),
    primaryDocumentId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.salaryMin == null ||
      value.salaryMax == null ||
      value.salaryMax >= value.salaryMin,
    { message: 'La rémunération maximale doit être supérieure au minimum' },
  );

const profileSelect = `
  select p.id, p.phone, p.location, p.headline, p.summary,
    p.linkedin_url as "linkedinUrl", p.website_url as "websiteUrl",
    p.desired_roles as "desiredRoles", p.desired_locations as "desiredLocations",
    p.remote_preference as "remotePreference", p.employment_types as "employmentTypes",
    p.salary_min as "salaryMin", p.salary_max as "salaryMax", p.availability_date as "availabilityDate",
    p.skills, p.languages, p.primary_document_id as "primaryDocumentId", p.updated_at as "updatedAt"
  from candidate_profiles p`;

export async function GET() {
  try {
    const session = await requireSession();
    const result = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const profile = await sql.unsafe(
          `${profileSelect} where p.organization_id = $1 and p.user_id = $2`,
          [session.organizationId, session.id],
        );
        const experiences = profile[0]
          ? await sql`
        select id, type, title, organization_name as "organizationName", location, description,
          started_at as "startedAt", ended_at as "endedAt", current, skills, position
        from candidate_experiences where organization_id = ${session.organizationId} and profile_id = ${profile[0].id}
        order by position, started_at desc nulls last`
          : [];
        const analyses = await sql`
        select a.id, a.document_id as "documentId", d.name as "documentName", a.score,
          a.detected_keywords as "detectedKeywords", a.checks, a.created_at as "createdAt"
        from candidate_ats_analyses a left join documents d on d.id = a.document_id
        where a.organization_id = ${session.organizationId} and a.user_id = ${session.id}
        order by a.created_at desc limit 50`;
        return { profile: profile[0] ?? null, experiences, analyses };
      },
    );
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    const profile = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        if (body.primaryDocumentId) {
          const document =
            await sql`select 1 from documents where id = ${body.primaryDocumentId} and organization_id = ${session.organizationId} and owner_id = ${session.id}`;
          if (!document.length)
            throw new ApiError(
              404,
              'CV principal introuvable',
              'DOCUMENT_NOT_FOUND',
            );
        }
        const rows = await sql`
        insert into candidate_profiles (organization_id, user_id, phone, location, headline, summary, linkedin_url, website_url,
          desired_roles, desired_locations, remote_preference, employment_types, salary_min, salary_max,
          availability_date, skills, languages, primary_document_id)
        values (${session.organizationId}, ${session.id}, ${body.phone ?? null}, ${body.location ?? null}, ${body.headline ?? null},
          ${body.summary ?? null}, ${body.linkedinUrl || null}, ${body.websiteUrl || null}, ${sql.array(body.desiredRoles ?? [])},
          ${sql.array(body.desiredLocations ?? [])}, ${body.remotePreference ?? 'FLEXIBLE'}, ${sql.array(body.employmentTypes ?? [])},
          ${body.salaryMin ?? null}, ${body.salaryMax ?? null}, ${body.availabilityDate ?? null}, ${sql.array(body.skills ?? [])},
          ${sql.json(jsonValue(body.languages ?? []))}, ${body.primaryDocumentId ?? null})
        on conflict (organization_id, user_id) do update set
          phone = case when ${body.phone !== undefined} then ${body.phone ?? null} else candidate_profiles.phone end,
          location = case when ${body.location !== undefined} then ${body.location ?? null} else candidate_profiles.location end,
          headline = case when ${body.headline !== undefined} then ${body.headline ?? null} else candidate_profiles.headline end,
          summary = case when ${body.summary !== undefined} then ${body.summary ?? null} else candidate_profiles.summary end,
          linkedin_url = case when ${body.linkedinUrl !== undefined} then ${body.linkedinUrl || null} else candidate_profiles.linkedin_url end,
          website_url = case when ${body.websiteUrl !== undefined} then ${body.websiteUrl || null} else candidate_profiles.website_url end,
          desired_roles = case when ${body.desiredRoles !== undefined} then ${body.desiredRoles ? sql.array(body.desiredRoles) : sql.array([])} else candidate_profiles.desired_roles end,
          desired_locations = case when ${body.desiredLocations !== undefined} then ${body.desiredLocations ? sql.array(body.desiredLocations) : sql.array([])} else candidate_profiles.desired_locations end,
          remote_preference = case when ${body.remotePreference !== undefined} then ${body.remotePreference ?? 'FLEXIBLE'} else candidate_profiles.remote_preference end,
          employment_types = case when ${body.employmentTypes !== undefined} then ${body.employmentTypes ? sql.array(body.employmentTypes) : sql.array([])} else candidate_profiles.employment_types end,
          salary_min = case when ${body.salaryMin !== undefined} then ${body.salaryMin ?? null} else candidate_profiles.salary_min end,
          salary_max = case when ${body.salaryMax !== undefined} then ${body.salaryMax ?? null} else candidate_profiles.salary_max end,
          availability_date = case when ${body.availabilityDate !== undefined} then ${body.availabilityDate ?? null} else candidate_profiles.availability_date end,
          skills = case when ${body.skills !== undefined} then ${body.skills ? sql.array(body.skills) : sql.array([])} else candidate_profiles.skills end,
          languages = case when ${body.languages !== undefined} then ${body.languages ? sql.json(jsonValue(body.languages)) : sql.json([])} else candidate_profiles.languages end,
          primary_document_id = case when ${body.primaryDocumentId !== undefined} then ${body.primaryDocumentId ?? null} else candidate_profiles.primary_document_id end,
          updated_at = now()
        returning id`;
        return rows[0];
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.profile.updated',
      entityType: 'candidate_profile',
      entityId: profile.id,
      request,
    });
    return Response.json({ profile });
  } catch (error) {
    return handleApiError(error);
  }
}
