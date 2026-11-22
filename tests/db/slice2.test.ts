import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, asRole, connect, seedBasics, STRANGER_USER } from "./helpers";

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
const save = (id: string | null, data: object) => asAlok(async () => (await c.query(`select save_client($1,$2) id`, [id, JSON.stringify(data)])).rows[0].id as string);

beforeAll(async () => {
  c = await connect();
  await seedBasics(c);
});
afterAll(async () => c.end());

describe("save_client", () => {
  it("adds a client with normalised details and makes the name searchable", async () => {
    const id = await save(null, { firm_name: "ITC LIMITED TEST", owner_name: " Ravi ", phone: "+919430449312", default_charge_paise: 150000, partner_code: "R", challan_payer_default: "client", esic_code: "42002136830001001", esic_code_verified: true });
    const row = (await c.query(`select c.*, p.code from clients c left join partners p on p.id=c.handled_by_partner_id where c.id=$1`, [id])).rows[0];
    expect(row).toMatchObject({ firm_name: "ITC LIMITED TEST", owner_name: "Ravi", phone: "+919430449312", default_charge_paise: "150000", code: "R", challan_payer_default: "client", esic_code_verified: true });
    expect((await c.query(`select count(*)::int n from client_aliases where client_id=$1`, [id])).rows[0].n).toBe(1);
  });

  it("edits a client, and clearing the partner means N (no charge)", async () => {
    const id = await save(null, { firm_name: "EDIT ME", partner_code: "A", default_charge_paise: 50000 });
    await save(id, { firm_name: "EDIT ME", partner_code: "", default_charge_paise: 0, active: false });
    const row = (await c.query(`select handled_by_partner_id, default_charge_paise::int ch, active from clients where id=$1`, [id])).rows[0];
    expect(row).toEqual({ handled_by_partner_id: null, ch: 0, active: false });
    const audit = (await c.query(`select count(*)::int n from audit_log where table_name='clients' and row_id=$1 and action='UPDATE'`, [id])).rows[0].n;
    expect(audit).toBeGreaterThan(0);
  });

  it("refuses bad phones, short ESIC codes, negative charges and missing names", async () => {
    await expect(save(null, { firm_name: "X", phone: "9430449312" })).rejects.toThrow(/check constraint/);
    await expect(save(null, { firm_name: "X", esic_code: "4200213683" })).rejects.toThrow(/check constraint/);
    await expect(save(null, { firm_name: "X", default_charge_paise: -1 })).rejects.toThrow(/negative/);
    await expect(save(null, { firm_name: "  " })).rejects.toThrow(/Firm name/);
  });

  it("is refused for non-partners", async () => {
    await expect(asRole(c, "authenticated", STRANGER_USER, () => c.query(`select save_client(null, '{"firm_name":"X"}')`))).rejects.toThrow(/Not allowed/);
  });
});

describe("challan evidence", () => {
  it("attaches a file once, then the challan can be verified", async () => {
    const cl = await save(null, { firm_name: "PROOF FIRM", challan_payer_default: "client" });
    const m = (await c.query(`insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date) values ($1,'2032-01-01',100000,0,0,'client','2032-02-15') returning id`, [cl])).rows[0].id;
    const ch = await asAlok(async () => (await c.query(`select record_challan($1,'pf',100000,'2032-02-10','client',null,'31626') id`, [m])).rows[0].id);
    // Client-paid challan without proof: recorded (PAID) but not done
    expect((await c.query(`select pf_challan_status from month_status where monthly_record_id=$1`, [m])).rows[0].pf_challan_status).toBe("PAID");
    await asAlok(() => c.query(`select attach_challan_evidence($1,'challans/x.pdf')`, [ch]));
    await expect(asAlok(() => c.query(`select attach_challan_evidence($1,'challans/y.pdf')`, [ch]))).rejects.toThrow(/already has a file/);
    await asAlok(() => c.query(`select verify_challan($1)`, [ch]));
    expect((await c.query(`select pf_challan_status from month_status where monthly_record_id=$1`, [m])).rows[0].pf_challan_status).toBe("VERIFIED");
  });
});

describe("message_setup", () => {
  it("returns every template in both languages and the business name", async () => {
    const r = await asAlok(async () => (await c.query(`select message_setup() s`)).rows[0].s);
    expect(Object.keys(r.templates).sort()).toEqual(["challan_filed", "challan_ready_client_pays", "dues_we_pay", "overdue", "payment_received"]);
    expect(r.templates.dues_we_pay.hi).toContain("कुल देय राशि");
    expect(r.business).toMatchObject({ name_en: "Rajeev Kumar Mishra", due_day: 15 });
  });
});
