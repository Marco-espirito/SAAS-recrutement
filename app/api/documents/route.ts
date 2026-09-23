import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export async function GET() {
  try {
    const session = await requireSession();
    const documents = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select id, name, kind, mime_type as "mimeType", size_bytes::int as "sizeBytes", version, created_at as "createdAt"
      from documents where organization_id = ${session.organizationId}
        and (${session.role !== 'CANDIDATE'} or owner_id = ${session.id})
      order by created_at desc limit 200`,
    );
    return Response.json({ documents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const form = await request.formData();
    const file = form.get('file');
    const applicationId = form.get('applicationId');
    const companyId = form.get('companyId');
    if (companyId && session.role === 'CANDIDATE')
      throw new ApiError(403, 'Accès CRM refusé', 'FORBIDDEN');
    if (!(file instanceof File))
      throw new ApiError(400, 'Fichier requis', 'VALIDATION_ERROR');
    if (!allowedTypes.has(file.type))
      throw new ApiError(
        415,
        'Type de fichier non autorisé',
        'UNSUPPORTED_FILE',
      );
    if (file.size <= 0 || file.size > maxFileSize)
      throw new ApiError(
        413,
        'Le fichier doit faire au maximum 5 Mo',
        'FILE_TOO_LARGE',
      );
    if (file.name.length > 240)
      throw new ApiError(400, 'Nom de fichier trop long', 'VALIDATION_ERROR');
    const application = z
      .uuid()
      .nullable()
      .safeParse(
        typeof applicationId === 'string' && applicationId
          ? applicationId
          : null,
      );
    if (!application.success)
      throw new ApiError(400, 'Candidature invalide', 'VALIDATION_ERROR');
    const company = z
      .uuid()
      .nullable()
      .safeParse(typeof companyId === 'string' && companyId ? companyId : null);
    if (!company.success || (application.data && company.data))
      throw new ApiError(400, 'Lien document invalide', 'VALIDATION_ERROR');

    const content = Buffer.from(await file.arrayBuffer());
    const storageKey = `database:${randomUUID()}`;
    const kind = file.name.toLowerCase().includes('cv') ? 'CV' : 'OTHER';
    const rows = await tenantTransaction(
      session.organizationId,
      async (sql) => {
        const inserted = await sql<Array<{ id: string }>>`
        insert into documents (organization_id, owner_id, application_id, company_id, name, kind, storage_key, mime_type, size_bytes)
        select ${session.organizationId}, ${session.id}, a.id, c.id, ${file.name}, ${kind}, ${storageKey}, ${file.type}, ${file.size}
        from (select ${application.data}::uuid as id) requested
        left join applications a on a.id = requested.id and a.organization_id = ${session.organizationId}
        left join companies c on c.id = ${company.data}::uuid and c.organization_id = ${session.organizationId}
        where (requested.id is null or a.id is not null) and (${company.data}::uuid is null or c.id is not null)
        returning id, name, kind, mime_type as "mimeType", size_bytes::int as "sizeBytes", version, created_at as "createdAt"`;
        if (!inserted[0])
          throw new ApiError(404, 'Candidature introuvable', 'NOT_FOUND');
        await sql`insert into document_blobs (document_id, content) values (${inserted[0].id}, ${content})`;
        return inserted;
      },
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: rows[0].id,
      request,
      metadata: { mimeType: file.type, sizeBytes: file.size },
    });
    return Response.json({ document: rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
