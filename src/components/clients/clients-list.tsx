"use client";

import { Phone, Search, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLang } from "@/components/providers/lang-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Segmented } from "@/components/ui/segmented";
import { Chip, ClientPaysChip } from "@/components/ui/status-chip";
import { matchesSearch } from "@/lib/domain/board";
import { AddClientButton } from "./client-form-sheet";
import { ContactButton } from "@/components/messages/contact-sheet";
import { cn } from "@/lib/utils";

export interface ClientListRow {
  id: string; firm_name: string; owner_name: string | null; phone: string | null; whatsapp_phone: string | null; kind: "regular" | "occasional"; active: boolean;
  default_charge_paise: number; challan_payer_default: "us" | "client"; partner_code: "A" | "R" | null; partner_name: string | null;
  esic_code: string | null; esic_code_verified: boolean; owes: number; advance: number; aliases: string[];
}

type Show = "active" | "owes" | "check" | "all";

export function ClientsList({ rows }: { rows: ClientListRow[] }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("active");
  const { t } = useLang();
  const list = useMemo(
    () =>
      rows.filter((r) => matchesSearch(r, q)).filter((r) =>
        show === "all" ? true : show === "owes" ? r.owes > 0 : show === "check" ? !!r.esic_code && !r.esic_code_verified || !r.esic_code : r.active,
      ),
    [rows, q, show],
  );
  const missing = rows.filter((r) => r.active && !r.phone && !r.whatsapp_phone).length;
  const fees = list.filter((r) => r.active).reduce((a, r) => a + r.default_charge_paise, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{t("Clients")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{t("{n} active", { n: rows.filter((r) => r.active).length })} · {t("usual service charges")} <Money paise={fees} size="sm" /> {t("a month")}</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Segmented ariaLabel={t("Show")} value={show} onChange={setShow} options={[
            { value: "active", label: t("Active") }, { value: "owes", label: t("Owes") }, { value: "check", label: t("Codes to check") }, { value: "all", label: t("All") },
          ]} />
          <Button asChild variant="secondary"><Link href="/clients/phones"><Phone />{missing ? t("Add phones ({n} missing)", { n: missing }) : t("Phones")}</Link></Button>
          <AddClientButton />
          <div className="relative sm:w-72">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
            <Input aria-label={t("Search clients")} placeholder={t("Name, owner or old spelling")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-10" />
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <Card className="mt-6"><EmptyState icon={Users} title={q ? t("No client matches “{q}”", { q }) : t("No clients here")} body={t("Try another filter or search.")} /></Card>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <ul className="divide-y divide-hairline">
            {list.map((r) => (
              <li key={r.id} className="flex items-center pr-3 transition-colors hover:bg-surface-2/60">
                <Link href={`/clients/${r.id}`} className={cn("flex min-w-0 flex-1 items-center gap-4 py-3.5 pl-5", !r.active && "opacity-60")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text">
                    {r.firm_name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.firm_name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      {r.partner_code ? <Chip tone="primary" size="sm" className="h-5 px-1.5">{t(r.partner_name ?? "")}</Chip> : null}
                      {r.challan_payer_default === "client" && <ClientPaysChip />}
                      {r.esic_code && !r.esic_code_verified && <Chip tone="warning" icon={ShieldAlert} size="sm" className="h-5 px-1.5">{t("Check ESIC")}</Chip>}
                      {r.default_charge_paise === 0 && r.active && <span>{t("No charge set")}</span>}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-right sm:block">
                    <Money paise={r.default_charge_paise} size="sm" className="font-normal" />
                    <span className="block text-xs text-ink-faint">{t("a month")}</span>
                  </span>
                  <span className="w-24 shrink-0 text-right">
                    {r.owes ? <Money paise={r.owes} size="md" tone="warning" /> : r.advance ? <Money paise={r.advance} size="md" tone="primary" /> : <span className="text-sm text-ink-faint">{t("Clear")}</span>}
                    <span className="block text-xs text-ink-faint">{r.owes ? t("owes") : r.advance ? t("advance") : ""}</span>
                  </span>
                </Link>
                <ContactButton compact target={{ clientId: r.id, firmName: r.firm_name, phone: r.phone, whatsapp: r.whatsapp_phone, language: "hi", ownerName: r.owner_name }} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
