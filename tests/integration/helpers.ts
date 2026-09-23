import { POST as register } from '@/app/api/auth/register/route';
import { resetTestCookies } from '../next-headers';

export { resetTestCookies };

export function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export async function registerAccount(overrides?: {
  name?: string;
  email?: string;
  password?: string;
  organizationName?: string;
  accountType?: 'CANDIDATE' | 'RECRUITER';
}) {
  const email = overrides?.email ?? uniqueEmail('integration');
  const response = await register(
    jsonRequest('/api/auth/register', 'POST', {
      name: overrides?.name ?? 'Test Nexora',
      email,
      password: overrides?.password ?? 'CorrectHorseBattery9!',
      organizationName:
        overrides?.organizationName ?? `Org ${uniqueEmail('org')}`,
      accountType: overrides?.accountType ?? 'RECRUITER',
    }),
  );
  return { response, email };
}
