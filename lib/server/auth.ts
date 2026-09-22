import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db } from './db';
import { env } from './env';
import { createSessionToken, hashToken } from './security';

export type Role = 'OWNER' | 'ADMIN' | 'RECRUITER' | 'CANDIDATE';
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  emailVerified: boolean;
  mfaEnabled: boolean;
};

export async function createSession(userId: string, organizationId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_DAYS * 86_400_000);
  await db()`insert into sessions (token_hash, user_id, organization_id, expires_at)
    values (${hashToken(token)}, ${userId}, ${organizationId}, ${expiresAt})`;
  const jar = await cookies();
  jar.set(env().SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: new URL(env().APP_URL).protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(env().SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const rows = await db()<SessionUser[]>`
    select u.id, u.email::text, u.name, o.id as "organizationId", o.name as "organizationName", m.role,
      (u.email_verified_at is not null) as "emailVerified", u.mfa_enabled as "mfaEnabled"
    from sessions s
    join users u on u.id = s.user_id
    join organizations o on o.id = s.organization_id
    join memberships m on m.user_id = u.id and m.organization_id = o.id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()
    limit 1`;
  return rows[0] ?? null;
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(env().SESSION_COOKIE_NAME)?.value;
  if (token)
    await db()`delete from sessions where token_hash = ${hashToken(token)}`;
  jar.delete(env().SESSION_COOKIE_NAME);
}

export async function replaceSession(userId: string, organizationId: string) {
  await destroySession();
  await createSession(userId, organizationId);
}

export async function invalidateAllSessions(userId: string) {
  await db()`delete from sessions where user_id = ${userId}`;
  (await cookies()).delete(env().SESSION_COOKIE_NAME);
}

export function can(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}
