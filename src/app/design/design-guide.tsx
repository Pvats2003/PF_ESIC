"use client";

import {
  BadgeIndianRupee, Banknote, Check, ChevronRight, FileCheck2, Inbox, Landmark, MessageCircle, Moon, PartyPopper,
  Phone, Plus, Search, Send, Share2, Sun, SunMoon, Undo2, Users, Wallet,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Receipt, type ReceiptData } from "@/components/receipt/receipt";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Divider } from "@/components/ui/card";
import { CountdownChip } from "@/components/ui/countdown-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldHint, Input, Label, MoneyInput } from "@/components/ui/input";
import { Figure, Money } from "@/components/ui/money";
import { MonthProgressRing } from "@/components/ui/progress-ring";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Chip, ClientPaysChip, STATUS_META, StatusChip, type RecordStatus } from "@/components/ui/status-chip";
import { Table, TBody, TD, TFootRow, TH, THead, TR } from "@/components/ui/table";
import type { Lang } from "@/lib/format/dates";
import { cn } from "@/lib/utils";

// ─── Sample data (made up; real screens use the imported clients) ──────────
const SAMPLE_ROWS: Array<{ name: string; pf: number | null; esic: number | null; charge: number; status: RecordStatus; clientPays?: boolean }> = [
  { name: "Shree Ganesh Engineering", pf: 15674_00, esic: 2479_00, charge: 500_00, status: "CLOSED" },
  { name: "Maa Tara Construction", pf: 12310_00, esic: 1931_00, charge: 500_00, status: "PAID" },
  { name: "Saraswati Enterprises", pf: 30750_00, esic: 4923_00, charge: 1000_00, status: "PART_PAID" },
  { name: "Om Sai Electricals", pf: 7462_00, esic: 1139_00, charge: 500_00, status: "NOTIFIED", clientPays: true },
  { name: "Ganga Grinding Works", pf: 71303_00, esic: 11422_00, charge: 1500_00, status: "OVERDUE" },
  { name: "City Care Hospital", pf: null, esic: null, charge: 2000_00, status: "AMOUNTS_PENDING" },
];

const RECEIPT: ReceiptData = {
  business: {
    nameEn: "Rajeev Kumar Mishra",
    nameHi: "राजीव कुमार मिश्रा",
    addressEn: "PF & ESIC Consultant, Munger, Bihar",
    addressHi: "पीएफ एवं ईएसआईसी सलाहकार, मुंगेर, बिहार",
    phones: ["+919430449312"],
  },
  receiptNo: "R/2026-27/0148",
  issuedOn: "2026-12-11",
  client: { firmName: "Shree Ganesh Engineering", firmNameHi: "श्री गणेश इंजीनियरिंग", ownerName: "Ramesh Prasad" },
  lines: [
    { kind: "pf", month: "2026-11-01", paise: 15674_00 },
    { kind: "esic", month: "2026-11-01", paise: 2479_00 },
    { kind: "charge", month: "2026-11-01", paise: 500_00 },
    { kind: "extra", month: "2026-11-01", label: "Appointment letters", paise: 100_00 },
  ],
  totalDuePaise: 18753_00,
  receivedPaise: 18753_00,
  mode: "upi",
  reference: "UPI 634512987321",
  receivedBy: { en: "Alok", hi: "आलोक" },
  balanceAfterPaise: 0,
  challans: [{ month: "2026-11-01", pfTrrn: "3162612004578", esicChallanNo: "42-26-11-0048812", paidOn: "2026-12-12" }],
};

const RECEIPT_HI: ReceiptData = {
  ...RECEIPT,
  receiptNo: "R/2026-27/0149",
  client: { firmName: "Saraswati Enterprises", firmNameHi: "सरस्वती एंटरप्राइजेज", ownerName: "सुनीता देवी" },
  lines: [
    { kind: "pf", month: "2026-10-01", paise: 30750_00 },
    { kind: "esic", month: "2026-10-01", paise: 4923_00 },
    { kind: "charge", month: "2026-10-01", paise: 1000_00 },
    { kind: "charge", month: "2026-11-01", paise: 1000_00 },
    { kind: "extra", month: "2026-11-01", label: "पीएफ क्लेम", paise: 200_00 },
  ],
  totalDuePaise: 37873_00,
  receivedPaise: 30000_00,
  mode: "cash",
  reference: null,
  receivedBy: { en: "Rajeev", hi: "राजीव" },
  balanceAfterPaise: 7873_00,
  challans: [],
};

// ─── Layout helpers ─────────────────────────────────────────────────────────
function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-hairline py-10 first:border-t-0 first:pt-2">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="mt-1 max-w-[62ch] text-sm text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, varName, ink }: { name: string; varName: string; ink?: string }) {
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-hairline">
      <div className="flex h-14 items-end p-2 text-xs font-semibold" style={{ background: `var(--${varName})`, color: ink ? `var(--${ink})` : undefined }}>
        {ink ? "Aa ₹1,250" : ""}
      </div>
      <div className="bg-surface px-2 py-1.5">
        <div className="truncate text-xs font-semibold text-ink">{name}</div>
        <div className="truncate font-mono text-[11px] text-ink-faint">--{varName}</div>
      </div>
    </div>
  );
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // next-themes only knows the theme after hydration
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-11 w-[150px]" />;
  return (
    <Segmented
      ariaLabel="Theme"
      value={(theme as "light" | "dark" | "system") ?? "system"}
      onChange={setTheme}
      options={[
        { value: "light", label: <Sun aria-label="Light" className="size-4" /> },
        { value: "dark", label: <Moon aria-label="Dark" className="size-4" /> },
        { value: "system", label: <SunMoon aria-label="System" className="size-4" /> },
      ]}
    />
  );
}

/** Mobile client list row — the most-used element in the app. */
function ClientRow({ row }: { row: (typeof SAMPLE_ROWS)[number] }) {
  const due = row.clientPays ? row.charge : (row.pf ?? 0) + (row.esic ?? 0) + row.charge;
  const initials = row.name.split(" ").slice(0, 2).map((w) => w[0]).join("");
  return (
    <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/70 active:bg-surface-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary-text">{initials}</span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-base leading-snug font-semibold text-ink">{row.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusChip status={row.status} size="sm" />
          {row.clientPays && <ClientPaysChip />}
        </span>
      </span>
      <span className="shrink-0 text-right">
        {row.pf === null ? (
          <span className="text-sm text-ink-faint">—</span>
        ) : (
          <Money paise={due} size="md" tone={row.status === "OVERDUE" ? "danger" : "default"} />
        )}
        <span className="block text-xs text-ink-faint">{row.clientPays ? "fee only" : "total due"}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
    </button>
  );
}

const NAV = [
  ["colour", "Colour"], ["type", "Type"], ["buttons", "Buttons"], ["inputs", "Inputs"], ["status", "Status"],
  ["money", "Money"], ["cards", "Cards"], ["list", "Client list"], ["table", "Table"], ["sheet", "Bottom sheet"],
  ["toasts", "Toasts"], ["empty", "Empty & loading"], ["receipt", "Receipt"],
] as const;

export function DesignGuide() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [receiptLang, setReceiptLang] = useState<Lang>("en");
  const totals = SAMPLE_ROWS.reduce(
    (a, r) => ({ pf: a.pf + (r.pf ?? 0), esic: a.esic + (r.esic ?? 0), charge: a.charge + r.charge }),
    { pf: 0, esic: 0, charge: 0 },
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <header className="sticky top-0 z-30 -mx-4 flex items-center justify-between gap-3 border-b border-hairline bg-paper/85 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-ink">
              <BadgeIndianRupee aria-hidden className="size-[18px] stroke-[1.75]" />
            </span>
            <h1 className="truncate text-base font-semibold">PF ESIC Desk · Style guide</h1>
          </div>
        </div>
        <ThemeSwitch />
      </header>

      <nav aria-label="Sections" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-4 sm:-mx-8 sm:px-8">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="h-9 shrink-0 rounded-full bg-surface px-3.5 text-sm leading-9 font-medium text-ink-muted ring-1 ring-hairline hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <Section id="colour" title="Colour" note="Warm paper and deep ink indigo, with marigold used sparingly. Status colours always come with an icon or a label. Every text pair here passes WCAG AA (checked by an automated test).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch name="Paper" varName="paper" ink="ink" />
          <Swatch name="Surface" varName="surface" ink="ink" />
          <Swatch name="Inset" varName="surface-2" ink="ink-muted" />
          <Swatch name="Ink indigo" varName="primary" ink="primary-ink" />
          <Swatch name="Indigo soft" varName="primary-soft" ink="primary-text" />
          <Swatch name="Marigold" varName="accent" />
          <Swatch name="Paid / Done" varName="success-soft" ink="success" />
          <Swatch name="Pending" varName="warning-soft" ink="warning" />
          <Swatch name="Overdue" varName="danger-soft" ink="danger" />
          <Swatch name="Not started" varName="neutral-soft" ink="neutral" />
          <Swatch name="Client pays" varName="info-soft" ink="info" />
          <Swatch name="Marigold soft" varName="accent-soft" ink="accent-text" />
        </div>
      </Section>

      <Section id="type" title="Type" note="Plus Jakarta Sans for the interface, Noto Sans Devanagari for Hindi. Six sizes only: 12, 14, 16, 20, 28 and 40.">
        <Card>
          <CardBody className="space-y-4">
            {([
              ["text-2xl font-semibold", "40", "₹2,76,461 handled"],
              ["text-xl font-semibold", "28", "November is almost done"],
              ["text-lg font-semibold", "20", "Record payment"],
              ["text-base", "16", "PF and ESIC for 38 clients, due 15 Dec."],
              ["text-sm text-ink-muted", "14", "Last reminder sent 2 days ago by Rajeev"],
              ["text-xs text-ink-faint", "12", "TRRN 3162612004578 · 12/12/2026"],
            ] as const).map(([cls, size, text]) => (
              <div key={size} className="flex items-baseline gap-4">
                <span className="tabular w-8 shrink-0 text-xs text-ink-faint">{size}</span>
                <span className={cn("min-w-0 truncate", cls)}>{text}</span>
              </div>
            ))}
            <Divider />
            <div className="space-y-2" lang="hi">
              <p className="text-lg font-semibold">भविष्य निधि · कर्मचारी राज्य बीमा · प्राप्ति · शुल्क</p>
              <p className="text-base">
                श्री गणेश इंजीनियरिंग का नवंबर का PF ₹15,674 और ESIC ₹2,479 है। कृपया 15 दिसंबर तक भुगतान करें।
              </p>
              <p className="text-sm text-ink-muted">Mixed line: Total payable / कुल देय राशि <Money paise={18653_00} size="sm" /></p>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section id="buttons" title="Buttons" note="One primary action per screen. 44 px tall by default, the minimum comfortable tap target.">
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus />Record payment</Button>
          <Button variant="secondary"><Send />Send reminder</Button>
          <Button variant="soft"><FileCheck2 />Add challan</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="accent"><PartyPopper />Close month</Button>
          <Button variant="danger">Void receipt</Button>
          <Button variant="whatsapp"><MessageCircle />Share on WhatsApp</Button>
          <Button variant="secondary" size="icon" aria-label="Call"><Phone /></Button>
          <Button disabled>Saving…</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="lg" className="w-full sm:w-auto"><Check />Save payment</Button>
          <Button size="sm" variant="secondary">Desktop small</Button>
        </div>
      </Section>

      <Section id="inputs" title="Inputs" note="Money fields open the number keypad, keep the ₹ sign quiet and line digits up on the right.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="d-search">Search clients</Label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" />
              <Input id="d-search" placeholder="Name, owner or any spelling" className="pl-10" />
            </div>
            <FieldHint>Typing “uttam engg” finds Uttam Engineering.</FieldHint>
          </div>
          <div>
            <Label htmlFor="d-pf">PF amount</Label>
            <MoneyInput id="d-pf" defaultValue="15,674" />
          </div>
          <div>
            <Label htmlFor="d-esic">ESIC amount</Label>
            <MoneyInput id="d-esic" defaultValue="24.79.5" aria-invalid />
            <FieldHint error>Enter an amount like 2,479 or 2479.50</FieldHint>
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <Label htmlFor="d-amt">Amount received</Label>
            <MoneyInput id="d-amt" fieldSize="lg" defaultValue="18,753" />
            <FieldHint>Outstanding: ₹18,753 across 1 month</FieldHint>
          </div>
          <div>
            <Label>Payment mode</Label>
            <Segmented ariaLabel="Payment mode" value="upi" onChange={() => {}} options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "bank", label: "Bank" }]} />
          </div>
          <div>
            <Label>Receipt language</Label>
            <Segmented ariaLabel="Language" value="hi" onChange={() => {}} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: "English" }]} />
          </div>
        </div>
      </Section>

      <Section id="status" title="Status" note="Each month moves left to right. Colour is never the only signal: every chip has an icon and words.">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_META) as RecordStatus[]).map((s) => <StatusChip key={s} status={s} />)}
          <ClientPaysChip />
        </div>
        <div className="mt-3 flex flex-wrap gap-2" lang="hi">
          {(Object.keys(STATUS_META) as RecordStatus[]).map((s) => <StatusChip key={s} status={s} lang="hi" />)}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <CountdownChip today="2026-12-01" due="2026-12-15" />
          <CountdownChip today="2026-12-11" due="2026-12-15" />
          <CountdownChip today="2026-12-14" due="2026-12-15" />
          <CountdownChip today="2026-12-18" due="2026-12-15" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip tone="primary" icon={Users} size="sm">Alok</Chip>
          <Chip tone="neutral" size="sm">Needs ESIC check</Chip>
          <Chip tone="info" icon={Landmark} size="sm">Walk-in</Chip>
        </div>
      </Section>

      <Section id="money" title="Money" note="Tabular figures everywhere, Indian grouping, a muted ₹ so the digits lead. Compact form only on summary cards.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardBody><Figure label="Pending" paise={1_47_555_00} size="hero" sub="from 12 clients" /></CardBody></Card>
          <Card><CardBody><Figure label="Collected" paise={2_76_461_00} tone="success" sub="this month" /></CardBody></Card>
          <Card>
            <CardBody className="space-y-2">
              {[1_00_00_000_00, 1_47_555_00, 14_741_50, 500_00, -1_250_00].map((p) => (
                <div key={p} className="flex items-center justify-between gap-3 text-sm">
                  <Money paise={p} size="sm" compact className="text-ink-muted" />
                  <Money paise={p} size="md" />
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section id="cards" title="Cards and the month ring" note="Soft layered shadows instead of borders; a 1 px inner highlight in dark mode. The ring fills as clients close; its centre is the due-date countdown.">
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Card className="flex flex-col items-center justify-center gap-4 p-6 lg:w-[280px]">
            <MonthProgressRing closed={29} total={38} today="2026-12-11" due="2026-12-15" />
            <div className="text-center">
              <div className="text-sm font-semibold">November 2026</div>
              <div className="text-xs text-ink-muted">9 clients still open</div>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard icon={Landmark} label="PF + ESIC" paise={2_38_720_00 + 37_741_00} hint="38 clients" tone="primary" />
            <StatCard icon={BadgeIndianRupee} label="Fees" paise={22_700_00} hint="₹11,350 each" />
            <StatCard icon={Wallet} label="Collected" paise={1_88_906_00} tone="success" hint="26 payments" />
            <StatCard icon={Banknote} label="Pending" paise={1_47_555_00} tone="warning" hint="12 clients" />
            <StatCard icon={FileCheck2} label="Challans paid" count={24} tone="success" hint="of 38" />
            <StatCard icon={Send} label="Not notified" count={5} tone="danger" hint="send today" />
          </div>
        </div>
      </Section>

      <Section id="list" title="Client list (phone)" note="Name first, status second, money on the right. Swipe right to record a payment, left to WhatsApp.">
        <Card className="max-w-[440px] overflow-hidden">
          <div className="divide-y divide-hairline">
            {SAMPLE_ROWS.map((r) => <ClientRow key={r.name} row={r} />)}
          </div>
        </Card>
      </Section>

      <Section id="table" title="Month sheet (desktop)" note="Sticky header and first column; money right-aligned; totals row at the bottom, like the Excel sheet.">
        <Table>
          <THead>
            <tr>
              <TH sticky className="w-14">Sl.</TH>
              <TH>Contractor</TH>
              <TH numeric>PF</TH>
              <TH numeric>ESIC</TH>
              <TH numeric>Total</TH>
              <TH numeric>Charge</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {SAMPLE_ROWS.map((r, i) => (
              <TR key={r.name}>
                <TD sticky className="tabular text-ink-faint">{i + 1}</TD>
                <TD className="font-medium">{r.name}</TD>
                <TD numeric>{r.pf === null ? <span className="text-ink-faint">—</span> : <Money paise={r.pf} size="sm" muteSymbol={false} className="font-normal" />}</TD>
                <TD numeric>{r.esic === null ? <span className="text-ink-faint">—</span> : <Money paise={r.esic} size="sm" muteSymbol={false} className="font-normal" />}</TD>
                <TD numeric>{r.pf === null ? <span className="text-ink-faint">—</span> : <Money paise={(r.pf ?? 0) + (r.esic ?? 0)} size="sm" />}</TD>
                <TD numeric><Money paise={r.charge} size="sm" muteSymbol={false} className="font-normal" /></TD>
                <TD><StatusChip status={r.status} size="sm" /></TD>
              </TR>
            ))}
          </TBody>
          <tfoot>
            <TFootRow>
              <TD sticky />
              <TD>Total</TD>
              <TD numeric><Money paise={totals.pf} size="sm" /></TD>
              <TD numeric><Money paise={totals.esic} size="sm" /></TD>
              <TD numeric><Money paise={totals.pf + totals.esic} size="sm" /></TD>
              <TD numeric><Money paise={totals.charge} size="sm" /></TD>
              <TD />
            </TFootRow>
          </tfoot>
        </Table>
      </Section>

      <Section id="sheet" title="Bottom sheet" note="Forms open from the bottom on phones (reachable with a thumb) and as a side panel on desktop.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Static preview, so the screenshot shows it */}
          <div className="w-full max-w-[400px] overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-sheet)] ring-1 ring-hairline">
            <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-hairline-strong" />
            <div className="px-5 pt-4 pb-2">
              <div className="text-lg font-semibold">Record payment</div>
              <div className="text-sm text-ink-muted">Shree Ganesh Engineering · owes ₹18,753</div>
            </div>
            <div className="space-y-4 px-5 pb-4">
              <div>
                <Label>Amount</Label>
                <MoneyInput fieldSize="lg" defaultValue="18,753" aria-label="Amount" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Mode</Label><Segmented ariaLabel="Mode" value="upi" onChange={() => {}} options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "bank", label: "Bank" }]} /></div>
                <div><Label>Received by</Label><Segmented ariaLabel="Received by" value="A" onChange={() => {}} options={[{ value: "A", label: "Alok" }, { value: "R", label: "Rajeev" }]} /></div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3 text-sm">
                <div className="flex justify-between"><span className="text-ink-muted">Covers</span><span className="font-medium">November 2026</span></div>
                <div className="mt-1 flex justify-between"><span className="text-ink-muted">Balance after</span><Money paise={0} size="sm" tone="success" /></div>
              </div>
            </div>
            <div className="border-t border-hairline px-5 pt-3 pb-4">
              <Button size="lg" block><Check />Save and issue receipt</Button>
            </div>
          </div>
          <BottomSheet
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="Send reminder"
            description="Maa Tara Construction · November 2026"
            trigger={<Button variant="secondary">Open a live sheet</Button>}
            footer={<Button variant="whatsapp" size="lg" block onClick={() => setSheetOpen(false)}><MessageCircle />Send on WhatsApp</Button>}
          >
            <div lang="hi" className="rounded-xl bg-surface-2 p-4 text-sm whitespace-pre-line">
              {"नमस्ते रमेश जी,\nमाँ तारा कंस्ट्रक्शन का नवंबर 2026 का PF/ESIC विवरण:\nPF: ₹12,310\nESIC: ₹1,931\nसेवा शुल्क: ₹500\nकुल देय राशि: ₹14,741\nकृपया 13 दिसंबर तक भुगतान करें।"}
            </div>
          </BottomSheet>
        </div>
      </Section>

      <Section id="toasts" title="Toasts" note="Short, at the bottom, above the tab bar. Money edits come with Undo.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex w-full max-w-[380px] items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3.5 shadow-[var(--shadow-raised)]">
            <span className="grid size-7 place-items-center rounded-full bg-success-soft text-success"><Check className="size-4 stroke-[2.25]" /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">₹18,753 recorded</div>
              <div className="truncate text-sm text-ink-muted">Receipt R/2026-27/0148 is ready</div>
            </div>
            <button className="flex h-8 items-center gap-1 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary-text"><Undo2 className="size-3.5" />Undo</button>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => toast.success("₹18,753 recorded", { description: "Receipt R/2026-27/0148 is ready", action: { label: "Undo", onClick: () => {} } })}>Show success</Button>
            <Button variant="secondary" onClick={() => toast.error("Couldn't save", { description: "No internet. We'll keep your entry and retry." })}>Show error</Button>
          </div>
        </div>
      </Section>

      <Section id="empty" title="Empty and loading states" note="Every list says something useful when empty. Loading uses skeletons shaped like the real thing, never a lone spinner.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <EmptyState icon={PartyPopper} title="No pending payments 🎉" body="Everyone's paid for November." action={<Button variant="soft"><Share2 />Share month summary</Button>} />
          </Card>
          <Card>
            <EmptyState icon={Inbox} title="Nothing in today's queue" body="No reminders due today. The next ones go out on 10 Dec." />
          </Card>
          <Card className="md:col-span-2">
            <div className="divide-y divide-hairline">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-5 w-28 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Section id="receipt" title="Receipt" note="Rendered as HTML so Hindi shapes correctly; shared as a crisp PNG or PDF. Letterhead in both scripts, a guilloche band, the seal and the amount in words.">
        <div className="mb-4">
          <Segmented ariaLabel="Receipt language" value={receiptLang} onChange={setReceiptLang} options={[{ value: "en", label: "English" }, { value: "hi", label: <span className="font-hindi">हिंदी</span> }]} />
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex flex-wrap gap-8">
            <div className="origin-top-left max-[600px]:scale-[0.64] max-[600px]:-mb-[290px]">
              <Receipt data={receiptLang === "en" ? RECEIPT : RECEIPT_HI} lang={receiptLang} />
            </div>
            <div className="hidden lg:block">
              <Receipt data={receiptLang === "en" ? RECEIPT_HI : RECEIPT} lang={receiptLang === "en" ? "hi" : "en"} />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
