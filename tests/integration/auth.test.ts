import { beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import {
  jsonRequest,
  registerAccount,
  resetTestCookies,
  uniqueEmail,
} from './helpers';

beforeEach(() => {
  resetTestCookies();
});

describe('registration against a real database', () => {
  it('creates an account, logs the browser in, and exposes it via /api/auth/me', async () => {
    const { response, email } = await registerAccount();
    expect(response.status).toBe(201);

    const meResponse = await me();
    expect(meResponse.status).toBe(200);
    const body = (await meResponse.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email);
  });

  it('rejects a second registration on the same email', async () => {
    const { email } = await registerAccount();
    resetTestCookies();
    const { response } = await registerAccount({ email });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('EMAIL_EXISTS');
  });
});

describe('login against a real database', () => {
  it('refuses an incorrect password', async () => {
    const { email } = await registerAccount({
      password: 'CorrectHorseBattery9!',
    });
    resetTestCookies();
    const response = await login(
      jsonRequest('/api/auth/login', 'POST', {
        email,
        password: 'definitely-wrong',
      }),
    );
    expect(response.status).toBe(401);
  });

  it('accepts the right password and starts a session', async () => {
    const email = uniqueEmail('login');
    await registerAccount({ email, password: 'CorrectHorseBattery9!' });
    resetTestCookies();
    const response = await login(
      jsonRequest('/api/auth/login', 'POST', {
        email,
        password: 'CorrectHorseBattery9!',
      }),
    );
    expect(response.status).toBe(200);
    const meResponse = await me();
    expect(meResponse.status).toBe(200);
  });
});

describe('logout against a real database', () => {
  it('destroys the session so /api/auth/me stops working', async () => {
    await registerAccount();
    expect((await me()).status).toBe(200);
    await logout(jsonRequest('/api/auth/logout', 'POST'));
    expect((await me()).status).toBe(401);
  });
});
