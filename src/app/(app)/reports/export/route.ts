import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import type { RegisterRow } from "@/components/reports/reports-view";
import { getDb } from "@/lib/data/db";
import type { Board } from "@/lib/domain/board";
import { parsePeriod } from "@/lib/domain/period";
import { addMonths, formatDate, formatMonthShort } from "@/lib/format/dates";

/**
 * Excel backup in the partners' old layout: one sheet per wage month
 * (A1 = month, SL. NO. | CONTRACTOR | PF | ESIC | TOTAL | CHARGE | REMARK, a TOTAL row with formulas,
 * one-off work below it), plus a Payments sheet. Read-only: built from the same database functions as the screens.
 */
const INR = '[>=10000000]##\\,##\\,##\\,##0.##;[>=100000]##\\,##\\,##0.##;##,##0.##';
const rupees = (p: number | null | undefined) => (p === null || p === undefined ? null : p / 100);

export async function GET(req: NextRequest) {
  const db = await getDb();
  if (!db) return new Response("Not signed in", { status: 401 });
  const { from, to } = parsePeriod(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));

  const months: string[] = [];
  for (let m = from; m <= to && months.length < 36; m = addMonths(m, 1)) months.push(m);

  const wb = new ExcelJS.Workbook();
  wb.creator = "PF ESIC Desk";
  wb.created = new Date();

  for (const month of months.reverse()) {
    const [board, extras] = await Promise.all([
      db.rpc<Board>("board", { p_month: month }),
      db.rpc<Array<{ firm_name: string; description: string | null; service_type: string; amount: number; partner_code: string | null }>>("month_extras", { p_month: month }),
    ]);
    if (!board.rows.length && !extras.length) continue;
    const ws = wb.addWorksheet(formatMonthShort(month).toUpperCase());
    ws.columns = [{ width: 8 }, { width: 38 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 11 }, { width: 10 }];
    const a1 = ws.getCell("A1");
    a1.value = new Date(`${month}T00:00:00Z`);
    a1.numFmt = "mmm-yy";
    a1.font = { bold: true, size: 13 };
    const head = ws.addRow(["SL. NO.", "CONTRACTOR", "PF", "ESIC", "TOTAL", "CHARGE", "REMARK"]);
    head.font = { bold: true };
    head.eachCell((c) => { c.border = { bottom: { style: "thin" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1ECE4" } }; });

    const first = 3;
    board.rows.forEach((r, i) => {
      const row = ws.addRow([i + 1, r.firm_name, rupees(r.pf_paise), rupees(r.esic_paise), null, rupees(r.charge_paise), r.partner_code ?? "N"]);
      row.getCell(5).value = { formula: `IF(AND(C${row.number}="",D${row.number}=""),"",N(C${row.number})+N(D${row.number}))` };
    });
    const last = first + board.rows.length - 1;
    const total = ws.addRow([null, "TOTAL"]);
    if (board.rows.length) {
      for (const col of ["C", "D", "E", "F"]) total.getCell(col).value = { formula: `SUM(${col}${first}:${col}${last})` };
    }
    total.font = { bold: true };
    total.eachCell((c) => (c.border = { top: { style: "thin" } }));

    if (extras.length) {
      ws.addRow([]);
      const xh = ws.addRow(["SL. NO.", "NAME", "WORK", null, null, "CHARGE", "BY"]);
      xh.font = { bold: true };
      const xFirst = xh.number + 1;
      extras.forEach((e, i) => ws.addRow([i + 1, e.firm_name, e.description ?? e.service_type.replaceAll("_", " "), null, null, rupees(e.amount), e.partner_code ?? ""]));
      const xt = ws.addRow([null, "TOTAL", null, null, null, { formula: `SUM(F${xFirst}:F${xFirst + extras.length - 1})` }]);
      xt.font = { bold: true };
    }
    for (const col of ["C", "D", "E", "F"]) ws.getColumn(col).numFmt = INR;
    ws.views = [{ state: "frozen", ySplit: 2 }];
  }

  const receipts = await db.rpc<RegisterRow[]>("receipt_register", { p_from: from, p_to: to });
  const pay = wb.addWorksheet("PAYMENTS");
  pay.columns = [
    { header: "DATE", width: 12 }, { header: "RECEIPT NO.", width: 18 }, { header: "CLIENT", width: 38 }, { header: "AMOUNT", width: 13 },
    { header: "MODE", width: 8 }, { header: "RECEIVED BY", width: 13 }, { header: "STATUS", width: 32 },
  ];
  pay.getRow(1).font = { bold: true };
  for (const r of [...receipts].reverse()) {
    pay.addRow([formatDate(r.issued_on), r.receipt_no, r.firm_name, r.amount / 100, r.mode.toUpperCase(), r.received_by, r.voided ? `VOID: ${r.void_reason ?? ""}` : r.replaces ? `Replaces ${r.replaces}` : "Valid"]);
  }
  pay.getColumn("D").numFmt = INR;

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PF-ESIC-Desk-${from.slice(0, 7)}-to-${to.slice(0, 7)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
