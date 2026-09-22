import { createHmac, randomBytes } from 'node:crypto';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const password = 'Nexora-Test-2026!';
const nextPassword = 'Nexora-Test-2026-Changed!';

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret)
    bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const key = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, '0');
}

async function call(
  path,
  { body, cookie, expected = 200, method = body ? 'POST' : 'GET' } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json', origin: base } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (response.status !== expected)
    throw new Error(
      `${method} ${path}: ${response.status} ${JSON.stringify(result)}`,
    );
  return {
    result,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie,
  };
}

const ownerA = `smoke-owner-a-${suffix}@example.test`;
const ownerB = `smoke-owner-b-${suffix}@example.test`;
const member = `smoke-member-${suffix}@example.test`;

const a = await call('/api/auth/register', {
  expected: 201,
  body: {
    name: 'Smoke Owner A',
    email: ownerA,
    password,
    organizationName: `Smoke A ${suffix}`,
    accountType: 'RECRUITER',
  },
});
let cookieA = a.cookie;
await call('/api/candidate/profile', {
  method: 'PATCH',
  cookie: cookieA,
  body: {
    phone: '+33600000000',
    location: 'Lyon',
    headline: 'Data Analyst',
    desiredRoles: ['Data Analyst'],
    desiredLocations: ['Lyon'],
    remotePreference: 'HYBRID',
    employmentTypes: ['CDI'],
    salaryMin: 40000,
    salaryMax: 55000,
    skills: ['SQL', 'Python'],
    languages: [{ name: 'Français', level: 'Natif' }],
  },
});
const profile = await call('/api/candidate/profile', { cookie: cookieA });
if (profile.result.profile?.headline !== 'Data Analyst')
  throw new Error('Candidate profile did not persist');
await call('/api/candidate/profile/experiences', {
  expected: 201,
  cookie: cookieA,
  body: {
    type: 'WORK',
    title: 'Analyste',
    organizationName: 'ACME',
    current: true,
    skills: ['SQL'],
    position: 0,
  },
});
await call('/api/candidate/profile/ats-analyses', {
  expected: 201,
  cookie: cookieA,
  body: {
    score: 84,
    detectedKeywords: ['SQL'],
    checks: [{ label: 'Contact', passed: true, detail: 'Détecté' }],
  },
});

const setup = await call('/api/auth/mfa', {
  cookie: cookieA,
  body: { action: 'setup', password },
});
await call('/api/auth/mfa', {
  cookie: cookieA,
  body: { action: 'confirm', code: totp(setup.result.secret) },
});

const b = await call('/api/auth/register', {
  expected: 201,
  body: {
    name: 'Smoke Owner B',
    email: ownerB,
    password,
    organizationName: `Smoke B ${suffix}`,
    accountType: 'RECRUITER',
  },
});
let cookieB = b.cookie;
const ownerBSession = await call('/api/auth/me', { cookie: cookieB });
await call(`/api/organization/members/${ownerBSession.result.user.id}`, {
  method: 'DELETE',
  expected: 409,
  cookie: cookieB,
});
const inviteA = await call('/api/organization/invitations', {
  expected: 201,
  cookie: cookieB,
  body: { email: ownerA, role: 'ADMIN' },
});
const invitationTokenA = new URL(inviteA.result.inviteUrl).searchParams.get(
  'invite',
);
const acceptedA = await call('/api/organization/invitations/accept', {
  cookie: cookieA,
  body: { token: invitationTokenA, password },
});
cookieA = acceptedA.cookie;
const organizations = await call('/api/organizations', { cookie: cookieA });
if (organizations.result.organizations.length !== 2)
  throw new Error('Organization switch membership missing');
const originalOrganization = organizations.result.organizations.find(
  (organization) => !organization.current,
);
const switched = await call('/api/auth/switch-organization', {
  cookie: cookieA,
  body: { organizationId: originalOrganization.id },
});
cookieA = switched.cookie;
await call('/api/auth/logout', { cookie: cookieA, body: {} });
await call('/api/auth/login', {
  expected: 428,
  body: { email: ownerA, password },
});
const reloginA = await call('/api/auth/login', {
  body: { email: ownerA, password, otp: totp(setup.result.secret) },
});
cookieA = reloginA.cookie;

const inviteMember = await call('/api/organization/invitations', {
  expected: 201,
  cookie: cookieB,
  body: { email: member, role: 'CANDIDATE' },
});
const memberToken = new URL(inviteMember.result.inviteUrl).searchParams.get(
  'invite',
);
const acceptedMember = await call('/api/organization/invitations/accept', {
  body: { token: memberToken, name: 'Smoke Member', password },
});
const memberSession = await call('/api/auth/me', {
  cookie: acceptedMember.cookie,
});
await call(`/api/organization/members/${memberSession.result.user.id}`, {
  method: 'PATCH',
  cookie: cookieB,
  body: { role: 'RECRUITER' },
});
await call(`/api/organization/members/${memberSession.result.user.id}`, {
  method: 'DELETE',
  cookie: cookieB,
});

const forgot = await call('/api/auth/forgot-password', {
  body: { email: ownerB },
});
const resetToken = new URL(forgot.result.resetUrl).searchParams.get('reset');
const reset = await call('/api/auth/reset-password', {
  cookie: cookieB,
  body: { token: resetToken, password: nextPassword },
});
cookieB = reset.cookie;
await call('/api/auth/me', { cookie: cookieB });
await call('/api/auth/sessions/invalidate', { cookie: cookieB, body: {} });
await call('/api/auth/me', { expected: 401, cookie: cookieB });

console.log(
  JSON.stringify({ ok: true, suffix, emails: [ownerA, ownerB, member] }),
);
