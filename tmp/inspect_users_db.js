const fs = require('fs');
const { Client } = require('C:/tmp/tailr4u-db-cleanup/node_modules/pg');

function readEnv(path) {
  const values = {};
  for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    let value = line.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

(async () => {
  const env = readEnv('backend/.env');
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 10000,
    query_timeout: 12000,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = await client.query(`
      SELECT current_database() AS database,
             current_user AS database_user,
             inet_server_addr()::text AS server_address
    `);
    const counts = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE id = '00000000-0000-0000-0000-000000000000'::uuid OR lower(email) = 'local.developer@example.com')::int AS local_developer,
        COUNT(*) FILTER (WHERE lower(email) LIKE 'migration-test-%')::int AS migration_test,
        COUNT(*) FILTER (WHERE lower(coalesce(full_name, '')) = 'test user')::int AS named_test_user,
        COUNT(*) FILTER (WHERE lower(email) ~ '^bot[0-9]+_[a-z0-9-]+$')::int AS bot_style
      FROM public.users
    `);
    const recent = await client.query(`
      SELECT email, full_name, provider, created_at
      FROM public.users
      ORDER BY created_at DESC
      LIMIT 12
    `);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ identity: identity.rows[0], counts: counts.rows[0], recent: recent.rows }, null, 2));
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
