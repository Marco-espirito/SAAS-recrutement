import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const booleanValue = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
      : value,
  z.boolean(),
);

const schema = z.object({
  DATABASE_URL: z.url(),
  SESSION_COOKIE_NAME: z.string().default('nexora_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  APP_URL: z.url().default('http://localhost:3000'),
  APP_ENCRYPTION_KEY: optionalSecret,
  REQUIRE_EMAIL_VERIFICATION: booleanValue.default(false),
  EMAIL_PROVIDER_URL: optionalUrl,
  EMAIL_PROVIDER_API_KEY: optionalSecret,
  JOBS_PROVIDER_URL: optionalUrl,
  JOBS_PROVIDER_API_KEY: optionalSecret,
  CALENDAR_PROVIDER_URL: optionalUrl,
  CALENDAR_PROVIDER_API_KEY: optionalSecret,
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
