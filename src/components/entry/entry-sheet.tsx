"use client";

import { Check, ChevronLeft, CircleAlert, Keyboard, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { saveAmounts } from "@/app/(app)/actions";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import { ClientPaysChip } from "@/components/ui/status-chip";
import type { Board, BoardRow } from "@/lib/domain/board";
import { formatMonth } from "@/lib/format/dates";
import { parseRupeesToPaise } from "@/lib/format/money";
import { cn } from "@/lib/utils";

type Field = "pf" | "esic";
type SaveState = "idle" | "saving" | "saved" | "error";
const toText = (p: number | null) => (p === null ? "" : p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

/**
 * Spreadsheet-style PF/ESIC entry. Desktop: Tab moves across, Enter moves down
 * the same column. Each value saves on blur (autosave), with a tick per row.
 */
export function EntrySheet({ board }: { board: Board }) {
  const [values, setValues] = useState<Record<string, { pf: string; esic: string }>>(() =>
    Object.fromEntries(board.rows.map((r) => [r.monthly_record_id, { pf: toText(r.pf_paise), esic: toText(r.esic_paise) }])),
  );
  const [state, setState] = useState<Record<string, { s: SaveState; msg?: string }>>({});
  const saved = useRef<Record<string, { pf: number | null; esic: number | null }>>(
    Object.fromEntries(board.rows.map((r) => [r.monthly_record_id, { pf: r.pf_paise, esic: r.esic_paise }])),
  );
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const rows = board.rows;
  const totals = useMemo(() => {
    let pf = 0, esic = 0, done = 0;
    for (const r of rows) {
      const v = values[r.monthly_record_id];
      const p = parseRupeesToPaise(v.pf), e = parseRupeesToPaise(v.esic);
      pf += p ?? 0;
      esic += e ?? 0;
      if (p !== null && e !== null) done++;
    }
    return { pf, esic, done };
  }, [rows, values]);

  async function save(r: BoardRow) {
    const v = values[r.monthly_record_id];
    const pf = v.pf.trim() === "" ? null : parseRupeesToPaise(v.pf);
    const esic = v.esic.trim() === "" ? null : parseRupeesToPaise(v.esic);
    if ((v.pf.trim() !== "" && pf === null) || (v.esic.trim() !== "" && esic === null)) {
      return setState((s) => ({ ...s, [r.monthly_record_id]: { s: "error", msg: "Use numbers like 15674 or 2479.50" } }));
    }
    const prev = saved.current[r.monthly_record_id];
    if (prev.pf === pf && prev.esic === esic) return;
    setState((s) => ({ ...s, [r.monthly_record_id]: { s: "saving" } }));
    const res = await saveAmounts({ recordId: r.monthly_record_id, pf, esic });
    if (res.ok) {
      saved.current[r.monthly_record_id] = { pf, esic };
      setState((s) => ({ ...s, [r.monthly_record_id]: { s: "saved" } }));
    } else {
      setState((s) => ({ ...s, [r.monthly_record_id]: { s: "error", msg: res.error } }));
    }
  }

  // Desktop table and phone cards are separate inputs (one is hidden by CSS), so each layout keeps its own refs.
  const refKey = (layout: "d" | "m", id: string, field: Field) => `${layout}:${id}:${field}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number, field: Field, layout: "d" | "m") {
    if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = rows[e.key === "ArrowUp" ? i - 1 : i + 1];
    if (next) inputs.current[refKey(layout, next.monthly_record_id, field)]?.focus();
    else (e.target as HTMLInputElement).blur();
  }

  function cell(r: BoardRow, i: number, field: Field, big = false) {
    const id = r.monthly_record_id;
    const st = state[id]?.s;
    return (
      <div className="relative">
        <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint", big ? "text-lg" : "text-sm")}>₹</span>
        <input
          ref={(el) => { inputs.current[refKey(big ? "m" : "d", id, field)] = el; }}
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${field.toUpperCase()} for ${r.firm_name}`}
          aria-invalid={st === "error"}
          value={values[id][field]}
          onChange={(e) => setValues((v) => ({ ...v, [id]: { ...v[id], [field]: e.target.value } }))}
          onBlur={() => save(r)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => onKeyDown(e, i, field, big ? "m" : "d")}
          placeholder="—"
          className={cn(
            "tabular w-full rounded-lg border border-transparent bg-surface-2 text-right font-semibold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-faint",
            "hover:border-hairline-strong focus:border-ring focus:bg-surface focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)]",
            "aria-invalid:border-danger",
            big ? "h-14 pr-4 pl-8 text-xl" : "h-10 pr-3 pl-7 text-base",
          )}
        />
      </div>
    );
  }

  function status(id: string) {
    const st = state[id];
    if (!st || st.s === "idle") return null;
    if (st.s === "saving") return <Loader2 aria-label="Saving" className="size-4 animate-spin text-ink-faint" />;
    if (st.s === "saved") return <Check aria-label="Saved" className="size-4 stroke-[2.5] text-success" />;
    return <span title={st.msg}><CircleAlert aria-label={st.msg} className="size-4 text-danger" /></span>;
  }

  const monthQ = board.month.slice(0, 7);
  return (
    <div>
      <Link href={`/?month=${monthQ}`} className="inline-flex h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"><ChevronLeft className="size-4" />{formatMonth(board.month)}</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Enter PF and ESIC</h1>
          <p className="mt-1 hidden items-center gap-1.5 text-sm text-ink-muted lg:flex"><Keyboard className="size-4" />Tab moves across, Enter moves down. Everything saves as you go.</p>
          <p className="mt-1 text-sm text-ink-muted lg:hidden">Each amount saves when you move to the next box.</p>
        </div>
        <div className="flex gap-6 text-right">
          <div><div className="text-xs text-ink-muted uppercase">PF</div><Money paise={totals.pf} size="lg" /></div>
          <div><div className="text-xs text-ink-muted uppercase">ESIC</div><Money paise={totals.esic} size="lg" /></div>
          <div><div className="text-xs text-ink-muted uppercase">Entered</div><span className="tabular text-lg font-semibold">{totals.done}<span className="text-ink-faint">/{rows.length}</span></span></div>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="mt-6"><EmptyState icon={Keyboard} title={`${formatMonth(board.month)} hasn't started`} body="Start the month on the This month page first." /></Card>
      ) : (
        <>
          {/* Desktop: one dense sheet */}
          <Card className="mt-6 hidden overflow-hidden lg:block">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:h-10 [&>th]:border-b [&>th]:border-hairline [&>th]:bg-surface-2 [&>th]:px-4 [&>th]:text-xs [&>th]:font-semibold [&>th]:tracking-wide [&>th]:text-ink-muted [&>th]:uppercase">
                  <th className="w-12 text-left">#</th>
                  <th className="text-left">Client</th>
                  <th className="w-48 text-right">PF</th>
                  <th className="w-48 text-right">ESIC</th>
                  <th className="w-36 text-right">PF + ESIC</th>
                  <th className="w-10"><span className="sr-only">Saved</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const v = values[r.monthly_record_id];
                  const sum = (parseRupeesToPaise(v.pf) ?? 0) + (parseRupeesToPaise(v.esic) ?? 0);
                  return (
                    <tr key={r.monthly_record_id} className="[&>td]:h-12 [&>td]:border-b [&>td]:border-hairline [&>td]:px-4 focus-within:[&>td]:bg-primary-soft/40">
                      <td className="tabular text-ink-faint">{i + 1}</td>
                      <td>
                        <span className="font-medium">{r.firm_name}</span>
                        {r.challan_payer === "client" && <span className="ml-2 align-middle"><ClientPaysChip /></span>}
                        {state[r.monthly_record_id]?.s === "error" && <span className="block text-xs text-danger">{state[r.monthly_record_id]?.msg}</span>}
                      </td>
                      <td>{cell(r, i, "pf")}</td>
                      <td>{cell(r, i, "esic")}</td>
                      <td className="tabular text-right text-ink-muted"><Money paise={sum} size="sm" className="font-normal" /></td>
                      <td>{status(r.monthly_record_id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Phone: one card per client, big keypad-friendly fields */}
          <div className="mt-5 space-y-3 lg:hidden">
            {rows.map((r, i) => (
              <Card key={r.monthly_record_id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-2 font-semibold">{r.firm_name}</span>
                  {status(r.monthly_record_id)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-xs font-medium text-ink-muted">PF{cell(r, i, "pf", true)}</label>
                  <label className="text-xs font-medium text-ink-muted">ESIC{cell(r, i, "esic", true)}</label>
                </div>
                {state[r.monthly_record_id]?.s === "error" && <p className="mt-2 text-xs text-danger">{state[r.monthly_record_id]?.msg}</p>}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
