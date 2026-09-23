import 'server-only';
import { db, jsonValue, tenantTransaction } from './db';
import { emailProviderConfigured, sendSystemEmail } from './email';
import type { NotificationCategory } from '../domain/notifications';

export type NotifyInput = {
  organizationId: string;
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  dedupKey?: string;
};

/**
 * Creates an in-app notification, honoring the recipient's preference for
 * that category (defaults to enabled when no preference row exists yet).
 * A `dedupKey` makes repeated calls for the same event idempotent.
 */
export async function notify(input: NotifyInput) {
  return tenantTransaction(input.organizationId, async (sql) => {
    const [preference] = await sql<
      Array<{ inAppEnabled: boolean; emailEnabled: boolean }>
    >`select in_app_enabled as "inAppEnabled", email_enabled as "emailEnabled"
      from notification_preferences
      where organization_id = ${input.organizationId} and user_id = ${input.userId} and category = ${input.category}`;
    if (preference && !preference.inAppEnabled) return null;
    const rows = await sql<Array<{ id: string }>>`
      insert into notifications (organization_id, user_id, category, type, title, body, link, metadata, dedup_key)
      values (${input.organizationId}, ${input.userId}, ${input.category}, ${input.type}, ${input.title},
        ${input.body ?? null}, ${input.link ?? null}, ${sql.json(jsonValue(input.metadata ?? {}))}, ${input.dedupKey ?? null})
      on conflict (organization_id, user_id, dedup_key) where dedup_key is not null do nothing
      returning id`;
    if (rows[0] && preference?.emailEnabled && emailProviderConfigured()) {
      const [user] = await sql<Array<{ email: string }>>`
        select email::text from users where id = ${input.userId}`;
      if (user)
        await sendSystemEmail({
          to: user.email,
          subject: input.title,
          text: input.body ?? input.title,
        }).catch(() => undefined);
    }
    return rows[0]?.id ?? null;
  });
}

export async function generateReminderNotifications() {
  const rows = await db()<
    Array<{ taskReminders: number; interviewReminders: number }>
  >`select task_reminders as "taskReminders", interview_reminders as "interviewReminders"
    from generate_reminder_notifications()`;
  return rows[0];
}

export async function generateDigestNotifications() {
  const rows = await db()<Array<{ digestsSent: number }>>`
    select digests_sent as "digestsSent" from generate_digest_notifications()`;
  return rows[0];
}
