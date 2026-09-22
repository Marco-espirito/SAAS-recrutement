import 'server-only';
import { ApiError } from './http';
import { db } from './db';

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const rows = await db()<Array<{ count: number; allowed: boolean }>>`
    insert into api_rate_limits (key, count, reset_at)
    values (${key}, 1, now() + (${windowSeconds} * interval '1 second'))
    on conflict (key) do update set
      count = case when api_rate_limits.reset_at <= now() then 1 else api_rate_limits.count + 1 end,
      reset_at = case when api_rate_limits.reset_at <= now() then now() + (${windowSeconds} * interval '1 second') else api_rate_limits.reset_at end
    returning count, count <= ${limit} as allowed`;
  if (!rows[0]?.allowed)
    throw new ApiError(
      429,
      'Trop de requêtes, réessayez plus tard',
      'RATE_LIMITED',
    );
}
