import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

export const experienceInput = z
  .object({
    type: z.enum(['WORK', 'EDUCATION', 'PROJECT']),
    title: z.string().trim().min(1).max(200),
    organizationName: z.string().trim().max(200).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    startedAt: z.iso.date().nullable().optional(),
    endedAt: z.iso.date().nullable().optional(),
    current: z.boolean().default(false),
    skills: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    position: z.number().int().min(0).max(1000).default(0),
  })
  .strict()
  .refine(
    (value) =>
      value.current ||
      !value.startedAt ||
      !value.endedAt ||
      value.endedAt >= value.startedAt,
    { message: 'Dates incohérentes' },
  );

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, experienceInput);
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const profiles = await sql<
          Array<{ id: string }>
        >`insert into candidate_profiles (organization_id, user_id)
        values (${session.organizationId}, ${session.id}) on conflict (organization_id, user_id) do update set updated_at = now() returning id`;
        return sql<Array<{ id: string }>>`insert into candidate_experiences
        (organization_id, profile_id, type, title, organization_name, location, description, started_at, ended_at, current, skills, position)
        values (${session.organizationId}, ${profiles[0].id}, ${body.type}, ${body.title}, ${body.organizationName ?? null},
          ${body.location ?? null}, ${body.description ?? null}, ${body.startedAt ?? null}, ${body.current ? null : (body.endedAt ?? null)},
          ${body.current}, ${sql.array(body.skills)}, ${body.position}) returning id`;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'candidate.experience.created',
      entityType: 'candidate_experience',
      entityId: rows[0].id,
      request,
    });
    return Response.json({ experience: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
