import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ name: string; mimeType: string; content: Buffer }>>`
      select d.name, d.mime_type as "mimeType", b.content
      from documents d join document_blobs b on b.document_id = d.id
      where d.id = ${id} and d.organization_id = ${session.organizationId}`,
    );
    const document = rows[0];
    if (!document) throw new ApiError(404, 'Document introuvable', 'NOT_FOUND');
    return new Response(new Uint8Array(document.content), {
      headers: {
        'content-type': document.mimeType,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    const { id } = await context.params;
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      delete from documents where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0]) throw new ApiError(404, 'Document introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'document.deleted',
      entityType: 'document',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
