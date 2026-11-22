import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALOK_USER, connect, insertPayment, seedBasics } from "./helpers";

let c: Client;
let clientId: string;
let alokId: string;
beforeAll(async () => {
  c = await connect();
  ({ clientId, alokId } = await seedBasics(c));
});
afterAll(async () => c.end());

async function issue(paymentId: string, lang = "en") {
  return asRoleCommit(() => c.query(`select receipt_no, seq, financial_year from issue_receipt($1, $2)`, [paymentId, lang]));
}

/** Like asRole but commits, so numbering is observable across transactions. */
async function asRoleCommit<T>(fn: () => Promise<T>): Promise<T> {
  await c.query("begin");
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ALOK_USER]);
    await c.query(`set local role authenticated`);
    const out = await fn();
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

describe("receipt numbering", () => {
  it("is gapless within a financial year and restarts on 1 April", async () => {
    const p1 = await insertPayment(c, clientId, alokId, "2027-03-30");
    const p2 = await insertPayment(c, clientId, alokId, "2027-03-31");
    const p3 = await insertPayment(c, clientId, alokId, "2027-04-01");
    const r1 = (await issue(p1)).rows[0];
    const r2 = (await issue(p2)).rows[0];
    const r3 = (await issue(p3)).rows[0];
    expect(r1.receipt_no).toBe("R/2026-27/0001");
    expect(r2.receipt_no).toBe("R/2026-27/0002");
    expect(r3.receipt_no).toBe("R/2027-28/0001");
  });

  it("gives the number back when the transaction fails", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-01");
    await expect(
      asRoleCommit(async () => {
        await c.query(`select issue_receipt($1, 'en')`, [p]);
        throw new Error("network dropped");
      }),
    ).rejects.toThrow("network dropped");
    expect((await issue(p)).rows[0].receipt_no).toBe("R/2026-27/0003");
  });

  it("never hands out the same number to two partners at once", async () => {
    const { connect: mk } = await import("./helpers");
    const conns = await Promise.all(Array.from({ length: 8 }, () => mk()));
    const pays = await Promise.all(conns.map(() => insertPayment(c, clientId, alokId, "2026-12-02")));
    const results = await Promise.all(
      conns.map(async (k, i) => {
        await k.query("begin");
        await k.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ALOK_USER]);
        await k.query("set local role authenticated");
        const r = await k.query(`select seq from issue_receipt($1, 'hi')`, [pays[i]]);
        await k.query("commit");
        await k.end();
        return r.rows[0].seq as number;
      }),
    );
    expect(results.sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("refuses a receipt for a void payment", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-03");
    await c.query(`update payments set voided=true, void_reason='entered twice' where id=$1`, [p]);
    await expect(issue(p)).rejects.toThrow(/void payment/);
  });
});

describe("issued receipts are never edited", () => {
  it("blocks edits, allows a one-way void with a reason, and a linked replacement", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-04");
    const { rows: [r] } = await asRoleCommit(() => c.query(`select * from issue_receipt($1,'en')`, [p]));
    await expect(c.query(`update receipts set language='hi' where id=$1`, [r.id])).rejects.toThrow(/cannot be edited/);
    await expect(c.query(`update receipts set voided=true where id=$1`, [r.id])).rejects.toThrow(/reason/);
    await c.query(`update receipts set voided=true, void_reason='PF amount corrected' where id=$1`, [r.id]);
    await expect(c.query(`update receipts set voided=false where id=$1`, [r.id])).rejects.toThrow(/void/);
    const { rows: [n] } = await asRoleCommit(() => c.query(`select * from issue_receipt($1,'en',$2)`, [p, r.id]));
    expect(n.replaces_receipt_id).toBe(r.id);
  });

  it("a replacement needs the old receipt voided first", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-05");
    const { rows: [r] } = await asRoleCommit(() => c.query(`select * from issue_receipt($1,'en')`, [p]));
    await expect(asRoleCommit(() => c.query(`select * from issue_receipt($1,'en',$2)`, [p, r.id]))).rejects.toThrow(/Void the old receipt/);
  });
});

describe("money rows", () => {
  it("payments cannot be edited, only voided", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-06");
    await expect(c.query(`update payments set amount_paise=1 where id=$1`, [p])).rejects.toThrow(/cannot be edited/);
    await c.query(`update payments set voided=true, void_reason='wrong client' where id=$1`, [p]);
    const { rows: [row] } = await c.query(`select voided_at from payments where id=$1`, [p]);
    expect(row.voided_at).not.toBeNull();
  });

  it("nothing money-related can be hard-deleted, even by the database owner", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-07");
    await expect(c.query(`delete from payments where id=$1`, [p])).rejects.toThrow(/cannot be deleted/);
    await expect(c.query(`delete from clients where id=$1`, [clientId])).rejects.toThrow(/cannot be deleted/);
  });

  it("writes an audit entry with the acting user", async () => {
    await asRoleCommit(() => c.query(`update clients set default_charge_paise=60000 where id=$1`, [clientId]));
    const { rows } = await c.query(
      `select actor, old_data->>'default_charge_paise' o, new_data->>'default_charge_paise' n
       from audit_log where table_name='clients' and row_id=$1 order by id desc limit 1`, [clientId]);
    expect(rows[0]).toMatchObject({ actor: ALOK_USER, o: "50000", n: "60000" });
  });

  it("allocations must target exactly one thing, and gov money only a month", async () => {
    const p = await insertPayment(c, clientId, alokId, "2026-12-08");
    await expect(
      c.query(`insert into payment_allocations (payment_id, component, amount_paise) values ($1,'charge',100)`, [p]),
    ).rejects.toThrow(/check constraint/);
  });

  it("wage months must be the 1st, PF blank means not entered", async () => {
    await expect(
      c.query(`insert into monthly_records (client_id, wage_month, challan_payer, due_date) values ($1,'2026-11-05','us','2026-12-15')`, [clientId]),
    ).rejects.toThrow(/check constraint/);
    const { rows: [m] } = await c.query(
      `insert into monthly_records (client_id, wage_month, challan_payer, due_date) values ($1,'2026-11-01','us','2026-12-15') returning pf_paise`, [clientId]);
    expect(m.pf_paise).toBeNull();
    await expect(
      c.query(`insert into monthly_records (client_id, wage_month, challan_payer, due_date) values ($1,'2026-11-01','us','2026-12-15')`, [clientId]),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("partner split", () => {
  it("defaults to 50/50", async () => {
    const { rows } = await c.query(`select percent::int p from split_rules order by p`);
    expect(rows.map((r) => r.p)).toEqual([50, 50]);
  });
  it("rejects a split that doesn't add up to 100%", async () => {
    await expect(
      c.query(`insert into split_rules (effective_from, partner_id, percent) values ('2027-04-01', $1, 60)`, [alokId]),
    ).rejects.toThrow(/must be 100%/);
  });
});

describe("phones and codes", () => {
  it("only stores normalised +91 numbers and 17-digit ESIC codes", async () => {
    await expect(c.query(`insert into clients (firm_name, phone) values ('X','9430449312')`)).rejects.toThrow(/check constraint/);
    await expect(c.query(`insert into clients (firm_name, esic_code) values ('X','4.2e16')`)).rejects.toThrow(/check constraint/);
    await c.query(`insert into clients (firm_name, phone, esic_code) values ('X','+919430449312','42002136830001001')`);
  });
});
