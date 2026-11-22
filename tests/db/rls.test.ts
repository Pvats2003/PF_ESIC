import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, asRole, connect, seedBasics, STRANGER_USER } from "./helpers";

const TABLES = [
  "partners", "split_rules", "app_users", "clients", "client_aliases", "monthly_records", "extra_charges",
  "attachments", "payments", "payment_allocations", "receipt_counters", "receipts", "expenses",
  "partner_transfers", "message_log", "settings", "message_templates", "audit_log",
];

let c: Client;
let clientId: string;
beforeAll(async () => {
  c = await connect();
  ({ clientId } = await seedBasics(c));
});
afterAll(async () => c.end());

describe("logged-out visitors (anon)", () => {
  it.each(TABLES)("cannot read %s", async (t) => {
    await expect(asRole(c, "anon", null, () => c.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/);
  });
  it("cannot insert a client", async () => {
    await expect(asRole(c, "anon", null, () => c.query(`insert into clients (firm_name) values ('x')`))).rejects.toThrow(/permission denied/);
  });
  it("cannot call issue_receipt", async () => {
    await expect(
      asRole(c, "anon", null, () => c.query(`select issue_receipt(gen_random_uuid(), 'en')`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("logged-in but not allow-listed", () => {
  it.each(TABLES)("sees zero rows in %s", async (t) => {
    const res = await asRole(c, "authenticated", STRANGER_USER, () => c.query(`select count(*)::int n from public.${t}`)).catch((e) => e);
    if (res instanceof Error) expect(res.message).toMatch(/permission denied/);
    else expect(res.rows[0].n).toBe(0);
  });
  it("cannot insert", async () => {
    await expect(
      asRole(c, "authenticated", STRANGER_USER, () => c.query(`insert into clients (firm_name) values ('x')`)),
    ).rejects.toThrow(/row-level security/);
  });
  it("cannot issue receipts", async () => {
    await expect(
      asRole(c, "authenticated", STRANGER_USER, () => c.query(`select issue_receipt(gen_random_uuid(), 'en')`)),
    ).rejects.toThrow(/Not allowed/);
  });
});

describe("allow-listed partner", () => {
  it("reads clients and settings", async () => {
    const n = await asRole(c, "authenticated", ALOK_USER, async () => (await c.query(`select count(*)::int n from clients`)).rows[0].n);
    expect(n).toBeGreaterThan(0);
    const s = await asRole(c, "authenticated", ALOK_USER, async () => (await c.query(`select business_name_en from settings`)).rows);
    expect(s).toHaveLength(1);
  });
  it("can add and edit a client", async () => {
    await asRole(c, "authenticated", ALOK_USER, async () => {
      await c.query(`insert into clients (firm_name) values ('NEW FIRM')`);
      const r = await c.query(`update clients set notes='hi' where id=$1`, [clientId]);
      expect(r.rowCount).toBe(1);
    });
  });
  it("cannot delete anything (delete is silently filtered by RLS)", async () => {
    const r = await asRole(c, "authenticated", ALOK_USER, () => c.query(`delete from clients where id=$1`, [clientId]));
    expect(r.rowCount).toBe(0);
  });
  it("cannot read or touch the receipt counter", async () => {
    const n = await asRole(c, "authenticated", ALOK_USER, async () => (await c.query(`select count(*)::int n from receipt_counters`)).rows[0].n);
    expect(n).toBe(0);
    await expect(
      asRole(c, "authenticated", ALOK_USER, () => c.query(`select * from take_receipt_number(current_date)`)),
    ).rejects.toThrow(/permission denied/);
  });
  it("cannot write the audit log", async () => {
    await expect(
      asRole(c, "authenticated", ALOK_USER, () => c.query(`insert into audit_log (table_name, action) values ('x','INSERT')`)),
    ).rejects.toThrow(/row-level security|permission denied/);
  });
});
