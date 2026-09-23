import { z, ZodError } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const optionalAiProvider = z.preprocess(
  emptyToUndefined,
  z.enum(['openai', 'gemini']).optional(),
);
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
  AI_PROVIDER: optionalAiProvider,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  APP_URL: z.url().default('http://localhost:3000'),
  APP_ENCRYPTION_KEY: optionalSecret,
  REQUIRE_EMAIL_VERIFICATION: booleanValue.default(false),
  EMAIL_PROVIDER_URL: optionalUrl,
  EMAIL_PROVIDER_API_KEY: optionalSecret,
  JOBS_PROVIDER_URL: optionalUrl,
  JOBS_PROVIDER_API_KEY: optionalSecret,
  CALENDAR_PROVIDER_URL: optionalUrl,
  CALENDAR_PROVIDER_API_KEY: optionalSecret,
  GOOGLE_OAUTH_CLIENT_ID: optionalSecret,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalSecret,
  MICROSOFT_OAUTH_CLIENT_ID: optionalSecret,
  MICROSOFT_OAUTH_CLIENT_SECRET: optionalSecret,
  MICROSOFT_OAUTH_TENANT: z
    .union([z.enum(['organizations', 'common', 'consumers']), z.uuid()])
    .default('organizations'),
  SLACK_OAUTH_CLIENT_ID: optionalSecret,
  SLACK_OAUTH_CLIENT_SECRET: optionalSecret,
});

let cached: z.infer<typeof schema> | undefined;

export class EnvironmentValidationError extends Error {
  readonly fields: string[];

  constructor(cause: ZodError) {
    super('Invalid server configuration');
    this.name = 'EnvironmentValidationError';
    this.fields = [
      ...new Set(cause.issues.map((issue) => String(issue.path[0]))),
    ];
  }
}

export function env() {
  if (!cached) {
    try {
      cached = validateEnvironment(process.env);
    } catch (error) {
      if (error instanceof ZodError)
        throw new EnvironmentValidationError(error);
      throw error;
    }
  }
  return cached;
}

export function validateEnvironment(
  values: Record<string, string | undefined>,
): z.infer<typeof schema> {
  return schema.parse(values);
}
