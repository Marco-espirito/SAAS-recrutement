import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { getSession, type Role, type SessionUser } from './auth';
import { env } from './env';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'REQUEST_FAILED',
  ) {
    super(message);
  }
}

export async function readJson<T>(request: Request, schema: ZodType<T>) {
  assertSameOrigin(request);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_048_576)
    throw new ApiError(
      413,
      'Corps de requête trop volumineux',
      'BODY_TOO_LARGE',
    );
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success)
    throw new ApiError(400, 'Données invalides', 'VALIDATION_ERROR');
  return result.data;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(env().APP_URL).origin;
  } catch {
    throw new ApiError(500, 'Configuration APP_URL invalide', 'CONFIG_ERROR');
  }

  if (origin !== expectedOrigin) {
    throw new ApiError(403, 'Origine de requête refusée', 'INVALID_ORIGIN');
  }
}

export async function requireSession(roles?: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session)
    throw new ApiError(401, 'Authentification requise', 'UNAUTHORIZED');
  if (roles && !roles.includes(session.role))
    throw new ApiError(403, 'Accès refusé', 'FORBIDDEN');
  return session;
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'Unhandled API error',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Une erreur interne est survenue',
      },
    },
    { status: 500 },
  );
}
