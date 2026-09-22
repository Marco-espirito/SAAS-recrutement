import { invalidateAllSessions } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import {
  handleApiError,
  requireSession,
  assertSameOrigin,
} from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    await invalidateAllSessions(session.id);
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'auth.sessions.invalidated',
      entityType: 'session',
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
