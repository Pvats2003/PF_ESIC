/**
 * Local development database (no Supabase, no Docker): a Postgres database with
 * the Supabase shim, every migration, made-up demo clients and a demo partner.
 *
 *   npm run dev:db            # (re)creates the local database pfesic_dev
 *   npm run dev:local         # runs the app against it
 * Sign in as demo@pfesic.app / demo1234. Real data is never involved.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { seedDemo } from "./seed-demo";

const ADMIN = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const NAME = process.argv.find((a) => a.startsWith("--db="))?.split("=")[1] ?? "pfesic_dev";
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000000a";

export async function createLocalDb(name = NAME, clients = 38): Promise<string> {
  if (!/^pfesic_[a-z0-9_]+$/.test(name)) throw new Error("Local database names must start with pfesic_");
  const admin = new Client({ connectionString: ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const u = new URL(ADMIN);
  u.pathname = `/${name}`;
  const db = new Client({ connectionString: u.toString() });
  await db.connect();
  try {
    await db.query(readFileSync("tests/supabase-shim.sql", "utf8"));
    for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) {
      await db.query(readFileSync(join("supabase/migrations", f), "utf8"));
    }
    await db.query(`insert into auth.users (id, email) values ($1, 'demo@pfesic.app')`, [DEMO_USER_ID]);
    await db.query(`insert into public.app_users (id, partner_id) select $1, id from public.partners where code = 'A'`, [DEMO_USER_ID]);
    const r = await seedDemo(db, clients);
    console.log(`✓ ${name}: ${r.clients} demo clients, ${r.payments} payments`);
  } finally {
    await db.end();
  }
  return u.toString();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv.find((a) => a.startsWith("--clients="))?.split("=")[1] ?? 38);
  createLocalDb(NAME, n).then((url) => {
    console.log(`\nLOCAL_DATABASE_URL=${url}\nLOCAL_DEMO_USER_ID=${DEMO_USER_ID}`);
  });
}
