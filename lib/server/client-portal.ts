import { db, tenantTransaction } from './db';
import { ApiError } from './http';
import { hashToken } from './security';

export async function readClientPortal(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(404, 'Lien invalide', 'NOT_FOUND');
  const tokenHash = hashToken(token);
  const [resolved] = await db()<Array<{ organizationId: string | null }>>`
    select resolve_client_portal_organization(${tokenHash}) as "organizationId"`;
  if (!resolved?.organizationId)
    throw new ApiError(404, 'Lien expiré ou révoqué', 'NOT_FOUND');
  return tenantTransaction(resolved.organizationId, async (sql) => {
    const [link] = await sql<
      Array<{ companyName: string; shortlistName: string; shortlistId: string }>
    >`
      select c.name as "companyName", s.name as "shortlistName", s.id as "shortlistId"
      from client_portal_links l join companies c on c.id = l.company_id and c.organization_id = l.organization_id
      join shortlists s on s.id = l.shortlist_id and s.organization_id = l.organization_id
      where l.organization_id = ${resolved.organizationId} and l.token_hash = ${tokenHash}
        and l.revoked_at is null and l.expires_at > now()`;
    if (!link) throw new ApiError(404, 'Lien expiré ou révoqué', 'NOT_FOUND');
    const candidates = await sql<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        headline: string | null;
        location: string | null;
        skills: string[];
      }>
    >`
      select c.id, c.first_name as "firstName", c.last_name as "lastName", c.headline, c.location, c.skills
      from shortlist_candidates sc join candidates c on c.id = sc.candidate_id and c.organization_id = sc.organization_id
      where sc.organization_id = ${resolved.organizationId} and sc.shortlist_id = ${link.shortlistId}
      order by sc.added_at desc limit 100`;
    return {
      companyName: link.companyName,
      shortlistName: link.shortlistName,
      candidates,
    };
  });
}
