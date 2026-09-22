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
import { hashIp } from '@/lib/server/security';

const emailInput = z
  .object({
    confirmed: z.literal(true),
    to: z.email().max(254),
    subject: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(20_000),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, emailInput);
    await rateLimit(`email:${session.id}`, 30, 3_600);
    const configuration = env();
    if (
      !configuration.EMAIL_PROVIDER_URL ||
      !configuration.EMAIL_PROVIDER_API_KEY
    )
      throw new ApiError(
        503,
        'Fournisseur e-mail non configuré',
        'INTEGRATION_NOT_CONFIGURED',
      );
    const response = await fetch(configuration.EMAIL_PROVIDER_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${configuration.EMAIL_PROVIDER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to: body.to,
        subject: body.subject,
        text: body.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new ApiError(
        502,
        'Envoi refusé par le fournisseur',
        'PROVIDER_ERROR',
      );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'integration.email.sent',
      entityType: 'email',
      request,
      metadata: {
        recipientHash: hashIp(body.to),
        subjectLength: body.subject.length,
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
