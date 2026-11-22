import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, asRole, connect, seedBasics, STRANGER_USER } from "./helpers";

const R = (r: number) => r * 100;
let c: Client;
let rajeev: string;
let clientId: string;
let novId: string;

async function asAlok<T>(fn: () => Promise<T>): Promise<T> {
  await c.query("begin");
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ALOK_USER]);
    await c.query("set local role authenticated");
    const out = await fn();
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
const call = async (sql: string, params: unknown[] = []) => (await asAlok(() => c.query(sql, params))).rows[0];

beforeAll(async () => {
  c = await connect();
  const { alokId } = await seedBasics(c);
  rajeev = (await c.query(`select id from partners where code='R'`)).rows[0].id;
  clientId = (await c.query(`insert into clients (firm_name, owner_name, default_charge_paise, handled_by_partner_id) values ('BOARD FIRM','Ramesh',$1,$2) returning id`, [R(500), alokId])).rows[0].id;
  await c.query(`insert into client_aliases (client_id, raw_name, normalized_name) values ($1,'BOARD FIRM ENGG','BOARD FIRM ENGINEERING')`, [clientId]);
  await asAlok(() => c.query(`select start_month('2031-11-01')`));
  novId = (await c.query(`select id from monthly_records where client_id=$1 and wage_month='2031-11-01'`, [clientId])).rows[0].id;
});
afterAll(async () => c.end());

describe("board", () => {
  it("lists the month's clients with statuses, amounts and aliases for search", async () => {
    const { board } = await call(`select board('2031-11-01') board`);
    const row = board.rows.find((r: { client_id: string }) => r.client_id === clientId);
    expect(row).toMatchObject({ firm_name: "BOARD FIRM", amount_status: "AMOUNTS_PENDING", overall_status: "AMOUNTS_PENDING", charge_paise: R(500), partner_code: "A" });
    expect(row.aliases).toContain("BOARD FIRM ENGINEERING");
    expect(board.due_day).toBe(15);
    expect(board.not_started).toBe(0);
  });

  it("shows nothing to a non-partner", async () => {
    const out = await asRole(c, "authenticated", STRANGER_USER, () => c.query(`select board('2031-11-01') b`));
    expect(out.rows[0].b.rows).toEqual([]);
  });
});

describe("fast entry + payment + receipt", () => {
  it("saves PF/ESIC and returns the new status", async () => {
    const { s } = await call(`select set_month_amounts($1,$2,$3) s`, [novId, R(1000), R(200)]);
    expect(s).toMatchObject({ amount_status: "ENTERED", due_to_us: R(1700), owes: R(1700) });
    await expect(asAlok(() => c.query(`select set_month_amounts($1,-1,0)`, [novId]))).rejects.toThrow(/negative/);
  });

  it("a part payment's receipt shows dues, amount received and balance remaining", async () => {
    const { r } = await call(`select record_payment($1,$2,$3,'2031-12-05','cash',$4,'hi') r`, [randomUUID(), clientId, R(1200), rajeev]);
    const { d } = await call(`select receipt_data($1) d`, [r.receipt_id]);
    expect(d.lines.map((l: { kind: string; paise: number }) => [l.kind, l.paise])).toEqual([["pf", R(1000)], ["esic", R(200)], ["charge", R(500)]]);
    expect([d.dues, d.earlier, d.applied, d.advance_kept, d.balance_after]).toEqual([R(1700), 0, R(1200), 0, R(500)]);
    expect(d.payment).toMatchObject({ amount: R(1200), mode: "cash", received_by: "Rajeev" });
    expect(d.business.name_en).toBe("Rajeev Kumar Mishra");

    // Second payment clears it; its receipt shows what was received earlier
    const { r2 } = await call(`select record_payment($1,$2,$3,'2031-12-06','upi',$4,'en') r2`, [randomUUID(), clientId, R(500), rajeev]);
    const { d2 } = await call(`select receipt_data($1) d2`, [r2.receipt_id]);
    expect([d2.dues, d2.earlier, d2.applied, d2.balance_after]).toEqual([R(1700), R(1200), R(500), 0]);
  });

  it("client_detail has the money picture and the history", async () => {
    const { d } = await call(`select client_detail($1) d`, [clientId]);
    expect(d.balance).toEqual({ owes: 0, advance: 0 });
    expect(d.months[0]).toMatchObject({ wage_month: "2031-11-01", payment_status: "PAID" });
    expect(d.payments).toHaveLength(2);
    expect(d.payments[0].receipt_no).toMatch(/^R\//);
    expect(d.open_months).toEqual([]);
    expect(d.partners.map((p: { code: string }) => p.code)).toEqual(["A", "R"]);
  });
});

describe("log_message", () => {
  it("records prepared/shared and refuses delivered for manual WhatsApp", async () => {
    await call(`select log_message($1,'dues_we_pay','hi','x','shared',$2) id`, [clientId, novId]);
    const { board } = await call(`select board('2031-11-01') board`);
    expect(board.rows.find((r: { client_id: string }) => r.client_id === clientId).notification_status).toBe("NOTIFIED");
    await expect(asAlok(() => c.query(`select log_message($1,'receipt','hi','x','delivered')`, [clientId]))).rejects.toThrow(/prepared or shared/);
  });
});
