import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { jsonValue, tenantTransaction } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { connectionAccessToken, type OAuthProvider } from '@/lib/server/oauth';
import { rateLimit } from '@/lib/server/rate-limit';

const input = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('email'),
      provider: z.enum(['google', 'microsoft']),
      confirmed: z.literal(true),
      to: z.email(),
      subject: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((value) => !/[\r\n]/.test(value)),
      text: z.string().trim().min(1).max(20_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal('event'),
      provider: z.enum(['google', 'microsoft']),
      confirmed: z.literal(true),
      title: z.string().trim().min(1).max(200),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      description: z.string().max(5_000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('notification'),
      provider: z.enum(['slack', 'microsoft']),
      confirmed: z.literal(true),
      channelId: z.string().min(1).max(200),
      teamId: z.string().min(1).max(200).optional(),
      text: z.string().trim().min(1).max(4_000),
    })
    .strict(),
]);

async function providerPost(url: string, accessToken: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new ApiError(
      502,
      `Envoi refusé par le fournisseur (${response.status})`,
      'OAUTH_PROVIDER_ERROR',
    );
  return response;
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    if (
      body.kind === 'event' &&
      new Date(body.endsAt) <= new Date(body.startsAt)
    )
      throw new ApiError(400, 'Dates invalides', 'VALIDATION_ERROR');
    if (
      body.kind === 'notification' &&
      body.provider === 'microsoft' &&
      !body.teamId
    )
      throw new ApiError(400, 'Équipe Teams requise', 'VALIDATION_ERROR');
    await rateLimit(`oauth:send:${session.id}`, 30, 3_600);
    const provider = body.provider as OAuthProvider;
    const { connectionId, accessToken } = await connectionAccessToken(
      session.organizationId,
      session.id,
      provider,
    );
    let remoteId = `local:${randomUUID()}`;
    let title = '';
    let occurredAt = new Date();
    let metadata: Record<string, unknown> = {};
    if (body.kind === 'email') {
      title = body.subject;
      metadata = { to: body.to, direction: 'outbound' };
      if (provider === 'google') {
        const subject = `=?UTF-8?B?${Buffer.from(body.subject).toString('base64')}?=`;
        const content = Buffer.from(body.text, 'utf8').toString('base64');
        const mime = `To: ${body.to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}`;
        const response = await providerPost(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          accessToken,
          { raw: Buffer.from(mime).toString('base64url') },
        );
        const sent = z.object({ id: z.string() }).parse(await response.json());
        remoteId = sent.id;
      } else {
        await providerPost(
          'https://graph.microsoft.com/v1.0/me/sendMail',
          accessToken,
          {
            message: {
              subject: body.subject,
              body: { contentType: 'Text', content: body.text },
              toRecipients: [{ emailAddress: { address: body.to } }],
            },
            saveToSentItems: true,
          },
        );
      }
    } else if (body.kind === 'event') {
      title = body.title;
      occurredAt = new Date(body.startsAt);
      metadata = {
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        direction: 'outbound',
      };
      if (provider === 'google') {
        const response = await providerPost(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          accessToken,
          {
            summary: body.title,
            description: body.description ?? '',
            start: { dateTime: body.startsAt },
            end: { dateTime: body.endsAt },
          },
        );
        remoteId = z.object({ id: z.string() }).parse(await response.json()).id;
      } else {
        const response = await providerPost(
          'https://graph.microsoft.com/v1.0/me/events',
          accessToken,
          {
            subject: body.title,
            body: { contentType: 'Text', content: body.description ?? '' },
            start: {
              dateTime: new Date(body.startsAt).toISOString().replace(/Z$/, ''),
              timeZone: 'UTC',
            },
            end: {
              dateTime: new Date(body.endsAt).toISOString().replace(/Z$/, ''),
              timeZone: 'UTC',
            },
          },
        );
        remoteId = z.object({ id: z.string() }).parse(await response.json()).id;
      }
    } else {
      title =
        provider === 'slack' ? 'Notification Slack' : 'Notification Teams';
      metadata = {
        channelId: body.channelId,
        teamId: body.teamId ?? null,
        direction: 'outbound',
      };
      if (provider === 'slack') {
        const response = await providerPost(
          'https://slack.com/api/chat.postMessage',
          accessToken,
          { channel: body.channelId, text: body.text },
        );
        const sent = z
          .object({ ok: z.boolean(), ts: z.string().optional() })
          .parse(await response.json());
        if (!sent.ok)
          throw new ApiError(
            502,
            'Notification Slack refusée',
            'OAUTH_PROVIDER_ERROR',
          );
        remoteId = sent.ts ?? remoteId;
      } else {
        const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(body.teamId!)}/channels/${encodeURIComponent(body.channelId)}/messages`;
        const response = await providerPost(url, accessToken, {
          body: { contentType: 'text', content: body.text },
        });
        remoteId = z.object({ id: z.string() }).parse(await response.json()).id;
      }
    }
    await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      insert into external_items (organization_id, connection_id, kind, remote_id, title, occurred_at, metadata)
      values (${session.organizationId}, ${connectionId}, ${body.kind}, ${remoteId}, ${title}, ${occurredAt}, ${sql.json(jsonValue(metadata))})
      on conflict (connection_id, kind, remote_id) do update set title = excluded.title, occurred_at = excluded.occurred_at, metadata = excluded.metadata, updated_at = now()`,
    );
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: `integration.${body.kind}.sent`,
      entityType: 'external_item',
      request,
      metadata: { provider, kind: body.kind },
    });
    return Response.json({ ok: true, remoteId });
  } catch (error) {
    return handleApiError(error);
  }
}
