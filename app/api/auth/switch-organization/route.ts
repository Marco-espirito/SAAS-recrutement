import { z } from 'zod';
import { replaceSession } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';

const input = z.object({ organizationId: z.uuid() }).strict();

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    const memberships = await db()<Array<{ role: string }>>`
      select role from memberships where user_id = ${session.id} and organization_id = ${body.organizationId}`;
    if (!memberships[0])
      throw new ApiError(403, 'Accès à cette organisation refusé', 'FORBIDDEN');
    await replaceSession(session.id, body.organizationId);
    await audit({
      organizationId: body.organizationId,
      actorId: session.id,
      action: 'organization.switched',
      entityType: 'organization',
      entityId: body.organizationId,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
