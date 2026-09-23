import { z } from 'zod';
import { parseCsv } from '@/lib/domain/csv';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

const rowSchema = z.object({
  name: z.string().trim().min(2).max(160),
  industry: z.string().trim().max(120).default(''),
  website: z.union([z.url(), z.literal('')]).default(''),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 1_000_000 || file.size === 0)
      throw new ApiError(
        400,
        'Fichier CSV requis (maximum 1 Mo)',
        'VALIDATION_ERROR',
      );
    let raw: Record<string, string>[];
    try {
      raw = parseCsv(await file.text());
    } catch (error) {
      throw new ApiError(
        400,
        error instanceof Error ? error.message : 'CSV invalide',
        'VALIDATION_ERROR',
      );
    }
    const rows = raw.map((row) => rowSchema.safeParse(row));
    if (rows.some((row) => !row.success))
      throw new ApiError(400, 'Une ligne CSV est invalide', 'VALIDATION_ERROR');
    const unique = new Map<string, z.infer<typeof rowSchema>>();
    for (const row of rows)
      if (row.success) unique.set(row.data.name.toLowerCase(), row.data);
    const created = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        let count = 0;
        for (const row of unique.values()) {
          const existing =
            await sql`select 1 from companies where organization_id = ${session.organizationId} and lower(name) = ${row.name.toLowerCase()} limit 1`;
          if (existing.length) continue;
          const inserted =
            await sql`insert into companies (organization_id, name, industry, website, owner_id)
          values (${session.organizationId}, ${row.name}, ${row.industry || null}, ${row.website || null}, ${session.id})
          on conflict (organization_id, name) do nothing returning id`;
          count += inserted.length;
        }
        return count;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.companies.imported',
      entityType: 'company_import',
      request,
      metadata: { created, submitted: raw.length },
    });
    return Response.json({ inserted: created, skipped: raw.length - created });
  } catch (error) {
    return handleApiError(error);
  }
}
