import { deleteOwnAccount } from '@/lib/server/gdpr';
import {
  assertSameOrigin,
  handleApiError,
  requireSession,
} from '@/lib/server/http';

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession();
    await deleteOwnAccount(session, request);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
