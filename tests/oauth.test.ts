import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createOAuthChallenge, providerSchema } from '@/lib/server/oauth';
import { hashToken } from '@/lib/server/security';

describe('OAuth flow primitives', () => {
  it('creates unique, hashed one-time state and PKCE S256 challenge', () => {
    const first = createOAuthChallenge();
    const second = createOAuthChallenge();
    expect(first.state).not.toBe(second.state);
    expect(first.stateHash).toBe(hashToken(first.state));
    expect(first.stateHash).not.toContain(first.state);
    expect(first.challenge).toBe(
      createHash('sha256').update(first.verifier).digest('base64url'),
    );
    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects unrecognized providers', () => {
    expect(providerSchema.safeParse('google').success).toBe(true);
    expect(providerSchema.safeParse('attacker.example').success).toBe(false);
  });
});
