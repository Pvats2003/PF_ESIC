import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPORTS_DB, testDbUrl } from "../../scripts/db-test-setup";
import { ALOK_USER } from "./helpers";
import { Client as PgClient } from "pg";

// Uses the pristine copy so totals aren't mixed with other test files' rows.
const R = (r: number) => r * 100;
let c: Client;
let alok: string;
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
  c = new PgClient({ connectionString: testDbUrl(REPORTS_DB) });
  await c.connect();
  await c.query(`insert into auth.users (id, email) values ($1,'alok@example.com') on conflict do nothing`, [ALOK_USER]);
  alok = (await c.query(`select id from partners where code='A'`)).rows[0].id;
  rajeev = (await c.query(`select id from partners where code='R'`)).rows[0].id;
  await c.query(`insert into app_users (id, partner_id) values ($1,$2) on conflict do nothing`, [ALOK_USER, alok]);
  clientId = (await c.query(`insert into clients (firm_name, handled_by_partner_id, notes) values ('RECON FIRM',$1,null) returning id`, [alok])).rows[0].id;
  novId = (await c.query(
    `insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date, handled_by_partner_id)
     values ($1,'2033-11-01',$2,$3,$4,'us','2033-12-15',$5) returning id`, [clientId, R(10000), R(2000), R(500), alok])).rows[0].id;
  // The brief's example: Rajeev receives ₹12,500 and deposits PF ₹10,000 + ESIC ₹2,000
  await call(`select record_payment($1,$2,$3,'2033-12-05','cash',$4,'hi') r`, [randomUUID(), clientId, R(12500), rajeev]);
  await call(`select record_challan($1,'pf',$2,'2033-12-10','us',$3,'3162612004578') id`, [novId, R(10000), rajeev]);
  await call(`select record_challan($1,'esic',$2,'2033-12-10','us',$3,null,'42-001') id`, [novId, R(2000), rajeev]);
});
afterAll(async () => c.end());

describe("reconciliation", () => {
  it("separates received, government money, deposits and fees", async () => {
    const { r } = await call(`select reconciliation('2033-11-01','2033-12-31') r`);
    expect(r.totals).toMatchObject({ received: R(12500), gov_collected: R(12000), gov_deposited: R(12000), fees: R(500), advance: 0 });
    const raj = r.partners.find((p: { code: string }) => p.code === "R");
    expect(raj).toMatchObject({ received: R(12500), gov_collected: R(12000), gov_deposited: R(12000), fees: R(500) });
    expect(raj.gov_collected - raj.gov_deposited + raj.gov_handover).toBe(0); // nothing held
    expect(r.modes).toEqual([{ mode: "cash", received: R(12500), payments: 1 }]);
    const pf = r.gov.find((g: { typ: string }) => g.typ === "pf");
    expect(pf).toMatchObject({ due: R(10000), collected: R(10000), deposited: R(10000) });
    expect(r.mismatches).toEqual([]);
  });

  it("flags a challan whose amount differs from the PF entered, without changing anything", async () => {
    await asAlok(() => c.query(`update monthly_records set pf_paise=$2 where id=$1`, [novId, R(10100)]));
    const { r } = await call(`select reconciliation('2033-11-01','2033-12-31') r`);
    expect(r.mismatches.map((m: { kind: string }) => m.kind)).toContain("challan_amount");
    expect(r.totals.gov_deposited).toBe(R(12000));
  });
});

describe("settlement", () => {
  it("reports fees received per partner, fees earned per handler and the split", async () => {
    const { s } = await call(`select settlement('2033-12-01','2033-12-31') s`);
    const by = Object.fromEntries(s.partners.map((p: { code: string }) => [p.code, p]));
    expect(by.R).toMatchObject({ fees_received: R(500), earned_as_handler: 0, share_percent: 50 });
    expect(by.A).toMatchObject({ fees_received: 0, earned_as_handler: R(500), share_percent: 50 });
  });
});

describe("settings", () => {
  it("saves the business profile, a template and a new split", async () => {
    await call(`select save_settings($1)`, [JSON.stringify({ business_name_en: "Rajeev Kumar Mishra", business_name_hi: "राजीव कुमार मिश्रा", address_en: "Munger, Bihar", address_hi: "मुंगेर, बिहार", phones: ["+919430449312", "bad"], due_day: 14, reminder_days: [2, 5] })]);
    await call(`select save_template('overdue','en','Please pay {balance}')`);
    await call(`select set_split('2034-04-01', 60, 40)`);
    await expect(asAlok(() => c.query(`select set_split('2034-05-01', 60, 50)`))).rejects.toThrow(/100%/);
    const { g } = await call(`select settings_get() g`);
    expect(g.settings).toMatchObject({ due_day: 14, phones: ["+919430449312"], reminder_days: [5, 2] });
    expect(g.templates.overdue.en).toBe("Please pay {balance}");
    const { s } = await call(`select settlement('2034-04-01','2034-04-30') s`);
    expect(s.partners.map((p: { share_percent: number }) => p.share_percent)).toEqual([60, 40]);
  });
});

describe("receipt register", () => {
  it("lists receipts with void ones and their replacements", async () => {
    const { r } = await call(`select receipt_register('2000-01-01','2100-01-01') r`);
    const mine = r.filter((x: { firm_name: string }) => x.firm_name === "RECON FIRM");
    expect(mine).toHaveLength(1);
    const { n } = await call(`select reissue_receipt($1,'PF corrected','en') n`, [mine[0].id]);
    const { r2 } = await call(`select receipt_register('2000-01-01','2100-01-01') r2`);
    const after = r2.filter((x: { firm_name: string }) => x.firm_name === "RECON FIRM");
    expect(after.map((x: { voided: boolean }) => x.voided).sort()).toEqual([false, true]);
    expect(after.find((x: { receipt_no: string }) => x.receipt_no === n.receipt_no).replaces).toBe(mine[0].receipt_no);
  });
});
