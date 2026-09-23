import { z } from 'zod';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';
import {
  digestFrequencies,
  notificationCategories,
} from '@/lib/domain/notifications';

const input = z
  .object({
    category: z.enum(notificationCategories),
    inAppEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    digestFrequency: z.enum(digestFrequencies),
  })
  .strict();

export async function GET() {
  try {
    const session = await requireSession();
    const preferences = await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      select category, in_app_enabled as "inAppEnabled", email_enabled as "emailEnabled",
        digest_frequency as "digestFrequency"
      from notification_preferences
      where organization_id = ${session.organizationId} and user_id = ${session.id}`,
    );
    return Response.json({ preferences });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    await tenantTransaction(
      session.organizationId,
      (sql) => sql`
      insert into notification_preferences
        (organization_id, user_id, category, in_app_enabled, email_enabled, digest_frequency)
      values (${session.organizationId}, ${session.id}, ${body.category}, ${body.inAppEnabled},
        ${body.emailEnabled}, ${body.digestFrequency})
      on conflict (organization_id, user_id, category) do update set
        in_app_enabled = excluded.in_app_enabled,
        email_enabled = excluded.email_enabled,
        digest_frequency = excluded.digest_frequency,
        updated_at = now()`,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
