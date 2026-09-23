import { audit } from '@/lib/server/audit';
import { buildAccountDataExport } from '@/lib/server/gdpr';
import { handleApiError, requireSession } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    await rateLimit(`account:export:${session.id}`, 5, 3_600);
    const bundle = await buildAccountDataExport(session);
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'account.data_exported',
      entityType: 'user',
      entityId: session.id,
      request,
    });
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        'content-type': 'application/json',
        'content-disposition':
          'attachment; filename="nexora-donnees-personnelles.json"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
