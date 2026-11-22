/**
 * Runs against the real workbook when it is present in data/ (it is gitignored,
 * so CI skips this). Guards the promise that imported totals match the Excel.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readWorkbook } from "@/lib/import/excel-grid";
import { collectOccurrences, suggestMapping } from "@/lib/import/mapping";
import { orderSheets } from "@/lib/import/parse-workbook";

const FILE = "data/Contractor_PF_ESIC_Amount.xlsx";

describe.skipIf(!existsSync(FILE))("real workbook", () => {
  it("every filled month's client charges equal its TOTAL row, and below-TOTAL lines equal their subtotal", async () => {
    const sheets = await readWorkbook(FILE);
    const { ordered } = orderSheets(sheets.filter((s) => s.total));
    expect(ordered.length).toBeGreaterThanOrEqual(15);
    for (const s of ordered.filter((x) => !x.listOnly)) {
      const sum = s.clientRows.reduce((a, r) => a + (r.chargePaise ?? 0), 0);
      expect(sum, s.sheetName).toBe(s.total!.valuePaise);
      if (s.extrasSubtotal) expect(s.extras.reduce((a, e) => a + e.amountPaise, 0), s.sheetName).toBe(s.extrasSubtotal.valuePaise ?? 0);
    }
  });

  it("keeps the different Rajesh and Sunil clients apart", async () => {
    const sheets = await readWorkbook(FILE);
    const rows = suggestMapping(collectOccurrences(sheets));
    const clients = new Set(rows.filter((r) => r.kind === "client").map((r) => r.suggested_client));
    for (const name of ["RAJESH KUMAR", "RAJESH KUMAR MALAKAR", "SUNIL KUMAR", "SUNIL AND SONS", "SUNIL ENTERPRISES"]) expect(clients).toContain(name);
    expect(rows.find((r) => r.raw_name.startsWith("UTTAM ENGG"))?.suggested_client).toBe("UTTAM ENGINEERING");
  });
});
