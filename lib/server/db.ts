import postgres, { type Sql } from 'postgres';
import { env } from './env';

let client: Sql | undefined;

export function db() {
  client ??= postgres(env().DATABASE_URL, {
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => undefined,
  });
  return client;
}

export function jsonValue(value: unknown): postgres.JSONValue {
  return JSON.parse(JSON.stringify(value)) as postgres.JSONValue;
}

export async function tenantTransaction<T>(
  organizationId: string,
  work: (sql: postgres.TransactionSql) => Promise<T>,
) {
  return db().begin(async (sql) => {
    await sql`select set_config('app.organization_id', ${organizationId}, true)`;
    return work(sql);
  });
}
