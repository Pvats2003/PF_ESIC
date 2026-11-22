/**
 * Loads made-up demo data (38 clients, Sep–Nov 2026) so the app can be shown
 * without real client data. Never run it against the real database: it
 * refuses if any non-demo client exists.
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/seed-demo.ts [--clients=200]
 */
import { Client } from "pg";
import { buildDemoData } from "../src/lib/demo/demo-data";

export const DEMO_NOTE = "DEMO DATA";

export async function seedDemo(db: Client, count = 38): Promise<{ clients: number; records: number; payments: number }> {
  const { rows: [{ real }] } = await db.query(`select count(*)::int as real from clients where coalesce(notes,'') <> $1`, [DEMO_NOTE]);
  if (real > 0) throw new Error(`Refusing to seed: ${real} real clients exist in this database.`);
  const { rows: [{ demo }] } = await db.query(`select count(*)::int as demo from clients where notes = $1`, [DEMO_NOTE]);
  if (demo > 0) return { clients: 0, records: 0, payments: 0 }; // already seeded

  const { clients, records } = buildDemoData(42, count);
  const partners = Object.fromEntries((await db.query(`select code, id from partners`)).rows.map((r) => [r.code, r.id]));
  const ids: Record<string, string> = {};
  let payments = 0;

  await db.query("begin");
  try {
    for (const c of clients) {
      const { rows: [row] } = await db.query(
        `insert into clients (firm_name, owner_name, phone, whatsapp_phone, pf_establishment_code, esic_code, esic_code_verified,
           default_charge_paise, handled_by_partner_id, challan_payer_default, preferred_language, notes)
         values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [c.firmName, c.ownerName, c.phone, c.pfCode, c.esicCode, c.esicVerified, c.chargePaise,
         c.partnerCode ? partners[c.partnerCode] : null, c.challanPayer, c.language, DEMO_NOTE],
      );
      ids[c.key] = row.id;
      await db.query(`insert into client_aliases (client_id, raw_name, normalized_name) values ($1,$2,upper($2))`, [row.id, c.firmName]);
    }

    for (const r of records) {
      const clientId = ids[r.clientKey];
      const { rows: [rec] } = await db.query(
        `insert into monthly_records (client_id, wage_month, pf_paise, esic_paise, charge_paise, challan_payer, due_date,
           handled_by_partner_id, legacy_settled, pf_trrn, pf_paid_on, esic_paid_on, challan_paid_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12) returning id`,
        [clientId, r.month, r.pfPaise, r.esicPaise, r.chargePaise, r.challanPayer, r.dueDate,
         r.partnerCode ? partners[r.partnerCode] : null, r.legacySettled, r.pfTrrn, r.challanPaidOn,
         r.challanPaidOn ? r.challanPayer : null],
      );
      if (r.notified) {
        await db.query(
          `insert into message_log (client_id, monthly_record_id, type, language, body, sent_at)
           values ($1,$2,$3,'hi','(demo reminder)', ($4::date - 6)::timestamptz)`,
          [clientId, rec.id, r.challanPayer === "us" ? "dues_we_pay" : "challan_ready_client_pays", r.dueDate],
        );
      }
      if (r.legacySettled || r.paid === "none" || r.pfPaise === null) continue;

      const gov = r.challanPayer === "us" ? (r.pfPaise ?? 0) + (r.esicPaise ?? 0) : 0;
      const due = gov + r.chargePaise;
      const amount = r.paid === "full" ? due : Math.round(due / 200) * 100; // roughly half, whole rupees
      if (amount <= 0) continue;
      const receivedOn = r.dueDate.slice(0, 8) + "08";
      const { rows: [pay] } = await db.query(
        `insert into payments (client_id, amount_paise, received_on, mode, received_by_partner_id, idempotency_key)
         values ($1,$2,$3,$4,$5,gen_random_uuid()) returning id`,
        [clientId, amount, receivedOn, payments % 3 === 0 ? "cash" : "upi", partners[r.partnerCode ?? "A"]],
      );
      // Government money first, then the fee
      const govPart = Math.min(gov, amount);
      if (govPart > 0) await db.query(`insert into payment_allocations (payment_id, monthly_record_id, component, amount_paise) values ($1,$2,'gov',$3)`, [pay.id, rec.id, govPart]);
      if (amount - govPart > 0) await db.query(`insert into payment_allocations (payment_id, monthly_record_id, component, amount_paise) values ($1,$2,'fee',$3)`, [pay.id, rec.id, amount - govPart]);
      const { rows: [n] } = await db.query(`select * from take_receipt_number($1)`, [receivedOn]);
      await db.query(
        `insert into receipts (receipt_no, financial_year, seq, payment_id, client_id, language) values ($1,$2,$3,$4,$5,'hi')`,
        [n.out_receipt_no, n.out_financial_year, n.out_seq, pay.id, clientId],
      );
      payments++;
    }
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
  return { clients: clients.length, records: records.length, payments };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (local Supabase: postgres://postgres:postgres@127.0.0.1:54322/postgres)");
    process.exit(1);
  }
  const count = Number(process.argv.find((a) => a.startsWith("--clients="))?.split("=")[1] ?? 38);
  const db = new Client({ connectionString: url });
  db.connect()
    .then(() => seedDemo(db, count))
    .then((r) => console.log(r.clients ? `✓ Seeded ${r.clients} demo clients, ${r.records} month records, ${r.payments} payments` : "Demo data already present, nothing to do"))
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.end());
}
