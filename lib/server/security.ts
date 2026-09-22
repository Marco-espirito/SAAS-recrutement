import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltValue, hashValue] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashIp(value: string | null) {
  return value ? createHash('sha256').update(value).digest('hex') : null;
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function createMfaSecret() {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let encoded = '';
  for (let index = 0; index < bits.length; index += 5) {
    encoded +=
      base32Alphabet[
        Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)
      ];
  }
  return encoded;
}

function decodeBase32(value: string) {
  let bits = '';
  for (const character of value.replace(/=+$/g, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid base32 value');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

export function verifyTotp(
  secret: string,
  code: string,
  timestamp = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((window) => {
    const expected = Buffer.from(
      generateTotp(secret, timestamp + window * 30_000),
    );
    const actual = Buffer.from(code);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  });
}

function encryptionKey(value: string) {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw new Error('APP_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
  return key;
}

export function encryptSecret(secret: string, encodedKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((value) => value.toString('base64url'))
    .join('.');
}

export function decryptSecret(payload: string, encodedKey: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split('.');
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(encodedKey),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
