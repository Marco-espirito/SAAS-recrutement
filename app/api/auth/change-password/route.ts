import { z } from 'zod';
import { createSession, invalidateAllSessions } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import {
  ApiError,
  handleApiError,
  readJson,
  requireSession,
} from '@/lib/server/http';
import { hashPassword, verifyPassword } from '@/lib/server/security';

const input = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await readJson(request, input);
    const users = await db()<Array<{ passwordHash: string }>>`
      select password_hash as "passwordHash" from users where id = ${session.id}`;
    if (
      !users[0] ||
      !(await verifyPassword(body.currentPassword, users[0].passwordHash))
    )
      throw new ApiError(
        401,
        'Mot de passe actuel incorrect',
        'INVALID_CREDENTIALS',
      );
    await db()`update users set password_hash = ${await hashPassword(body.newPassword)}, updated_at = now()
      where id = ${session.id}`;
    await invalidateAllSessions(session.id);
    await createSession(session.id, session.organizationId);
    await audit({
      organizationId: session.organizationId,
      actorId: session.id,
      action: 'auth.password.changed',
      entityType: 'user',
      entityId: session.id,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
