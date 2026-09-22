import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
const appUser = process.env.POSTGRES_APP_USER;
const appPassword = process.env.POSTGRES_APP_PASSWORD;
const sql = postgres(connection, { max: 1, onnotice: () => undefined });
const directory = resolve(process.cwd(), 'migrations');

try {
  await sql`create table if not exists schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  )`;
  const files = (await readdir(directory))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const source = await readFile(resolve(directory, file), 'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    const [existing] = await sql<Array<{ checksum: string }>>`
      select checksum from schema_migrations where filename = ${file}`;
    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(`Migration déjà appliquée mais modifiée: ${file}`);
      }
      console.log(`Already applied ${file}`);
      continue;
    }
    console.log(`Applying ${file}`);
    await sql.begin(async (transaction) => {
      await transaction.unsafe(source);
      await transaction`insert into schema_migrations (filename, checksum) values (${file}, ${checksum})`;
    });
  }
  if (appUser && appPassword) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(appUser))
      throw new Error('POSTGRES_APP_USER is invalid');
    const [role] = await sql<Array<{ exists: boolean }>>`
      select exists(select 1 from pg_roles where rolname = ${appUser}) as exists`;
    const [roleStatement] = await sql<Array<{ statement: string }>>`
      select format(
        ${role?.exists ? 'alter role %I login password %L' : 'create role %I login password %L'}::text,
        ${appUser}::text, ${appPassword}::text
      ) as statement`;
    await sql.unsafe(roleStatement.statement);
    const [databaseGrant] = await sql<Array<{ statement: string }>>`
      select format('grant connect on database %I to %I', current_database(), ${appUser}::text) as statement`;
    await sql.unsafe(databaseGrant.statement);
    const statements = await sql<Array<{ statement: string }>>`
      select format(template, ${appUser}::text) as statement
      from unnest(array[
        'grant usage on schema public to %I',
        'grant select, insert, update, delete on all tables in schema public to %I',
        'grant usage, select on all sequences in schema public to %I',
        'alter default privileges in schema public grant select, insert, update, delete on tables to %I',
        'alter default privileges in schema public grant usage, select on sequences to %I'
      ]) as statements(template)`;
    for (const { statement } of statements) await sql.unsafe(statement);
    console.log(`Runtime database role ready: ${appUser}`);
  }
} finally {
  await sql.end();
}
