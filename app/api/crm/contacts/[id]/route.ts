import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  assertSameOrigin,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const updateInput = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().max(120).optional(),
    email: z.email().trim().or(z.literal('')).optional(),
    phone: z.string().trim().max(40).optional(),
    linkedinUrl: z.url().or(z.literal('')).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    const body = await readJson(request, updateInput);
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      update contacts set
        first_name = coalesce(${body.firstName ?? null}, first_name),
        last_name = coalesce(${body.lastName ?? null}, last_name),
        title = coalesce(${body.title ?? null}, title),
        email = coalesce(${body.email || null}, email),
        phone = coalesce(${body.phone ?? null}, phone),
        linkedin_url = coalesce(${body.linkedinUrl || null}, linkedin_url), updated_at = now()
      where id = ${id} and organization_id = ${session.organizationId}
      returning id, company_id as "companyId", first_name as "firstName", last_name as "lastName", title, email::text, phone, linkedin_url as "linkedinUrl"`,
    );
    if (!rows[0]) throw new ApiError(404, 'Contact introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.contact.updated',
      entityType: 'contact',
      entityId: id,
      request,
    });
    return Response.json({ contact: rows[0] });
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
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const { id } = await context.params;
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      delete from contacts where id = ${id} and organization_id = ${session.organizationId} returning id`,
    );
    if (!rows[0]) throw new ApiError(404, 'Contact introuvable', 'NOT_FOUND');
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'crm.contact.deleted',
      entityType: 'contact',
      entityId: id,
      request,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
