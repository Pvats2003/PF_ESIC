"use client";

import { Check, ChevronLeft, CircleAlert, Loader2, Phone } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { setClientPhones } from "@/app/(app)/actions";
import { useLang } from "@/components/providers/lang-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { formatIndianPhone } from "@/lib/format/phone";
import { cn } from "@/lib/utils";
import type { ClientListRow } from "./clients-list";

type Field = "phone" | "whatsapp";
type State = { s: "saving" | "saved" | "error"; msg?: string };
const show = (p: string | null) => (p ? formatIndianPhone(p) : "");

/**
 * Type every client's phone in one list, like Fast entry. Enter moves down,
 * each row saves when you leave it. WhatsApp is only needed if it's a different number.
 */
export function PhoneEntry({ rows: all }: { rows: ClientListRow[] }) {
  const { t } = useLang();
  const rows = useMemo(() => all.filter((r) => r.active).sort((a, b) => a.firm_name.localeCompare(b.firm_name)), [all]);
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.id, { phone: show(r.phone), whatsapp: show(r.whatsapp_phone) }])));
  const saved = useRef(Object.fromEntries(rows.map((r) => [r.id, { phone: show(r.phone), whatsapp: show(r.whatsapp_phone) }])));
  const [state, setState] = useState<Record<string, State>>({});
  const [filter, setFilter] = useState<"missing" | "all">(() => (rows.some((r) => !r.phone && !r.whatsapp_phone) ? "missing" : "all"));
  // Rows stay in the list after they get a number, so the cursor doesn't jump while typing.
  const [listed] = useState(() => new Set(rows.filter((r) => !r.phone && !r.whatsapp_phone).map((r) => r.id)));
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const visible = filter === "all" ? rows : rows.filter((r) => listed.has(r.id));
  const done = rows.filter((r) => values[r.id].phone.trim() || values[r.id].whatsapp.trim()).length;

  async function save(id: string) {
    const v = values[id];
    if (v.phone === saved.current[id].phone && v.whatsapp === saved.current[id].whatsapp) return;
    setState((s) => ({ ...s, [id]: { s: "saving" } }));
    const r = await setClientPhones({ clientId: id, phone: v.phone, whatsapp: v.whatsapp });
    if (!r.ok) return setState((s) => ({ ...s, [id]: { s: "error", msg: r.error } }));
    const clean = { phone: show(r.data.phone), whatsapp: show(r.data.whatsapp) };
    saved.current[id] = clean;
    setValues((x) => ({ ...x, [id]: clean }));
    setState((s) => ({ ...s, [id]: { s: "saved" } }));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number, field: Field) {
    if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = visible[e.key === "ArrowUp" ? i - 1 : i + 1];
    if (next) inputs.current[`${next.id}:${field}`]?.focus();
    else (e.target as HTMLInputElement).blur();
  }

  function input(r: ClientListRow, i: number, field: Field) {
    return (
      <input
        ref={(el) => { inputs.current[`${r.id}:${field}`] = el; }}
        inputMode="tel"
        autoComplete="off"
        aria-label={field === "phone" ? t("Phone for {name}", { name: r.firm_name }) : t("WhatsApp for {name}", { name: r.firm_name })}
        aria-invalid={state[r.id]?.s === "error"}
        placeholder={field === "phone" ? "94304 49312" : t("Same as phone")}
        value={values[r.id][field]}
        onChange={(e) => setValues((x) => ({ ...x, [r.id]: { ...x[r.id], [field]: e.target.value } }))}
        onBlur={() => save(r.id)}
        onKeyDown={(e) => onKeyDown(e, i, field)}
        className={cn(
          "tabular h-11 w-full rounded-lg border border-transparent bg-surface-2 px-3 text-base text-ink outline-none transition-colors placeholder:text-ink-faint",
          "hover:border-hairline-strong focus:border-ring focus:bg-surface aria-invalid:border-danger",
        )}
      />
    );
  }

  function status(id: string) {
    const st = state[id];
    if (!st) return null;
    if (st.s === "saving") return <Loader2 aria-label={t("Saving")} className="size-4 animate-spin text-ink-faint" />;
    if (st.s === "saved") return <Check aria-label={t("Saved")} className="size-4 stroke-[2.5] text-success" />;
    return <CircleAlert aria-label={t(st.msg ?? "")} className="size-4 text-danger" />;
  }

  return (
    <div className="space-y-5">
      <Link href="/clients" className="inline-flex h-11 items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"><ChevronLeft className="size-4" />{t("Clients")}</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("Client phones")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("Type each number and press Enter for the next client. Everything saves as you go. Fill WhatsApp only if it's a different number.")}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="tabular text-sm text-ink-muted"><span className="text-lg font-semibold text-ink">{done}</span>/{rows.length} {t("have a phone")}</span>
          <Segmented ariaLabel={t("Show")} value={filter} onChange={setFilter} options={[{ value: "missing", label: t("Missing") }, { value: "all", label: t("All") }]} />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card><EmptyState icon={Phone} title={t("Every client has a phone")} body={t("Switch to All to change a number.")} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_220px_220px_28px] gap-4 border-b border-hairline bg-surface-2 px-5 py-2.5 text-xs font-semibold tracking-wide text-ink-muted uppercase md:grid">
            <span>{t("Client")}</span><span>{t("Phone")}</span><span>{t("WhatsApp (if different)")}</span><span />
          </div>
          <ul className="divide-y divide-hairline">
            {visible.map((r, i) => (
              <li key={r.id} className="grid gap-2 px-5 py-3 focus-within:bg-primary-soft/40 md:grid-cols-[1fr_220px_220px_28px] md:items-center md:gap-4">
                <div className="flex items-center justify-between gap-2 md:block">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.firm_name}</span>
                    {r.owner_name && <span className="block truncate text-xs text-ink-muted">{r.owner_name}</span>}
                  </span>
                  <span className="md:hidden">{status(r.id)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 md:contents">
                  {input(r, i, "phone")}
                  {input(r, i, "whatsapp")}
                </div>
                <span className="hidden md:block">{status(r.id)}</span>
                {state[r.id]?.s === "error" && <p className="text-xs text-danger md:col-span-4">{t(state[r.id].msg ?? "")}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
