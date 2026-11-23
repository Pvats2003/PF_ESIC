"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveClient, type ClientDetail, type ClientInput } from "@/app/(app)/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, MoneyInput } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { parseRupeesToPaise } from "@/lib/format/money";
import { formatIndianPhone } from "@/lib/format/phone";
import { useLang } from "@/components/providers/lang-provider";

type Client = Partial<ClientDetail["client"]>;
const phoneText = (p: string | null | undefined) => (p ? formatIndianPhone(p) : "");
const rupees = (p: number | undefined) => (p === undefined ? "" : p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2));

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  );
}

export function ClientFormSheet({ client, open, onOpenChange }: { client?: Client; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    firm_name: client?.firm_name ?? "",
    firm_name_hi: client?.firm_name_hi ?? "",
    owner_name: client?.owner_name ?? "",
    phone: phoneText(client?.phone),
    whatsapp_phone: phoneText(client?.whatsapp_phone),
    alt_phone: phoneText(client?.alt_phone),
    address: client?.address ?? "",
    pf_establishment_code: client?.pf_establishment_code ?? "",
    esic_code: client?.esic_code ?? "",
    esic_code_verified: client?.esic_code_verified ?? false,
    charge: rupees(client?.default_charge_paise),
    partner_code: (client?.partner_code ?? (client ? "" : "A")) as "A" | "R" | "",
    challan_payer_default: client?.challan_payer_default ?? "us",
    preferred_language: client?.preferred_language ?? "hi",
    active: client?.active ?? true,
    kind: client?.kind ?? "regular",
    notes: client?.notes ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const esicChanged = f.esic_code.replace(/\s/g, "") !== (client?.esic_code ?? "");

  function submit() {
    const charge = f.charge.trim() === "" ? 0 : parseRupeesToPaise(f.charge);
    if (charge === null) return toast.error(t("Enter the service charge like 500"));
    const input: ClientInput = {
      ...f,
      default_charge_paise: charge,
      // Changing the ESIC code clears "checked" unless it's ticked again
      esic_code_verified: f.esic_code_verified && (!esicChanged || f.esic_code_verified),
    };
    start(async () => {
      const r = await saveClient(client?.id ?? null, input);
      if (!r.ok) return void toast.error(t("Not saved"), { description: t(r.error) });
      toast.success(client ? t("Client updated") : t("Client added"));
      onOpenChange(false);
      if (client) router.refresh();
      else router.push(`/clients/${r.data}`);
    });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={client ? t("Edit client") : t("Add client")}
      description={client?.firm_name ?? t("New monthly client or walk-in")}
      footer={<Button size="lg" block disabled={pending} onClick={submit}>{pending ? t("Saving…") : client ? t("Save changes") : t("Add client")}</Button>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {!client && (
          <Segmented ariaLabel={t("Type")} value={f.kind} onChange={(v) => set("kind", v)} options={[{ value: "regular", label: t("Monthly client") }, { value: "occasional", label: t("Walk-in") }]} />
        )}
        <Field id="c-firm" label={t("Firm name")}><Input id="c-firm" value={f.firm_name} onChange={(e) => set("firm_name", e.target.value)} autoFocus={!client} /></Field>
        <Field id="c-firm-hi" label={t("Firm name in Hindi (optional)")} hint={t("Used on Hindi receipts")}>
          <Input id="c-firm-hi" lang="hi" className="font-hindi" value={f.firm_name_hi} onChange={(e) => set("firm_name_hi", e.target.value)} />
        </Field>
        <Field id="c-owner" label={t("Owner name")}><Input id="c-owner" value={f.owner_name} onChange={(e) => set("owner_name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="c-phone" label={t("Phone")}><Input id="c-phone" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="94304 49312" /></Field>
          <Field id="c-wa" label={t("WhatsApp (if different)")}><Input id="c-wa" inputMode="tel" value={f.whatsapp_phone} onChange={(e) => set("whatsapp_phone", e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="c-charge" label={t("Usual service charge")}><MoneyInput id="c-charge" value={f.charge} onChange={(e) => set("charge", e.target.value)} /></Field>
          <div>
            <Label>{t("Handled by")}</Label>
            <Segmented ariaLabel={t("Handled by")} value={f.partner_code} onChange={(v) => set("partner_code", v)} options={[{ value: "A", label: t("Alok") }, { value: "R", label: t("Rajeev") }, { value: "", label: t("None") }]} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("Challan paid by")}</Label>
            <Segmented ariaLabel={t("Challan paid by")} value={f.challan_payer_default} onChange={(v) => set("challan_payer_default", v)} options={[{ value: "us", label: t("Us") }, { value: "client", label: t("Client") }]} />
          </div>
          <div>
            <Label>{t("Messages in")}</Label>
            <Segmented ariaLabel={t("Language")} value={f.preferred_language} onChange={(v) => set("preferred_language", v)} options={[{ value: "hi", label: <span className="font-hindi">हिंदी</span> }, { value: "en", label: t("English") }]} />
          </div>
        </div>

        <Field id="c-pf" label={t("PF establishment code")}><Input id="c-pf" className="tabular uppercase" value={f.pf_establishment_code} onChange={(e) => set("pf_establishment_code", e.target.value)} placeholder="BRBHA0000000000" /></Field>
        <div>
          <Field id="c-esic" label={t("ESIC code (17 digits)")}>
            <Input id="c-esic" inputMode="numeric" className="tabular" value={f.esic_code} onChange={(e) => { set("esic_code", e.target.value); set("esic_code_verified", false); }} />
          </Field>
          {f.esic_code && (
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.esic_code_verified} onChange={(e) => set("esic_code_verified", e.target.checked)} />
              {t("I've checked this ESIC code on the ESIC portal")}
            </label>
          )}
        </div>
        <Field id="c-addr" label={t("Address (optional)")}><Input id="c-addr" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field id="c-notes" label={t("Notes (optional)")}><Input id="c-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        {client && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
            {t("Active (unticked clients are kept with their history but left out of new months)")}
          </label>
        )}
      </form>
    </BottomSheet>
  );
}

export function EditClientButton({ client }: { client: Client }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Pencil />{t("Edit")}</Button>
      {open && <ClientFormSheet client={client} open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function AddClientButton() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus />{t("Add client")}</Button>
      {open && <ClientFormSheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
