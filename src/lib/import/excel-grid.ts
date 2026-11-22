/** exceljs → plain grids for parse-workbook.ts. Used by the import script and tests only (never the app). */
import ExcelJS from "exceljs";
import { parseSheet, type Cell, type CellValue, type ParsedSheet, type SheetGrid } from "./parse-workbook";

export function cellOf(c: ExcelJS.Cell): Cell {
  const v = c.value as unknown;
  if (v === null || v === undefined) return { v: null };
  if (v instanceof Date || typeof v === "number" || typeof v === "string") return { v: v as CellValue };
  if (typeof v === "object") {
    const o = v as { formula?: string; sharedFormula?: string; result?: unknown; richText?: Array<{ text: string }>; error?: string; text?: string };
    if (o.richText) return { v: o.richText.map((t) => t.text).join("") };
    if (o.formula !== undefined || o.sharedFormula !== undefined) {
      const r = o.result;
      const val = r instanceof Date || typeof r === "number" || typeof r === "string" ? (r as CellValue) : null;
      return { v: val, f: o.formula ?? c.formula ?? o.sharedFormula };
    }
    if (o.text) return { v: o.text };
  }
  return { v: null };
}

export function toGrid(ws: ExcelJS.Worksheet): SheetGrid {
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const cells: Cell[] = [];
    for (let c = 1; c <= Math.max(10, row.cellCount); c++) cells[c - 1] = cellOf(row.getCell(c));
    rows[r - 1] = cells;
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return { name: ws.name, rows };
}


/** Reads a workbook read-only and parses every sheet. */
export async function readWorkbook(path: string): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb.worksheets.map((ws) => parseSheet(toGrid(ws)));
}
