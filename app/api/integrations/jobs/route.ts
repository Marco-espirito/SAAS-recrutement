import { z } from 'zod';
import { env } from '@/lib/server/env';
import { ApiError, handleApiError, requireSession } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

const querySchema = z.object({
  query: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional(),
});

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  company: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(180),
  location: z.string().trim().max(160).default('Non précisé'),
  salary: z.string().trim().max(120).default('Non précisé'),
  match: z.number().int().min(0).max(100).default(0),
  skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  url: z.url().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    await rateLimit(`jobs:${session.id}`, 60, 3_600);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      query: url.searchParams.get('query'),
      location: url.searchParams.get('location') || undefined,
    });
    if (!parsed.success)
      throw new ApiError(400, 'Recherche invalide', 'VALIDATION_ERROR');
    const configuration = env();
    if (
      !configuration.JOBS_PROVIDER_URL ||
      !configuration.JOBS_PROVIDER_API_KEY
    )
      throw new ApiError(
        503,
        'Fournisseur d’offres non configuré',
        'INTEGRATION_NOT_CONFIGURED',
      );
    const providerUrl = new URL(configuration.JOBS_PROVIDER_URL);
    providerUrl.searchParams.set('query', parsed.data.query);
    if (parsed.data.location)
      providerUrl.searchParams.set('location', parsed.data.location);
    const response = await fetch(providerUrl, {
      headers: {
        authorization: `Bearer ${configuration.JOBS_PROVIDER_API_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'Fournisseur d’offres indisponible',
        'PROVIDER_ERROR',
      );
    const payload = z
      .object({ jobs: z.array(jobSchema).max(100) })
      .safeParse(await response.json());
    if (!payload.success)
      throw new ApiError(
        502,
        'Réponse du fournisseur invalide',
        'PROVIDER_ERROR',
      );
    return Response.json(payload.data);
  } catch (error) {
    return handleApiError(error);
  }
}
