/**
 * Creates a throwaway database, applies the Supabase shim + every migration,
 * and leaves it ready for tests/db. Uses TEST_DATABASE_ADMIN_URL
 * (default postgres://postgres:postgres@localhost:5432/postgres).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
export const TEST_DB = "pfesic_test";

export const SEED_DB = "pfesic_seed_test";

export function testDbUrl(name: string = TEST_DB): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

export async function setupTestDatabase(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${SEED_DB} with (force)`);
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);

  const db = new Client({ connectionString: testDbUrl() });
  await db.connect();
  try {
    const root = process.cwd();
    await db.query(readFileSync(join(root, "tests/supabase-shim.sql"), "utf8"));
    const dir = join(root, "supabase/migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await db.query(readFileSync(join(dir, file), "utf8"));
      } catch (e) {
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }
  // A pristine copy with no test rows, for tests that need an empty database.
  await admin.query(`create database ${SEED_DB} template ${TEST_DB}`);
  await admin.end();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupTestDatabase().then(
    () => console.log(`✓ ${TEST_DB} ready`),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
