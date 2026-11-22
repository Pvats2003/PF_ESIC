import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, asRole, connect, seedBasics, STRANGER_USER } from "./helpers";

/*
 * The brief's example, end to end through the database:
 *   PF ₹10,000 + ESIC ₹2,000 + fee ₹500 = ₹12,500 received (by Rajeev)
 *   PF ₹10,000 and ESIC ₹2,000 deposited (by Rajeev)  →  earned ₹500, government money held ₹0
 */
let c: Client;
let clientId: string;
let rajeev: string;
let alok: string;
let novId: string;
let decId: string;

const R = (rupees: number) => rupees * 100;

async function sum(where: string, params: unknown[] = []): Promise<number> {
  const { rows } = await c.query(`select coalesce(sum(signed_paise),0)::bigint s from financial_ledger where client_id = $1 and ${where}`, [clientId, ...params]);
  return Number(rows[0].s);
}

beforeAll(async () => {
  c = await connect();
  ({ alokId: alok } = await seedBasics(c));
  rajeev = (await c.query(`select id from partners where code='R'`)).rows[0].id;
  clientId = (await c.query(`insert into clients (firm_name, handled_by_partner_id) values ('LEDGER TEST', $1) returning id`, [alok])).rows[0].id;
  novId = (await c.query(
    `insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date, handled_by_partner_id)
     values ($1,'2026-11-01',$2,$3,$4,'us','2026-12-15',$5) returning id`, [clientId, R(10000), R(2000), R(500), alok])).rows[0].id;
  decId = (await c.query(
    `insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date, handled_by_partner_id)
     values ($1,'2026-12-01',0,0,$2,'client','2027-01-15',$3) returning id`, [clientId, R(500), alok])).rows[0].id;
});
afterAll(async () => c.end());

async function pay(amount: number, by: string, on = "2026-12-10"): Promise<string> {
  return (await c.query(
    `insert into payments (client_id, amount_paise, received_on, mode, received_by_partner_id, idempotency_key)
     values ($1,$2,$3,'cash',$4,gen_random_uuid()) returning id`, [clientId, amount, on, by])).rows[0].id;
}
async function split(paymentId: string, recordId: string, part: string, amount: number, fromAdvance = false) {
  await c.query(
    `insert into payment_allocations (payment_id, monthly_record_id, component, amount_paise, from_advance) values ($1,$2,$3,$4,$5)`,
    [paymentId, recordId, part, amount, fromAdvance]);
}

describe("the brief's example", () => {
  it("keeps government money, fees and deposits apart", async () => {
    const p = await pay(R(12500), rajeev);
    await split(p, novId, "pf", R(10000));
    await split(p, novId, "esic", R(2000));
    await split(p, novId, "charge", R(500));
    await c.query(
      `insert into challan_transactions (monthly_record_id, challan_type, trrn, amount_paise, paid_on, paid_by, paid_by_partner_id)
       values ($1,'pf','3162612004578',$2,'2026-12-12','us',$3)`, [novId, R(10000), rajeev]);
    await c.query(
      `insert into challan_transactions (monthly_record_id, challan_type, challan_number, amount_paise, paid_on, paid_by, paid_by_partner_id)
       values ($1,'esic','42-0048812',$2,'2026-12-12','us',$3)`, [novId, R(2000), rajeev]);

    // Received
    expect(await sum(`direction='in' and not is_reversal`)).toBe(R(12500));
    expect(await sum(`event='pf_received'`)).toBe(R(10000));
    expect(await sum(`event='esic_received'`)).toBe(R(2000));
    // Earned = fees only, never the whole collection
    expect(await sum(`part in ('charge','extra')`)).toBe(R(500));
    // Deposited
    expect(-(await sum(`event in ('pf_deposited','esic_deposited')`))).toBe(R(12000));
    // Government money still with Rajeev = received PF+ESIC − deposited = 0
    expect(await sum(`part in ('pf','esic') and partner_id=$2`, [rajeev])).toBe(0);
  });
});

describe("advance, then used later", () => {
  it("tracks an advance until it is applied to a month", async () => {
    const p = await pay(R(800), alok, "2026-12-20");
    // Nothing applied yet: all ₹800 is advance
    expect(await sum(`part='advance' and payment_id=$2`, [p])).toBe(R(800));
    // Apply ₹500 to December's fee from the advance
    await split(p, decId, "charge", R(500), true);
    expect(await sum(`part='advance' and payment_id=$2`, [p])).toBe(R(300));
    expect(await sum(`part='charge' and monthly_record_id=$2`, [decId])).toBe(R(500));
    // Total money in from this payment is still exactly ₹800
    expect(await sum(`payment_id=$2`, [p])).toBe(R(800));
  });

  it("refuses to split a payment into more than it is", async () => {
    const p = await pay(R(100), alok);
    await expect(split(p, decId, "charge", R(150))).rejects.toThrow(/exceeds the payment/);
  });
});

describe("voids leave history and add a reversal", () => {
  it("nets a voided payment to zero without deleting anything", async () => {
    const p = await pay(R(500), alok, "2026-12-21");
    await split(p, decId, "charge", R(500));
    await c.query(`update payments set voided=true, void_reason='wrong client' where id=$1`, [p]);
    const { rows } = await c.query(`select event, is_reversal, signed_paise::int s from financial_ledger where payment_id=$1 order by is_reversal`, [p]);
    expect(rows).toEqual([
      { event: "charge_received", is_reversal: false, s: R(500) },
      { event: "charge_received", is_reversal: true, s: -R(500) },
    ]);
  });
});

describe("challans", () => {
  it("allows one active challan per type; corrections void and replace", async () => {
    await expect(c.query(
      `insert into challan_transactions (monthly_record_id, challan_type, trrn, amount_paise, paid_on, paid_by, paid_by_partner_id)
       values ($1,'pf','999',1,'2026-12-12','us',$2)`, [novId, rajeev])).rejects.toThrow(/duplicate key/);
    const old = (await c.query(`select id from challan_transactions where monthly_record_id=$1 and challan_type='pf' and not voided`, [novId])).rows[0].id;
    await expect(c.query(`update challan_transactions set amount_paise=1 where id=$1`, [old])).rejects.toThrow(/cannot be edited/);
    await c.query(`update challan_transactions set voided=true, void_reason='TRRN typo' where id=$1`, [old]);
    await c.query(
      `insert into challan_transactions (monthly_record_id, challan_type, trrn, amount_paise, paid_on, paid_by, paid_by_partner_id, replaces_id)
       values ($1,'pf','3162612004579',$2,'2026-12-12','us',$3,$4)`, [novId, R(10000), rajeev, old]);
    // Deposits still total ₹12,000 after the correction (old one reversed, new one added)
    expect(-(await sum(`event in ('pf_deposited','esic_deposited')`))).toBe(R(12000));
  });

  it("can't be verified without evidence, and verification is final", async () => {
    const id = (await c.query(`select id from challan_transactions where monthly_record_id=$1 and challan_type='esic' and not voided`, [novId])).rows[0].id;
    await expect(c.query(`update challan_transactions set verified_at=now(), verified_by=$2 where id=$1`, [id, ALOK_USER])).rejects.toThrow(/check constraint/);
    await c.query(`update challan_transactions set evidence_file_path='challans/x.pdf' where id=$1`, [id]);
    await c.query(`update challan_transactions set verified_at=now(), verified_by=$2 where id=$1`, [id, ALOK_USER]);
    await expect(c.query(`update challan_transactions set verified_at=null, verified_by=null where id=$1`, [id])).rejects.toThrow(/cannot be changed/);
  });

  it("needs to know which partner deposited when we pay", async () => {
    await expect(c.query(
      `insert into challan_transactions (monthly_record_id, challan_type, challan_number, amount_paise, paid_on, paid_by)
       values ($1,'esic','x',1,'2027-01-10','us')`, [decId])).rejects.toThrow(/check constraint/);
  });
});

describe("partner money and messages", () => {
  it("records both sides of a transfer", async () => {
    await c.query(`insert into partner_transfers (from_partner_id, to_partner_id, amount_paise, transferred_on, kind) values ($1,$2,125000,'2026-12-31','settlement')`, [rajeev, alok]);
    const { rows } = await c.query(`select partner_id, signed_paise::int s from financial_ledger where event like 'transfer_%' and amount_paise=125000 order by s`);
    expect(rows).toEqual([{ partner_id: rajeev, s: -125000 }, { partner_id: alok, s: 125000 }]);
  });

  it("never marks a manual WhatsApp share as delivered", async () => {
    await expect(c.query(
      `insert into message_log (client_id, type, language, body, channel, status) values ($1,'receipt','hi','x','whatsapp_manual','delivered')`, [clientId],
    )).rejects.toThrow(/message_status_matches_channel/);
    await c.query(`insert into message_log (client_id, type, language, body, status, shared_at) values ($1,'receipt','hi','x','shared',now())`, [clientId]);
  });
});

describe("access", () => {
  it("hides the money history from visitors and non-partners", async () => {
    await expect(asRole(c, "anon", null, () => c.query(`select * from financial_ledger`))).rejects.toThrow(/permission denied/);
    const n = await asRole(c, "authenticated", STRANGER_USER, async () => (await c.query(`select count(*)::int n from financial_ledger`)).rows[0].n);
    expect(n).toBe(0);
    const m = await asRole(c, "authenticated", ALOK_USER, async () => (await c.query(`select count(*)::int n from financial_ledger`)).rows[0].n);
    expect(m).toBeGreaterThan(0);
  });
  it.each(["challan_transactions", "import_batches", "import_row_log", "client_mapping_decisions"])("anon cannot read %s", async (t) => {
    await expect(asRole(c, "anon", null, () => c.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
  });
});
