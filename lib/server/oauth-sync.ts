import 'server-only';
import { z } from 'zod';
import { db, jsonValue, tenantTransaction } from './db';
import { ApiError } from './http';
import { connectionAccessToken, type OAuthProvider } from './oauth';

type SyncState = {
  gmailHistoryId?: string;
  gmailPageToken?: string;
  calendarSyncToken?: string;
  calendarPageToken?: string;
  graphMailLink?: string;
  graphCalendarLink?: string;
};
type SyncedItem = {
  kind: 'email' | 'event';
  remoteId: string;
  title: string;
  summary?: string;
  occurredAt?: Date;
  remoteUpdatedAt?: Date;
  deleted: boolean;
  metadata: Record<string, unknown>;
};

async function fetchProvider(url: string, token: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new ApiError(
      502,
      `Synchronisation refusée (${response.status})`,
      'SYNC_PROVIDER_ERROR',
    );
  return response.json() as Promise<unknown>;
}

function graphLink(value: string) {
  const url = new URL(value);
  if (
    url.origin !== 'https://graph.microsoft.com' ||
    !url.pathname.startsWith('/v1.0/me/')
  )
    throw new ApiError(
      400,
      'Curseur Microsoft invalide',
      'SYNC_CURSOR_INVALID',
    );
  return url.toString();
}

function dateOrUndefined(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const valueDate = new Date(value);
  return Number.isNaN(valueDate.getTime()) ? undefined : valueDate;
}

async function googleMail(token: string, state: SyncState) {
  const items: SyncedItem[] = [];
  let ids: string[] = [];
  let deletedIds: string[] = [];
  if (state.gmailHistoryId) {
    const url = new URL(
      'https://gmail.googleapis.com/gmail/v1/users/me/history',
    );
    url.searchParams.set('startHistoryId', state.gmailHistoryId);
    url.searchParams.set('maxResults', '100');
    if (state.gmailPageToken)
      url.searchParams.set('pageToken', state.gmailPageToken);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (response.status === 404)
      return {
        items,
        reset: true,
        state: {
          ...state,
          gmailHistoryId: undefined,
          gmailPageToken: undefined,
        },
      };
    if (!response.ok)
      throw new ApiError(
        502,
        `Gmail indisponible (${response.status})`,
        'SYNC_PROVIDER_ERROR',
      );
    const page = z
      .object({
        history: z
          .array(
            z.object({
              messagesAdded: z
                .array(z.object({ message: z.object({ id: z.string() }) }))
                .optional(),
              messagesDeleted: z
                .array(z.object({ message: z.object({ id: z.string() }) }))
                .optional(),
            }),
          )
          .optional(),
        nextPageToken: z.string().optional(),
        historyId: z.string().optional(),
      })
      .parse(await response.json());
    ids = (page.history ?? []).flatMap((entry) =>
      (entry.messagesAdded ?? []).map((value) => value.message.id),
    );
    deletedIds = (page.history ?? []).flatMap((entry) =>
      (entry.messagesDeleted ?? []).map((value) => value.message.id),
    );
    state = {
      ...state,
      gmailPageToken: page.nextPageToken,
      gmailHistoryId: page.nextPageToken
        ? state.gmailHistoryId
        : (page.historyId ?? state.gmailHistoryId),
    };
  } else {
    const profile = z
      .object({ historyId: z.string() })
      .parse(
        await fetchProvider(
          'https://gmail.googleapis.com/gmail/v1/users/me/profile',
          token,
        ),
      );
    const list = z
      .object({ messages: z.array(z.object({ id: z.string() })).optional() })
      .parse(
        await fetchProvider(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20',
          token,
        ),
      );
    ids = (list.messages ?? []).map((item) => item.id);
    state = {
      ...state,
      gmailHistoryId: profile.historyId,
      gmailPageToken: undefined,
    };
  }
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > 30 || deletedIds.length > 100)
    throw new ApiError(
      503,
      'Trop de changements Gmail pour un passage',
      'SYNC_OVERFLOW',
    );
  for (let offset = 0; offset < uniqueIds.length; offset += 10) {
    const batch = await Promise.all(
      uniqueIds.slice(offset, offset + 10).map(async (id) => {
        const raw = await fetchProvider(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          token,
        );
        const parsed = z
          .object({
            id: z.string(),
            snippet: z.string().optional(),
            internalDate: z.string().optional(),
            payload: z
              .object({
                headers: z
                  .array(z.object({ name: z.string(), value: z.string() }))
                  .optional(),
              })
              .optional(),
          })
          .parse(raw);
        const headers = parsed.payload?.headers ?? [];
        return {
          kind: 'email',
          remoteId: parsed.id,
          title:
            headers
              .find((value) => value.name.toLowerCase() === 'subject')
              ?.value?.slice(0, 300) ?? '(sans objet)',
          summary: parsed.snippet?.slice(0, 500),
          occurredAt: parsed.internalDate
            ? new Date(Number(parsed.internalDate))
            : undefined,
          deleted: false,
          metadata: {
            from:
              headers
                .find((value) => value.name.toLowerCase() === 'from')
                ?.value?.slice(0, 300) ?? '',
          },
        } as SyncedItem;
      }),
    );
    items.push(...batch);
  }
  for (const id of deletedIds)
    items.push({
      kind: 'email',
      remoteId: id,
      title: '',
      deleted: true,
      metadata: {},
    });
  return { items, state };
}

async function googleCalendar(token: string, state: SyncState) {
  const url = new URL(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  );
  url.searchParams.set('maxResults', '100');
  url.searchParams.set('showDeleted', 'true');
  if (state.calendarSyncToken)
    url.searchParams.set('syncToken', state.calendarSyncToken);
  if (state.calendarPageToken)
    url.searchParams.set('pageToken', state.calendarPageToken);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (response.status === 410)
    return {
      items: [] as SyncedItem[],
      reset: true,
      state: {
        ...state,
        calendarSyncToken: undefined,
        calendarPageToken: undefined,
      },
    };
  if (!response.ok)
    throw new ApiError(
      502,
      `Calendrier Google indisponible (${response.status})`,
      'SYNC_PROVIDER_ERROR',
    );
  const page = z
    .object({
      items: z
        .array(
          z.object({
            id: z.string(),
            status: z.string().optional(),
            summary: z.string().optional(),
            updated: z.string().optional(),
            start: z
              .object({
                dateTime: z.string().optional(),
                date: z.string().optional(),
              })
              .optional(),
            end: z
              .object({
                dateTime: z.string().optional(),
                date: z.string().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
      nextPageToken: z.string().optional(),
      nextSyncToken: z.string().optional(),
    })
    .parse(await response.json());
  const items: SyncedItem[] = (page.items ?? []).map((event) => ({
    kind: 'event',
    remoteId: event.id,
    title: event.summary?.slice(0, 300) ?? '(sans titre)',
    occurredAt: dateOrUndefined(event.start?.dateTime ?? event.start?.date),
    remoteUpdatedAt: dateOrUndefined(event.updated),
    deleted: event.status === 'cancelled',
    metadata: {
      startsAt: event.start?.dateTime ?? event.start?.date ?? null,
      endsAt: event.end?.dateTime ?? event.end?.date ?? null,
    },
  }));
  return {
    items,
    state: {
      ...state,
      calendarPageToken: page.nextPageToken,
      calendarSyncToken: page.nextSyncToken ?? state.calendarSyncToken,
    },
  };
}

async function microsoftDelta(
  token: string,
  state: SyncState,
  kind: 'email' | 'event',
) {
  const now = Date.now();
  const initial =
    kind === 'email'
      ? 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$select=id,subject,from,receivedDateTime,lastModifiedDateTime&$top=50'
      : `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(new Date(now - 30 * 86_400_000).toISOString())}&endDateTime=${encodeURIComponent(new Date(now + 90 * 86_400_000).toISOString())}`;
  const cursorKey = kind === 'email' ? 'graphMailLink' : 'graphCalendarLink';
  const raw = await fetchProvider(
    state[cursorKey] ? graphLink(state[cursorKey]) : initial,
    token,
  );
  const page = z
    .object({
      value: z.array(z.record(z.string(), z.unknown())).default([]),
      '@odata.nextLink': z.string().optional(),
      '@odata.deltaLink': z.string().optional(),
    })
    .parse(raw);
  const items: SyncedItem[] = page.value.flatMap((value) => {
    if (typeof value.id !== 'string') return [];
    const deleted = Boolean(value['@removed']) || value.isCancelled === true;
    const start =
      value.start && typeof value.start === 'object'
        ? (value.start as { dateTime?: unknown }).dateTime
        : undefined;
    const end =
      value.end && typeof value.end === 'object'
        ? (value.end as { dateTime?: unknown }).dateTime
        : undefined;
    const from =
      value.from && typeof value.from === 'object'
        ? (value.from as { emailAddress?: { address?: string } }).emailAddress
            ?.address
        : undefined;
    return [
      {
        kind,
        remoteId: value.id,
        title: (typeof value.subject === 'string'
          ? value.subject
          : '(sans objet)'
        ).slice(0, 300),
        occurredAt: dateOrUndefined(
          kind === 'email' ? value.receivedDateTime : start,
        ),
        remoteUpdatedAt: dateOrUndefined(value.lastModifiedDateTime),
        deleted,
        metadata:
          kind === 'email'
            ? { from: from ?? '' }
            : { startsAt: start ?? null, endsAt: end ?? null },
      },
    ];
  });
  const nextLink = page['@odata.nextLink'] ?? page['@odata.deltaLink'];
  return {
    items,
    state: {
      ...state,
      [cursorKey]: nextLink ? graphLink(nextLink) : state[cursorKey],
    },
  };
}

export async function syncOAuthConnection(
  organizationId: string,
  userId: string,
  provider: OAuthProvider,
) {
  if (provider === 'slack')
    throw new ApiError(
      400,
      'Slack ne fournit pas de boîte à synchroniser',
      'SYNC_NOT_SUPPORTED',
    );
  const [claimed] = await tenantTransaction(
    organizationId,
    (sql) => sql<Array<{ id: string; syncState: SyncState }>>`
    update oauth_connections set sync_lease_until = now() + interval '2 minutes'
    where organization_id = ${organizationId} and user_id = ${userId} and provider = ${provider}
      and disconnected_at is null and (sync_lease_until is null or sync_lease_until < now())
    returning id, sync_state as "syncState"`,
  );
  if (!claimed)
    throw new ApiError(
      409,
      'Synchronisation déjà en cours ou compte absent',
      'SYNC_BUSY',
    );
  try {
    const { accessToken } = await connectionAccessToken(
      organizationId,
      userId,
      provider,
    );
    let state = claimed.syncState ?? {};
    const mail =
      provider === 'google'
        ? await googleMail(accessToken, state)
        : await microsoftDelta(accessToken, state, 'email');
    state = mail.state;
    const calendar =
      provider === 'google'
        ? await googleCalendar(accessToken, state)
        : await microsoftDelta(accessToken, state, 'event');
    state = calendar.state;
    const items = [...mail.items, ...calendar.items];
    await tenantTransaction(organizationId, async (sql) => {
      if ('reset' in mail && mail.reset)
        await sql`update external_items set deleted_at = now(), updated_at = now()
          where organization_id = ${organizationId} and connection_id = ${claimed.id} and kind = 'email' and deleted_at is null`;
      if ('reset' in calendar && calendar.reset)
        await sql`update external_items set deleted_at = now(), updated_at = now()
          where organization_id = ${organizationId} and connection_id = ${claimed.id} and kind = 'event' and deleted_at is null`;
      for (const item of items) {
        await sql`insert into external_items (organization_id, connection_id, kind, remote_id, title, summary, occurred_at, remote_updated_at, deleted_at, metadata)
          values (${organizationId}, ${claimed.id}, ${item.kind}, ${item.remoteId}, ${item.title}, ${item.summary ?? null}, ${item.occurredAt ?? null}, ${item.remoteUpdatedAt ?? null}, ${item.deleted ? new Date() : null}, ${sql.json(jsonValue(item.metadata))})
          on conflict (connection_id, kind, remote_id) do update set
            title = excluded.title, summary = excluded.summary, occurred_at = excluded.occurred_at,
            remote_updated_at = excluded.remote_updated_at, deleted_at = excluded.deleted_at,
            metadata = excluded.metadata, updated_at = now()`;
      }
      await sql`update oauth_connections set sync_state = ${sql.json(jsonValue(state))}, last_synced_at = now(),
        sync_lease_until = null, next_sync_at = now() + interval '15 minutes', last_error = null, updated_at = now() where id = ${claimed.id} and organization_id = ${organizationId}`;
    });
    return {
      imported: items.filter((item) => !item.deleted).length,
      deleted: items.filter((item) => item.deleted).length,
    };
  } catch (error) {
    await tenantTransaction(
      organizationId,
      (
        sql,
      ) => sql`update oauth_connections set sync_lease_until = null, next_sync_at = now() + interval '1 hour',
      last_error = ${error instanceof ApiError ? error.code : 'SYNC_FAILED'}, updated_at = now()
      where id = ${claimed.id} and organization_id = ${organizationId}`,
    ).catch(() => {});
    throw error;
  }
}

export async function processNextOAuthSync() {
  const organizations = await db()<
    Array<{ id: string }>
  >`select id from organizations order by id limit 1000`;
  for (const organization of organizations) {
    const [due] = await tenantTransaction(
      organization.id,
      (sql) => sql<Array<{ userId: string; provider: OAuthProvider }>>`
      select user_id as "userId", provider from oauth_connections
      where organization_id = ${organization.id} and provider in ('google','microsoft')
        and disconnected_at is null and next_sync_at <= now()
        and (sync_lease_until is null or sync_lease_until < now())
      order by next_sync_at limit 1`,
    );
    if (!due) continue;
    try {
      await syncOAuthConnection(organization.id, due.userId, due.provider);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'warn',
          service: 'oauth-sync',
          provider: due.provider,
          code: error instanceof ApiError ? error.code : 'SYNC_FAILED',
        }),
      );
    }
    return true;
  }
  return false;
}
