import { beforeEach, describe, expect, it } from 'vitest';
import { DELETE as deleteAccount } from '@/app/api/account/route';
import { GET as exportData } from '@/app/api/account/export/route';
import { GET as me } from '@/app/api/auth/me/route';
import {
  jsonRequest,
  registerAccount,
  resetTestCookies,
  uniqueEmail,
} from './helpers';

beforeEach(() => {
  resetTestCookies();
});

describe('GDPR self-service against a real database', () => {
  it('exports the account’s own data as JSON', async () => {
    const { email } = await registerAccount({ accountType: 'CANDIDATE' });
    const response = await exportData(
      jsonRequest('/api/account/export', 'GET'),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { account: { email: string } };
    expect(body.account.email).toBe(email);
  });

  it('deletes the account and frees its email for reuse', async () => {
    const email = uniqueEmail('delete-me');
    await registerAccount({ email, accountType: 'CANDIDATE' });

    const deleted = await deleteAccount(jsonRequest('/api/account', 'DELETE'));
    expect(deleted.status).toBe(204);
    expect((await me()).status).toBe(401);

    resetTestCookies();
    const { response: again } = await registerAccount({ email });
    expect(again.status).toBe(201);
  });
});
