import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { tenantTransaction } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { hashToken } from '@/lib/server/security';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const links = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select l.id, l.company_id as "companyId", c.name as "companyName", l.shortlist_id as "shortlistId",
        s.name as "shortlistName", l.expires_at as "expiresAt", l.revoked_at as "revokedAt", l.created_at as "createdAt"
      from client_portal_links l join companies c on c.id = l.company_id join shortlists s on s.id = l.shortlist_id
      where l.organization_id = ${session.organizationId} order by l.created_at desc limit 100`,
    );
    return Response.json({ links });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const body = await readJson(
      request,
      z
        .object({
          companyId: z.uuid(),
          shortlistId: z.uuid(),
          expiresInDays: z.number().int().min(1).max(90),
        })
        .strict(),
    );
    const token = randomBytes(32).toString('base64url');
    const rows = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ id: string }>>`
      insert into client_portal_links (organization_id, company_id, shortlist_id, token_hash, expires_at, created_by)
      select ${session.organizationId}, c.id, s.id, ${hashToken(token)}, now() + (${body.expiresInDays} * interval '1 day'), ${session.id}
      from companies c join shortlists s on s.id = ${body.shortlistId} and s.organization_id = ${session.organizationId}
      left join opportunities o on o.id = s.opportunity_id and o.organization_id = ${session.organizationId}
      where c.id = ${body.companyId} and c.organization_id = ${session.organizationId}
        and (s.opportunity_id is null or o.company_id = c.id)
      returning id`,
    );
    if (!rows[0])
      throw new ApiError(
        400,
        'Entreprise ou shortlist incompatibles',
        'VALIDATION_ERROR',
      );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'client_portal.link.created',
      entityType: 'client_portal_link',
      entityId: rows[0].id,
      request,
    });
    return Response.json(
      {
        id: rows[0].id,
        url: `${env().APP_URL.replace(/\/$/, '')}/portal/${token}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
