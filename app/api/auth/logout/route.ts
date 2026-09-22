import { destroySession, getSession } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { assertSameOrigin, handleApiError } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getSession();
    await destroySession();
    if (session)
      await audit({
        organizationId: session.organizationId,
        actorId: session.id,
        action: 'auth.logout',
        entityType: 'session',
        request,
      });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
