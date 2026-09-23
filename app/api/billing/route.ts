import { planLimits } from '@/lib/domain/billing';
import { getOrganizationBilling, planIsActive } from '@/lib/server/billing';
import { tenantTransaction } from '@/lib/server/db';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    const session = await requireSession(['OWNER', 'ADMIN']);
    const billing = await getOrganizationBilling(session.organizationId);
    const [{ aiRequestsThisMonth, seatsUsed }] = await tenantTransaction(
      session.organizationId,
      (sql) => sql<Array<{ aiRequestsThisMonth: number; seatsUsed: number }>>`
        select
          (select count(*)::int from ai_usage_events
            where organization_id = ${session.organizationId} and created_at > date_trunc('month', now())) as "aiRequestsThisMonth",
          (select count(*)::int from memberships where organization_id = ${session.organizationId}) as "seatsUsed"`,
    );
    return Response.json({
      ...billing,
      active: planIsActive(billing),
      limits: planLimits[billing.plan],
      usage: { aiRequestsThisMonth, seatsUsed },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
