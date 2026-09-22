import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { env } from '@/lib/server/env';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

const eventInput = z
  .object({
    confirmed: z.literal(true),
    title: z.string().trim().min(1).max(200),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    attendeeEmail: z.email().max(254).optional(),
    location: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'La fin doit être postérieure au début',
    path: ['endsAt'],
  });

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, eventInput);
    await rateLimit(`calendar:${session.id}`, 30, 3_600);
    const configuration = env();
    if (
      !configuration.CALENDAR_PROVIDER_URL ||
      !configuration.CALENDAR_PROVIDER_API_KEY
    )
      throw new ApiError(
        503,
        'Fournisseur calendrier non configuré',
        'INTEGRATION_NOT_CONFIGURED',
      );
    const response = await fetch(configuration.CALENDAR_PROVIDER_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${configuration.CALENDAR_PROVIDER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: body.title,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        attendeeEmail: body.attendeeEmail,
        location: body.location,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'Création refusée par le fournisseur',
        'PROVIDER_ERROR',
      );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'integration.calendar.created',
      entityType: 'calendar_event',
      request,
      metadata: {
        startsAt: body.startsAt,
        hasAttendee: Boolean(body.attendeeEmail),
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
