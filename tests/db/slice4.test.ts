import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, connect, seedBasics } from "./helpers";

const R = (r: number) => r * 100;
let c: Client;
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
  await seedBasics(c);
});
afterAll(async () => c.end());

describe("walk-in work", () => {
  it("creates the person, the charge and (if paid now) the payment with a receipt", async () => {
    const { w } = await call(`select record_walk_in($1) w`, [JSON.stringify({
      name: "Sikandar Raut", phone: "+919811122233", service_type: "pf_claim", description: "Form 19", amount_paise: R(200),
      partner_code: "R", paid_now: true, mode: "cash", idempotency_key: randomUUID(),
    })]);
    expect(w.payment.receipt_no).toMatch(/^R\//);
    const cl = (await c.query(`select kind, firm_name from clients where id=$1`, [w.client_id])).rows[0];
    expect(cl).toEqual({ kind: "occasional", firm_name: "Sikandar Raut" });
    const bal = (await c.query(`select owes_paise::int o from client_balances where client_id=$1`, [w.client_id])).rows[0].o;
    expect(bal).toBe(0);
  });

  it("reuses the same person next time (by phone), and an unpaid job leaves them owing", async () => {
    const { w } = await call(`select record_walk_in($1) w`, [JSON.stringify({
      name: "SIKANDAR RAUT", phone: "+919811122233", service_type: "registration", amount_paise: R(50), partner_code: "A", paid_now: false,
    })]);
    const n = (await c.query(`select count(*)::int n from clients where firm_name ilike 'sikandar raut'`)).rows[0].n;
    expect(n).toBe(1);
    expect(w.payment).toBeNull();
    expect((await c.query(`select owes_paise::int o from client_balances where client_id=$1`, [w.client_id])).rows[0].o).toBe(R(50));
  });

  it("refuses missing name, amount or partner", async () => {
    await expect(asAlok(() => c.query(`select record_walk_in('{"name":"","amount_paise":100,"partner_code":"A"}')`))).rejects.toThrow(/name/);
    await expect(asAlok(() => c.query(`select record_walk_in('{"name":"X","amount_paise":0,"partner_code":"A"}')`))).rejects.toThrow(/amount/);
    await expect(asAlok(() => c.query(`select record_walk_in('{"name":"X","amount_paise":100}')`))).rejects.toThrow(/who did the work/);
  });
});

describe("expenses and partner transfers", () => {
  it("are recorded, listed, included in settlement, and can be voided with a reason", async () => {
    const e = (await call(`select add_expense('2040-01-10', $1, 'Ink cartridge', 'R') id`, [R(1850)])).id;
    await call(`select add_partner_transfer('R','A',$1,'2040-01-20','settlement','January share') id`, [R(1000)]);
    const { m } = await call(`select money_moves('2040-01-01','2040-01-31') m`);
    expect(m.expenses).toHaveLength(1);
    expect(m.transfers[0]).toMatchObject({ from: "Rajeev", to: "Alok", amount: R(1000), kind: "settlement" });
    let { s } = await call(`select settlement('2040-01-01','2040-01-31') s`);
    let by = Object.fromEntries(s.partners.map((p: { code: string }) => [p.code, p]));
    expect([by.R.expenses_paid, by.R.transfers_net, by.A.transfers_net]).toEqual([R(1850), -R(1000), R(1000)]);
    await expect(asAlok(() => c.query(`select void_money_move('expense',$1,'')`, [e]))).rejects.toThrow(/reason/);
    await call(`select void_money_move('expense',$1,'entered twice')`, [e]);
    ({ s } = await call(`select settlement('2040-01-01','2040-01-31') s`));
    by = Object.fromEntries(s.partners.map((p: { code: string }) => [p.code, p]));
    expect(by.R.expenses_paid).toBe(0);
  });
});

describe("client statement", () => {
  it("shows opening dues, months in the year, payments and closing balance", async () => {
    const cl = (await c.query(`insert into clients (firm_name, default_charge_paise) values ('STATEMENT FIRM', $1) returning id`, [R(500)])).rows[0].id;
    for (const [m, due] of [["2041-03-01", "2041-04-15"], ["2041-04-01", "2041-05-15"], ["2041-05-01", "2041-06-15"]]) {
      await c.query(`insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date) values ($1,$2,0,0,$3,'us',$4)`, [cl, m, R(500), due]);
    }
    await call(`select record_payment($1,$2,$3,'2041-05-20','upi',(select id from partners where code='A'),'en') r`, [randomUUID(), cl, R(700)]);
    const { st } = await call(`select client_statement($1,'2041-04-01','2042-03-31') st`, [cl]);
    expect(st.opening).toBe(0); // March was paid first (oldest first)
    expect(st.months.map((x: { wage_month: string }) => x.wage_month)).toEqual(["2041-04-01", "2041-05-01"]);
    expect(st.payments).toHaveLength(1);
    expect(st.closing).toBe(R(800)); // 1,500 due − 700 paid
    const { st2 } = await call(`select client_statement($1,'2041-05-01','2041-05-31') st2`, [cl]);
    expect(st2.opening).toBe(R(300)); // April partly unpaid
  });
});

describe("fast phone entry", () => {
  it("changes only the phone and WhatsApp number", async () => {
    const id = (await c.query(`insert into clients (firm_name, default_charge_paise, notes) values ('Phone Test Works', 50000, 'keep me') returning id`)).rows[0].id;
    await call(`select set_client_phones($1, $2, $3)`, [id, "+919430449312", null]);
    const row = (await c.query(`select phone, whatsapp_phone, default_charge_paise::int charge, notes from clients where id=$1`, [id])).rows[0];
    expect(row).toEqual({ phone: "+919430449312", whatsapp_phone: null, charge: 50000, notes: "keep me" });
    await expect(call(`select set_client_phones($1, $2, $3)`, [id, "12345", null])).rejects.toThrow(/check/i); // stored numbers stay +91XXXXXXXXXX
  });

  it("is not available to anyone signed out", async () => {
    await c.query("begin");
    await c.query("set local role anon");
    await expect(c.query(`select set_client_phones(gen_random_uuid(), null, null)`)).rejects.toThrow(/permission denied/);
    await c.query("rollback");
  });
});
