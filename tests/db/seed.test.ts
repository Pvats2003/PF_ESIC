import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SEED_DB, testDbUrl } from "../../scripts/db-test-setup";
import { seedDemo } from "../../scripts/seed-demo";

let c: Client;
beforeAll(async () => {
  c = new Client({ connectionString: testDbUrl(SEED_DB) });
  await c.connect();
});
afterAll(async () => c.end());

it("seeds the demo data once, with a receipt per payment", async () => {
  const r = await seedDemo(c);
  expect(r.clients).toBe(38);
  expect(r.records).toBe(114);
  expect(r.payments).toBeGreaterThan(10);
  expect((await seedDemo(c)).clients).toBe(0); // second run does nothing
  const { rows: [g] } = await c.query(`select count(*)::int n, min(seq) lo, max(seq) hi from receipts`);
  expect(g.n).toBe(r.payments);
  expect(g.hi - g.lo + 1).toBe(g.n); // gapless
});

it("refuses to run on a database with real clients", async () => {
  await c.query(`insert into clients (firm_name) values ('A REAL CLIENT')`);
  await expect(seedDemo(c)).rejects.toThrow(/real clients exist/);
});
