"use client";

import { ArrowRightLeft, Ban, Plus, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addExpense, addTransfer, voidMoneyMove } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, MoneyInput } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Segmented } from "@/components/ui/segmented";
import { formatDate, todayIST } from "@/lib/format/dates";
import { parseRupeesToPaise } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/providers/lang-provider";

export interface MoneyMoves {
  expenses: Array<{ id: string; spent_on: string; amount: number; description: string; paid_by: string | null; voided: boolean; void_reason: string | null }>;
  transfers: Array<{ id: string; on: string; amount: number; kind: "settlement" | "gov_handover"; from: string; to: string; note: string | null; voided: boolean; void_reason: string | null }>;
}

/** Shared expenses (ink, paper…) and money passed between partners. Both feed the settlement above. */
export function MoneyMovesPanel({ moves }: { moves: MoneyMoves }) {
  const { t } = useLang();
  const [sheet, setSheet] = useState<"expense" | "transfer" | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t("Shared expenses")}</CardTitle>
          <Button size="sm" variant="soft" onClick={() => setSheet("expense")}><Plus />{t("Add expense")}</Button>
        </CardHeader>
        {moves.expenses.length === 0 ? <EmptyState icon={ReceiptText} title={t("No shared expenses")} body={t("Ink, paper, hardware… they come off the fees before the split.")} /> : (
          <ul className="mt-3 divide-y divide-hairline">
            {moves.expenses.map((e) => (
              <Row key={e.id} kind="expense" id={e.id} voided={e.voided} reason={e.void_reason}
                title={e.description} sub={`${formatDate(e.spent_on)} · ${t("paid by {name}", { name: e.paid_by ? t(e.paid_by) : "—" })}`} amount={e.amount} />
            ))}
          </ul>
        )}
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{t("Money passed between partners")}</CardTitle>
          <Button size="sm" variant="soft" onClick={() => setSheet("transfer")}><ArrowRightLeft />{t("Record")}</Button>
        </CardHeader>
        {moves.transfers.length === 0 ? <EmptyState icon={ArrowRightLeft} title={t("Nothing passed yet")} body={t("Record it when one partner pays the other their share, or hands over government money.")} /> : (
          <ul className="mt-3 divide-y divide-hairline">
            {moves.transfers.map((x) => (
              <Row key={x.id} kind="transfer" id={x.id} voided={x.voided} reason={x.void_reason}
                title={`${t(x.from)} → ${t(x.to)}`} sub={`${formatDate(x.on)} · ${t(x.kind === "settlement" ? "fee settlement" : "government money handed over")}${x.note ? ` · ${x.note}` : ""}`} amount={x.amount} />
            ))}
          </ul>
        )}
      </Card>
      {sheet === "expense" && <ExpenseSheet onClose={() => setSheet(null)} />}
      {sheet === "transfer" && <TransferSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

function Row({ kind, id, title, sub, amount, voided, reason }: { kind: "expense" | "transfer"; id: string; title: string; sub: string; amount: number; voided: boolean; reason: string | null }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <li className={cn("flex items-center gap-3 px-5 py-3", voided && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-medium", voided && "line-through")}>{title}</div>
        <div className="truncate text-xs text-ink-muted">{sub}{voided ? ` · ${t("Void")}: ${reason}` : ""}</div>
      </div>
      <Money paise={amount} size="md" className={cn(voided && "line-through")} />
      {!voided && <Button variant="ghost" size="icon" className="size-9" aria-label={t("Void {name}", { name: title })} onClick={() => setOpen(true)}><Ban /></Button>}
      {open && (
        <BottomSheet open onOpenChange={setOpen} title={t("Void “{name}”?", { name: title })} description={t("It stays in history marked void and stops counting in the settlement.")}
          footer={<Button variant="danger" size="lg" block disabled={pending || why.trim().length < 3} onClick={() => start(async () => {
            const r = await voidMoneyMove(kind, id, why);
            if (!r.ok) return void toast.error(t("Not voided"), { description: t(r.error) });
            toast.success(t("Voided"));
            setOpen(false);
            router.refresh();
          })}><Ban />{pending ? t("Voiding…") : t("Void")}</Button>}>
          <Label htmlFor={`why-${id}`}>{t("Why?")}</Label>
          <Input id={`why-${id}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={t("e.g. entered twice")} autoFocus />
        </BottomSheet>
      )}
    </li>
  );
}

function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ description: "", amount: "", paidBy: "A" as "A" | "R", on: todayIST() });
  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={t("Add shared expense")} description={t("Comes off the fees before the split")}
      footer={<Button size="lg" block disabled={pending} onClick={() => start(async () => {
        const amount = parseRupeesToPaise(f.amount);
        if (!amount) return void toast.error(t("Enter the amount"));
        const r = await addExpense({ spentOn: f.on, amountPaise: amount, description: f.description, paidBy: f.paidBy });
        if (!r.ok) return void toast.error(t("Not saved"), { description: t(r.error) });
        toast.success(t("Expense saved"));
        onClose();
        router.refresh();
      })}>{pending ? t("Saving…") : t("Save expense")}</Button>}>
      <div className="space-y-4">
        <div><Label htmlFor="ex-what">{t("What for")}</Label><Input id="ex-what" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("e.g. Printer ink")} autoFocus /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="ex-amt">{t("Amount")}</Label><MoneyInput id="ex-amt" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
          <div><Label htmlFor="ex-on">{t("Date")}</Label><Input id="ex-on" type="date" value={f.on} max={todayIST()} onChange={(e) => setF({ ...f, on: e.target.value })} /></div>
        </div>
        <div><Label>{t("Paid by")}</Label><Segmented ariaLabel={t("Paid by")} value={f.paidBy} onChange={(v) => setF({ ...f, paidBy: v })} options={[{ value: "A", label: t("Alok") }, { value: "R", label: t("Rajeev") }]} /></div>
      </div>
    </BottomSheet>
  );
}

function TransferSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ from: "R" as "A" | "R", amount: "", kind: "settlement" as "settlement" | "gov_handover", on: todayIST(), note: "" });
  const to = f.from === "A" ? "R" : "A";
  return (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={t("Money passed between partners")}
      footer={<Button size="lg" block disabled={pending} onClick={() => start(async () => {
        const amount = parseRupeesToPaise(f.amount);
        if (!amount) return void toast.error(t("Enter the amount"));
        const r = await addTransfer({ from: f.from, to, amountPaise: amount, on: f.on, kind: f.kind, note: f.note });
        if (!r.ok) return void toast.error(t("Not saved"), { description: t(r.error) });
        toast.success(t("Recorded"));
        onClose();
        router.refresh();
      })}>{pending ? t("Saving…") : t("Save")}</Button>}>
      <div className="space-y-4">
        <div><Label>{t("Who paid")}</Label><Segmented ariaLabel={t("From")} value={f.from} onChange={(v) => setF({ ...f, from: v })} options={[{ value: "R", label: t("Rajeev → Alok") }, { value: "A", label: t("Alok → Rajeev") }]} /></div>
        <div><Label>{t("What kind of money")}</Label><Segmented ariaLabel={t("Kind")} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "settlement", label: t("Fee settlement") }, { value: "gov_handover", label: t("Government money") }]} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="tr-amt">{t("Amount")}</Label><MoneyInput id="tr-amt" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></div>
          <div><Label htmlFor="tr-on">{t("Date")}</Label><Input id="tr-on" type="date" value={f.on} max={todayIST()} onChange={(e) => setF({ ...f, on: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="tr-note">{t("Note (optional)")}</Label><Input id="tr-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
    </BottomSheet>
  );
}
