import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  createMfaSecret,
  decryptSecret,
  encryptSecret,
  generateTotp,
  hashIp,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTotp,
} from '@/lib/server/security';

describe('security primitives', () => {
  it('hashes and verifies passwords without storing plaintext', async () => {
    const encoded = await hashPassword('Mot-de-passe-solide-2026!');
    expect(encoded).toMatch(/^scrypt:/);
    expect(encoded).not.toContain('Mot-de-passe-solide-2026!');
    await expect(
      verifyPassword('Mot-de-passe-solide-2026!', encoded),
    ).resolves.toBe(true);
    await expect(verifyPassword('mauvais', encoded)).resolves.toBe(false);
  });

  it('creates high-entropy opaque session tokens', () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(first)).toHaveLength(64);
    expect(hashToken(first)).not.toBe(first);
  });

  it('does not retain an IP address in clear text', () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp('203.0.113.42')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIp('203.0.113.42')).toBe(hashIp('203.0.113.42'));
  });

  it('generates and validates time-based MFA codes', () => {
    const secret = createMfaSecret();
    const timestamp = 1_800_000_000_000;
    const code = generateTotp(secret, timestamp);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, timestamp)).toBe(true);
    expect(verifyTotp(secret, '000000', timestamp)).toBe(code === '000000');
  });

  it('encrypts MFA secrets with authenticated encryption', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted, key)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret(`${encrypted}broken`, key)).toThrow();
  });
});
