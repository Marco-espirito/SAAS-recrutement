import 'server-only';
import { db, jsonValue } from './db';
import { hashIp } from './security';

export async function audit(input: {
  organizationId?: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  request?: Request;
  metadata?: Record<string, unknown>;
}) {
  const forwarded =
    input.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  await db()`insert into audit_logs (organization_id, actor_id, action, entity_type, entity_id, ip_hash, metadata)
    values (${input.organizationId ?? null}, ${input.actorId ?? null}, ${input.action}, ${input.entityType}, ${input.entityId ?? null}, ${hashIp(forwarded)}, ${db().json(jsonValue(input.metadata ?? {}))})`;
}
