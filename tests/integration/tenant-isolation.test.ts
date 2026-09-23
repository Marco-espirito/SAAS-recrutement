import { beforeEach, describe, expect, it } from 'vitest';
import {
  GET as listApplications,
  POST as createApplication,
} from '@/app/api/applications/route';
import { jsonRequest, registerAccount, resetTestCookies } from './helpers';

beforeEach(() => {
  resetTestCookies();
});

describe('tenant isolation enforced by PostgreSQL row-level security', () => {
  it('never returns another organization’s applications, even through the same shared app-role connection', async () => {
    await registerAccount({ accountType: 'RECRUITER' });
    const created = await createApplication(
      jsonRequest('/api/applications', 'POST', {
        companyName: `Company A ${Date.now()}`,
        roleTitle: 'Ingénieur A',
      }),
    );
    expect(created.status).toBe(201);

    resetTestCookies();
    await registerAccount({ accountType: 'RECRUITER' });
    const listed = await listApplications();
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { applications: unknown[] };
    expect(body.applications).toEqual([]);
  });
});
