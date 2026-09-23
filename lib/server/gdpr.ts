import 'server-only';
import { db, tenantTransaction } from './db';
import { ApiError } from './http';
import type { SessionUser } from './auth';
import { destroySession } from './auth';
import { hashIp } from './security';

export async function buildAccountDataExport(session: SessionUser) {
  return tenantTransaction(session.organizationId, async (sql) => {
    const [
      account,
      memberships,
      profile,
      experiences,
      atsAnalyses,
      offerMatches,
      documents,
      oauthConnections,
      aiProposals,
      consents,
      activity,
    ] = await Promise.all([
      sql`select id, email::text, name, created_at as "createdAt", updated_at as "updatedAt",
        email_verified_at as "emailVerifiedAt", mfa_enabled as "mfaEnabled"
        from users where id = ${session.id}`,
      db()`select o.name as "organizationName", m.role, m.created_at as "memberSince"
        from memberships m join organizations o on o.id = m.organization_id
        where m.user_id = ${session.id}`,
      sql`select id, phone, location, headline, summary, linkedin_url as "linkedinUrl", website_url as "websiteUrl",
        desired_roles as "desiredRoles", desired_locations as "desiredLocations", remote_preference as "remotePreference",
        employment_types as "employmentTypes", salary_min as "salaryMin", salary_max as "salaryMax",
        availability_date as "availabilityDate", skills, languages, created_at as "createdAt", updated_at as "updatedAt"
        from candidate_profiles where organization_id = ${session.organizationId} and user_id = ${session.id}`,
      sql`select e.type, e.title, e.organization_name as "organizationName", e.location, e.description,
        e.started_at as "startedAt", e.ended_at as "endedAt", e.current, e.skills
        from candidate_experiences e join candidate_profiles p on p.id = e.profile_id
        where e.organization_id = ${session.organizationId} and p.user_id = ${session.id}
        order by e.position`,
      sql`select score, detected_keywords as "detectedKeywords", checks, created_at as "createdAt"
        from candidate_ats_analyses where organization_id = ${session.organizationId} and user_id = ${session.id}
        order by created_at desc`,
      sql`select o.title as "offerTitle", o.company, m.score, m.matched_skills as "matchedSkills",
        m.missing_skills as "missingSkills", m.feedback, m.created_at as "createdAt"
        from candidate_offer_matches m
        join candidate_profiles p on p.id = m.profile_id
        join job_offers o on o.id = m.offer_id
        where m.organization_id = ${session.organizationId} and p.user_id = ${session.id}
        order by m.created_at desc`,
      sql`select name, kind, mime_type as "mimeType", size_bytes::int as "sizeBytes", created_at as "createdAt"
        from documents where organization_id = ${session.organizationId} and owner_id = ${session.id}
        order by created_at desc`,
      sql`select provider, external_account_id as "externalAccountId", display_name as "displayName",
        scopes, last_synced_at as "lastSyncedAt", created_at as "connectedAt"
        from oauth_connections
        where organization_id = ${session.organizationId} and user_id = ${session.id} and disconnected_at is null`,
      sql`select tool_name as "toolName", status, created_at as "createdAt"
        from ai_action_proposals where organization_id = ${session.organizationId} and user_id = ${session.id}
        order by created_at desc limit 200`,
      sql`select type, version, status, occurred_at as "occurredAt"
        from user_consents where organization_id = ${session.organizationId} and user_id = ${session.id}
        order by occurred_at desc`,
      sql`select action, entity_type as "entityType", created_at as "createdAt"
        from audit_logs where organization_id = ${session.organizationId} and actor_id = ${session.id}
        order by created_at desc limit 500`,
    ]);
    return {
      exportedAt: new Date().toISOString(),
      account: account[0] ?? null,
      organizations: memberships,
      candidateProfile: profile[0] ?? null,
      candidateExperiences: experiences,
      atsAnalyses,
      offerMatches,
      documents,
      oauthConnections,
      aiActionProposals: aiProposals,
      consents,
      recentActivity: activity,
      notes:
        'Le contenu binaire des documents (ex. CV) doit être téléchargé séparément via /api/documents ; les jetons OAuth ne sont jamais exportés.',
    };
  });
}

/**
 * Deletion is scoped to the session's current organization: it is the only
 * context where the row-level security cascades on delete (candidate
 * profiles, OAuth connections, ATS analyses…) are guaranteed to run under
 * the matching `app.organization_id`. A user who belongs to more than one
 * organization must be handled manually — refusing outright is safer than
 * silently deleting data outside a correctly-scoped transaction.
 */
export async function deleteOwnAccount(
  session: SessionUser,
  request?: Request,
) {
  const orgMemberships = await db()<
    Array<{ organizationId: string; role: string }>
  >`select organization_id as "organizationId", role from memberships where user_id = ${session.id}`;
  if (orgMemberships.length > 1)
    throw new ApiError(
      409,
      'Ce compte appartient à plusieurs organisations : contactez le support pour une suppression complète.',
      'MULTI_ORG_ACCOUNT',
    );
  const membership = orgMemberships[0];
  if (!membership || membership.organizationId !== session.organizationId)
    throw new ApiError(
      409,
      'Organisation introuvable pour ce compte',
      'NOT_FOUND',
    );

  const [{ count: memberCount }] = await db()<Array<{ count: number }>>`
    select count(*)::int as count from memberships where organization_id = ${session.organizationId}`;
  const [{ count: ownerCount }] = await db()<Array<{ count: number }>>`
    select count(*)::int as count from memberships
    where organization_id = ${session.organizationId} and role = 'OWNER'`;
  const soleMember = memberCount <= 1;
  if (membership.role === 'OWNER' && ownerCount <= 1 && !soleMember)
    throw new ApiError(
      409,
      'Transférez la propriété de l’organisation à un autre membre avant de supprimer ce compte.',
      'LAST_OWNER',
    );

  const forwarded =
    request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await tenantTransaction(session.organizationId, async (sql) => {
    // Logged inside this transaction, before the user row disappears: audit_logs.actor_id
    // (ON DELETE SET NULL) is nulled by the same cascade a few statements below, leaving a
    // legitimate anonymized trace that a deletion happened without retaining who it was.
    await sql`insert into audit_logs (organization_id, actor_id, action, entity_type, entity_id, ip_hash)
      values (${session.organizationId}, ${session.id}, 'account.deleted', 'user', ${session.id}, ${hashIp(forwarded)})`;
    if (soleMember) {
      await sql`delete from organizations where id = ${session.organizationId}`;
    } else {
      await sql`delete from documents
        where organization_id = ${session.organizationId} and owner_id = ${session.id}
          and application_id is null and company_id is null`;
    }
    await sql`delete from users where id = ${session.id}`;
  });
  await destroySession();
}
