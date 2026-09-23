import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEnvironment } from '@/lib/server/env';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('server configuration', () => {
  it('accepts an empty optional AI provider from the sample environment', () => {
    const configuration = validateEnvironment({
      DATABASE_URL: 'postgresql://user:password@localhost:5432/nexora',
      APP_URL: 'https://saas-recrutement.vercel.app',
      AI_PROVIDER: '',
    });
    expect(configuration.AI_PROVIDER).toBeUndefined();
  });

  it('does not label an invalid database setting as an APP_URL error', async () => {
    vi.stubEnv('DATABASE_URL', 'not-a-database-url');
    vi.stubEnv('APP_URL', 'https://saas-recrutement.vercel.app');
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { assertSameOrigin } = await import('@/lib/server/http');
    const request = new Request(
      'https://saas-recrutement.vercel.app/api/auth/register',
      { headers: { origin: 'https://saas-recrutement.vercel.app' } },
    );
    expect(() => assertSameOrigin(request)).toThrow(
      'Configuration serveur invalide',
    );
  });

  it('still identifies an invalid APP_URL', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://user:password@localhost:5432/nexora',
    );
    vi.stubEnv('APP_URL', 'not-a-url');
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { assertSameOrigin } = await import('@/lib/server/http');
    const request = new Request(
      'https://saas-recrutement.vercel.app/api/auth/register',
      { headers: { origin: 'https://saas-recrutement.vercel.app' } },
    );
    expect(() => assertSameOrigin(request)).toThrow(
      'Configuration APP_URL invalide',
    );
  });
});
