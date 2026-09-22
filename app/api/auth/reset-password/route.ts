import { z } from 'zod';
import { createSession, invalidateAllSessions } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { db } from '@/lib/server/db';
import { ApiError, handleApiError, readJson } from '@/lib/server/http';
import { hashPassword, hashToken } from '@/lib/server/security';

const input = z
  .object({
    token: z.string().min(32).max(200),
    password: z.string().min(12).max(128),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = await readJson(request, input);
    const passwordHash = await hashPassword(body.password);
    const result = await db().begin(async (sql) => {
      const tokens = await sql<Array<{ userId: string }>>`
        delete from password_reset_tokens
        where token_hash = ${hashToken(body.token)} and expires_at > now()
        returning user_id as "userId"`;
      if (!tokens[0])
        throw new ApiError(400, 'Lien invalide ou expiré', 'INVALID_TOKEN');
      await sql`update users set password_hash = ${passwordHash}, updated_at = now()
        where id = ${tokens[0].userId}`;
      const memberships = await sql<Array<{ organizationId: string }>>`
        select organization_id as "organizationId" from memberships
        where user_id = ${tokens[0].userId} order by created_at asc limit 1`;
      return {
        userId: tokens[0].userId,
        organizationId: memberships[0].organizationId,
      };
    });
    await invalidateAllSessions(result.userId);
    await createSession(result.userId, result.organizationId);
    await audit({
      organizationId: result.organizationId,
      actorId: result.userId,
      action: 'auth.password.reset',
      entityType: 'user',
      entityId: result.userId,
      request,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
