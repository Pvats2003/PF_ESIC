import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, asRole, connect, seedBasics, STRANGER_USER } from "./helpers";

const R = (rupees: number) => rupees * 100;
let c: Client;
let alok: string;
let rajeev: string;

/** Run as Alok (allow-listed), committing, like the app does. */
async function asAlok<T>(fn: (k: Client) => Promise<T>, k: Client = c): Promise<T> {
  await k.query("begin");
  try {
    await k.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ALOK_USER]);
    await k.query("set local role authenticated");
    const out = await fn(k);
    await k.query("commit");
    return out;
  } catch (e) {
    await k.query("rollback");
    throw e;
  }
}

async function newClient(name: string, payer: "us" | "client" = "us", charge = 500, handler: string | null = null): Promise<string> {
  return (await c.query(
    `insert into clients (firm_name, default_charge_paise, challan_payer_default, handled_by_partner_id) values ($1,$2,$3,$4) returning id`,
    [name, R(charge), payer, handler ?? alok])).rows[0].id;
}
async function month(clientId: string, m: string, pf: number | null, esic: number | null, charge: number, payer: "us" | "client" = "us", due?: string) {
  const dueDate = due ?? `${m.slice(0, 4)}-${String(Number(m.slice(5, 7)) % 12 + 1).padStart(2, "0")}-15`.replace(/^(\d{4})-01/, (_, y) => `${Number(y) + 1}-01`);
  return (await c.query(
    `insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date, handled_by_partner_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [clientId, m, pf === null ? null : R(pf), esic === null ? null : R(esic), R(charge), payer, dueDate, alok])).rows[0].id as string;
}
async function pay(clientId: string, amount: number, opts: { key?: string; useAdvance?: boolean; months?: string[]; on?: string; k?: Client } = {}) {
  return asAlok(async (k) => (await k.query(
    `select record_payment($1,$2,$3,$4,'upi',$5,'hi',null,null,$6,$7) r`,
    [opts.key ?? randomUUID(), clientId, R(amount), opts.on ?? "2026-12-08", rajeev, opts.months ?? null, opts.useAdvance ?? false],
  )).rows[0].r, opts.k);
}
const status = async (id: string) => (await c.query(`select * from month_status where monthly_record_id=$1`, [id])).rows[0];
const balance = async (clientId: string) => {
  const r = (await c.query(`select owes_paise::int owes, advance_paise::int adv from client_balances where client_id=$1`, [clientId])).rows[0];
  return { owes: r.owes / 100, advance: r.adv / 100 };
};
async function shareReceipt(paymentId: string, clientId: string) {
  await c.query(`insert into message_log (client_id, payment_id, type, language, body, status, shared_at) values ($1,$2,'receipt','hi','x','shared',now())`, [clientId, paymentId]);
}
async function challan(recordId: string, type: "pf" | "esic", amount: number, paidBy: "us" | "client", ref: string | null = "TRRN1") {
  return asAlok(async (k) => (await k.query(
    `select record_challan($1,$2,$3,'2026-12-12',$4,$5,$6,$7) id`,
    [recordId, type, R(amount), paidBy, paidBy === "us" ? rajeev : null, type === "pf" ? ref : null, type === "esic" ? ref : null],
  )).rows[0].id as string);
}

beforeAll(async () => {
  c = await connect();
  ({ alokId: alok } = await seedBasics(c));
  rajeev = (await c.query(`select id from partners where code='R'`)).rows[0].id;
});
afterAll(async () => c.end());

describe("rule 1: when is a challan done?", () => {
  it("we pay: a TRRN / challan number is enough, evidence optional", async () => {
    const cl = await newClient("RULE1 WE PAY");
    const m = await month(cl, "2026-11-01", 1000, 200, 500, "us", "2099-12-15");
    const p = await pay(cl, 1700);
    await challan(m, "pf", 1000, "us", "3162612004578");
    await challan(m, "esic", 200, "us", "42-0048812");
    await shareReceipt(p.payment_id, cl);
    const s = await status(m);
    expect([s.pf_challan_status, s.esic_challan_status]).toEqual(["PAID", "PAID"]);
    expect(s.overall_status).toBe("DONE");
  });

  it("client pays: Proof pending until evidence is confirmed by a partner", async () => {
    const cl = await newClient("RULE1 CLIENT PAYS", "client");
    const m = await month(cl, "2026-11-01", 1000, 200, 500, "client", "2099-12-15");
    const p = await pay(cl, 500);
    await shareReceipt(p.payment_id, cl);
    const pfId = await challan(m, "pf", 1000, "client", "3162612009999");
    const esicId = await challan(m, "esic", 200, "client", "42-1");
    expect((await status(m)).overall_status).toBe("PROOF_PENDING");

    await expect(asAlok((k) => k.query(`select verify_challan($1)`, [pfId]))).rejects.toThrow(/check constraint/);
    await asAlok((k) => k.query(`select verify_challan($1,'challans/pf.pdf')`, [pfId]));
    expect((await status(m)).overall_status).toBe("PROOF_PENDING"); // ESIC still unproven
    await asAlok((k) => k.query(`select verify_challan($1,'challans/esic.pdf')`, [esicId]));
    const s = await status(m);
    expect([s.pf_challan_status, s.esic_challan_status, s.overall_status]).toEqual(["VERIFIED", "VERIFIED", "DONE"]);
  });
});

describe("rule 2: ₹0 due to us", () => {
  it("an N client who pays their own challan needs no payment or receipt, and can reach Done", async () => {
    const cl = await newClient("RULE2 N CLIENT", "client", 0, null);
    await c.query(`update clients set handled_by_partner_id=null where id=$1`, [cl]);
    const m = await month(cl, "2026-11-01", 800, 100, 0, "client", "2099-12-15");
    let s = await status(m);
    expect([s.payment_status, s.receipt_status, s.due_to_us]).toEqual(["NOT_REQUIRED", "NOT_REQUIRED", "0"]);
    expect(s.overall_status).toBe("NOT_NOTIFIED"); // still needs the "challan ready" message
    await c.query(`insert into message_log (client_id, monthly_record_id, type, language, body, status) values ($1,$2,'challan_ready_client_pays','hi','x','shared')`, [cl, m]);
    for (const [t, amt] of [["pf", 800], ["esic", 100]] as const) {
      const id = await challan(m, t, amt, "client", "X1");
      await asAlok((k) => k.query(`select verify_challan($1,'challans/x.pdf')`, [id]));
    }
    s = await status(m);
    expect(s.overall_status).toBe("DONE");
  });

  it("a nil month (PF and ESIC both ₹0) needs no challan", async () => {
    const cl = await newClient("NIL MONTH", "us", 0, null);
    const m = await month(cl, "2026-11-01", 0, 0, 0, "us", "2099-12-15");
    const s = await status(m);
    expect([s.pf_challan_status, s.esic_challan_status, s.payment_status, s.overall_status]).toEqual(["NOT_REQUIRED", "NOT_REQUIRED", "NOT_REQUIRED", "DONE"]);
  });

  it("but amounts not entered yet are never ₹0 due", async () => {
    const cl = await newClient("NOT ENTERED", "us", 0, null);
    const m = await month(cl, "2026-11-01", null, null, 0, "us", "2099-12-15");
    const s = await status(m);
    expect([s.amount_status, s.payment_status, s.overall_status]).toEqual(["AMOUNTS_PENDING", "UNPAID", "AMOUNTS_PENDING"]);
  });
});

describe("record_payment", () => {
  it("covers the oldest month first, PF → ESIC → charge, and keeps the rest as advance", async () => {
    const cl = await newClient("PAY ORDER");
    const oct = await month(cl, "2026-10-01", 1000, 200, 500, "us", "2099-11-15");
    const nov = await month(cl, "2026-11-01", 1000, 200, 500, "us", "2099-12-15");
    expect(await balance(cl)).toEqual({ owes: 3400, advance: 0 });

    const r1 = await pay(cl, 1500); // Oct PF 1000 + Oct ESIC 200 + ₹300 of Oct charge
    expect(r1.receipt_no).toMatch(/^R\/2026-27\/\d{4}$/);
    const parts = (await c.query(`select component::text as component, amount_paise::int a from payment_allocations where payment_id=$1 order by payment_allocations.component`, [r1.payment_id])).rows;
    expect(parts).toEqual([{ component: "pf", a: R(1000) }, { component: "esic", a: R(200) }, { component: "charge", a: R(300) }]);
    expect((await status(oct)).payment_status).toBe("PART_PAID");
    expect((await status(nov)).payment_status).toBe("UNPAID");

    const r2 = await pay(cl, 2000); // rest of Oct (200) + all Nov (1700) + ₹100 advance
    expect(r2.advance_added_paise).toBe(R(100));
    expect(await balance(cl)).toEqual({ owes: 0, advance: 100 });
    expect((await status(nov)).payment_status).toBe("PAID");
  });

  it("can be limited to chosen months", async () => {
    const cl = await newClient("PAY CHOSEN");
    await month(cl, "2026-10-01", 100, 0, 0, "us", "2099-11-15");
    const nov = await month(cl, "2026-11-01", 100, 0, 0, "us", "2099-12-15");
    await pay(cl, 100, { months: [nov] });
    expect((await status(nov)).payment_status).toBe("PAID");
    expect(await balance(cl)).toEqual({ owes: 100, advance: 0 });
  });

  it("uses an advance only when asked ('Use ₹X advance?')", async () => {
    const cl = await newClient("ADVANCE");
    await pay(cl, 500); // nothing due yet → all advance
    const dec = await month(cl, "2026-12-01", 300, 0, 500, "us", "2099-01-15");
    expect(await balance(cl)).toEqual({ owes: 800, advance: 500 }); // never applied silently

    const r = await pay(cl, 300, { useAdvance: true });
    expect(r.advance_used_paise).toBe(R(500));
    expect(r.applied_paise).toBe(R(300));
    expect(await balance(cl)).toEqual({ owes: 0, advance: 0 });
    expect((await status(dec)).payment_status).toBe("PAID");
  });

  it("a double tap saves once and returns the same receipt", async () => {
    const cl = await newClient("DOUBLE TAP");
    await month(cl, "2026-11-01", 100, 0, 0, "us", "2099-12-15");
    const key = randomUUID();
    const a = await pay(cl, 100, { key });
    const b = await pay(cl, 100, { key });
    expect(b.duplicate).toBe(true);
    expect(b.receipt_no).toBe(a.receipt_no);
    expect((await c.query(`select count(*)::int n from payments where client_id=$1`, [cl])).rows[0].n).toBe(1);
  });

  it("two partners paying the same dues at once never double-apply them", async () => {
    const cl = await newClient("CONCURRENT");
    await month(cl, "2026-11-01", 1000, 0, 0, "us", "2099-12-15");
    const { connect: mk } = await import("./helpers");
    const [k1, k2] = await Promise.all([mk(), mk()]);
    await Promise.all([pay(cl, 1000, { k: k1 }), pay(cl, 1000, { k: k2 })]);
    await Promise.all([k1.end(), k2.end()]);
    // Dues covered exactly once; the second ₹1,000 is advance.
    expect(await balance(cl)).toEqual({ owes: 0, advance: 1000 });
    const { rows: [x] } = await c.query(`select sum(a.amount_paise)::int s from payment_allocations a join payments p on p.id=a.payment_id where p.client_id=$1`, [cl]);
    expect(x.s).toBe(R(1000));
  });

  it("refuses visitors and non-partners", async () => {
    const cl = await newClient("GUARDED");
    await expect(asRole(c, "anon", null, () => c.query(`select record_payment($1,$2,100,'2026-12-01','cash',$3,'hi')`, [randomUUID(), cl, rajeev]))).rejects.toThrow(/permission denied/);
    await expect(asRole(c, "authenticated", STRANGER_USER, () => c.query(`select record_payment($1,$2,100,'2026-12-01','cash',$3,'hi')`, [randomUUID(), cl, rajeev]))).rejects.toThrow(/Not allowed/);
  });
});

describe("corrections", () => {
  it("voiding a payment voids its receipt and puts the money back into 'owes'", async () => {
    const cl = await newClient("VOID ME");
    const m = await month(cl, "2026-11-01", 100, 0, 0, "us", "2099-12-15");
    const r = await pay(cl, 100);
    await expect(asAlok((k) => k.query(`select void_payment($1,'')`, [r.payment_id]))).rejects.toThrow(/reason/);
    await asAlok((k) => k.query(`select void_payment($1,'wrong client')`, [r.payment_id]));
    expect(await balance(cl)).toEqual({ owes: 100, advance: 0 });
    const s = await status(m);
    expect([s.payment_status, s.receipt_status]).toEqual(["UNPAID", "VOIDED"]);
  });

  it("raising PF after a receipt flags it for reissue; reissue gives a new number", async () => {
    const cl = await newClient("REISSUE");
    const m = await month(cl, "2026-11-01", 100, 0, 0, "us", "2099-12-15");
    const r = await pay(cl, 100);
    await asAlok((k) => k.query(`update monthly_records set pf_paise=$2 where id=$1`, [m, R(150)]));
    expect((await status(m)).receipt_needs_reissue).toBe(true);
    const n = await asAlok(async (k) => (await k.query(`select reissue_receipt($1,'PF corrected','en') r`, [r.receipt_id])).rows[0].r);
    expect(n.receipt_no).not.toBe(r.receipt_no);
    expect((await c.query(`select voided from receipts where id=$1`, [r.receipt_id])).rows[0].voided).toBe(true);
  });

  it("won't lower an amount below what's already received", async () => {
    const cl = await newClient("LOWER");
    const m = await month(cl, "2026-11-01", 100, 0, 0, "us", "2099-12-15");
    await pay(cl, 100);
    await expect(asAlok((k) => k.query(`update monthly_records set pf_paise=$2 where id=$1`, [m, R(50)]))).rejects.toThrow(/Void that payment first/);
  });

  it("corrects a challan by voiding and replacing it in one step", async () => {
    const cl = await newClient("CHALLAN FIX");
    const m = await month(cl, "2026-11-01", 100, 0, 0, "us", "2099-12-15");
    const first = await challan(m, "pf", 100, "us", "111");
    const second = await asAlok(async (k) => (await k.query(
      `select record_challan($1,'pf',$2,'2026-12-12','us',$3,'222',null,null,$4,'TRRN typo') id`, [m, R(100), rajeev, first])).rows[0].id);
    const rows = (await c.query(`select id, voided, trrn from challan_transactions where monthly_record_id=$1 order by created_at`, [m])).rows;
    expect(rows.map((x) => [x.voided, x.trrn])).toEqual([[true, "111"], [false, "222"]]);
    expect(rows[1].id).toBe(second);
  });
});

describe("start_month and overdue", () => {
  it("creates each active regular client once, with their defaults", async () => {
    const cl = await newClient("START ME", "client", 700);
    const walk = (await c.query(`insert into clients (firm_name, kind) values ('WALK IN','occasional') returning id`)).rows[0].id;
    const gone = (await c.query(`insert into clients (firm_name, active) values ('ARCHIVED', false) returning id`)).rows[0].id;
    const n1 = await asAlok(async (k) => (await k.query(`select start_month('2027-01-01') n`)).rows[0].n);
    const n2 = await asAlok(async (k) => (await k.query(`select start_month('2027-01-01') n`)).rows[0].n);
    expect(n1).toBeGreaterThan(0);
    expect(n2).toBe(0);
    const r = (await c.query(`select charge_paise::int ch, challan_payer, due_date::text d from monthly_records where client_id=$1 and wage_month='2027-01-01'`, [cl])).rows[0];
    expect(r).toEqual({ ch: R(700), challan_payer: "client", d: "2027-02-15" });
    expect((await c.query(`select count(*)::int n from monthly_records where client_id in ($1,$2)`, [walk, gone])).rows[0].n).toBe(0);
  });

  it("marks a month overdue after its due date when money or a challan is outstanding", async () => {
    const cl = await newClient("LATE");
    const m = await month(cl, "2025-01-01", 100, 0, 0, "us", "2025-02-15");
    const s = await status(m);
    expect([s.overdue, s.overall_status]).toEqual([true, "OVERDUE"]);
  });
});
