"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/lib/data/db";
import type { ReceiptRow } from "@/lib/domain/receipt";
import { normalizeIndianPhone } from "@/lib/format/phone";
import type { MessageSetup } from "@/lib/domain/messages";
import { uploadPrivateFile } from "@/lib/data/storage";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paise = z.number().int().nonnegative().max(1_00_00_00_000_00); // up to ₹100 crore

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Database messages are written for people already; strip technical prefixes.
  return msg.replace(/^(error:\s*)/i, "").slice(0, 300) || "Something went wrong. Please try again.";
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function startMonth(month: string): Promise<ActionResult<number>> {
  const m = isoDate.parse(month);
  return run(async () => {
    const db = await requireDb();
    const n = await db.rpc<number>("start_month", { p_month: m });
    revalidatePath("/");
    return n;
  });
}

const amountsSchema = z.object({ recordId: uuid, pf: paise.nullable(), esic: paise.nullable() });

export async function saveAmounts(input: z.infer<typeof amountsSchema>) {
  const v = amountsSchema.safeParse(input);
  if (!v.success) return { ok: false as const, error: "Check the amounts" };
  return run(async () => {
    const db = await requireDb();
    return db.rpc<{ amount_status: string; overall_status: string; owes: number }>("set_month_amounts", {
      p_record_id: v.data.recordId, p_pf_paise: v.data.pf, p_esic_paise: v.data.esic,
    });
  });
}

export interface ClientDetail {
  client: {
    id: string; firm_name: string; firm_name_hi: string | null; owner_name: string | null; phone: string | null; whatsapp_phone: string | null;
    alt_phone: string | null; address: string | null; pf_establishment_code: string | null; esic_code: string | null; esic_code_verified: boolean;
    default_charge_paise: number; challan_payer_default: "us" | "client"; preferred_language: "hi" | "en"; active: boolean; kind: "regular" | "occasional";
    notes: string | null; partner_code: "A" | "R" | null; partner_name: string | null;
  };
  balance: { owes: number; advance: number };
  months: Array<{
    monthly_record_id: string; wage_month: string; due_date: string; challan_payer: "us" | "client"; due_to_us: number; received: number; owes: number;
    payment_status: string; pf_challan_status: string; esic_challan_status: string; receipt_status: string; overall_status: string; overdue: boolean;
    legacy_settled: boolean; pf_paise: number | null; esic_paise: number | null; charge_paise: number; extras_paise: number;
    challans: Array<{ id: string; type: "pf" | "esic"; trrn: string | null; number: string | null; amount: number; paid_on: string; paid_by: "us" | "client"; verified: boolean; has_evidence: boolean }>;
  }>;
  open_months: Array<{ monthly_record_id: string; wage_month: string; owes: number }>;
  payments: Array<{ id: string; amount: number; received_on: string; mode: "cash" | "upi" | "bank"; reference: string | null; received_by: string; voided: boolean; void_reason: string | null; receipt_id: string | null; receipt_no: string | null }>;
  messages: Array<{ type: string; language: "hi" | "en"; status: string; sent_at: string }>;
  partners: Array<{ id: string; code: "A" | "R"; name: string }>;
  today: string;
}

export async function getClientDetail(clientId: string): Promise<ActionResult<ClientDetail>> {
  const id = uuid.safeParse(clientId);
  if (!id.success) return { ok: false, error: "Unknown client" };
  return run(async () => (await requireDb()).rpc<ClientDetail>("client_detail", { p_client_id: id.data }));
}

const paymentSchema = z.object({
  idempotencyKey: uuid,
  clientId: uuid,
  amountPaise: z.number().int().positive().max(1_00_00_00_000_00),
  receivedOn: isoDate,
  mode: z.enum(["cash", "upi", "bank"]),
  receivedBy: uuid,
  language: z.enum(["hi", "en"]),
  reference: z.string().trim().max(80).optional(),
  months: z.array(uuid).max(60).nullable(),
  useAdvance: z.boolean(),
});

export interface PaymentResult {
  payment_id: string; receipt_id: string; receipt_no: string; applied_paise: number; advance_added_paise: number; advance_used_paise: number; duplicate: boolean;
}

export async function recordPayment(input: z.infer<typeof paymentSchema>): Promise<ActionResult<PaymentResult>> {
  const v = paymentSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Check the payment details" };
  const d = v.data;
  return run(async () => {
    const db = await requireDb();
    const r = await db.rpc<PaymentResult>("record_payment", {
      p_idempotency_key: d.idempotencyKey, p_client_id: d.clientId, p_amount_paise: d.amountPaise, p_received_on: d.receivedOn,
      p_mode: d.mode, p_received_by: d.receivedBy, p_language: d.language, p_reference: d.reference || null, p_notes: null,
      p_months: d.months && d.months.length ? d.months : null, p_use_advance: d.useAdvance,
    });
    revalidatePath("/");
    revalidatePath(`/clients/${d.clientId}`);
    return r;
  });
}

export async function getReceipt(receiptId: string): Promise<ActionResult<ReceiptRow>> {
  const id = uuid.safeParse(receiptId);
  if (!id.success) return { ok: false, error: "Unknown receipt" };
  return run(async () => (await requireDb()).rpc<ReceiptRow>("receipt_data", { p_receipt_id: id.data }));
}

const messageSchema = z.object({
  clientId: uuid,
  type: z.enum(["dues_we_pay", "challan_ready_client_pays", "payment_received", "challan_filed", "overdue", "receipt", "other"]),
  language: z.enum(["hi", "en"]),
  body: z.string().max(4000),
  status: z.enum(["prepared", "shared"]),
  monthlyRecordId: uuid.optional(),
  paymentId: uuid.optional(),
});

export async function logMessage(input: z.infer<typeof messageSchema>): Promise<ActionResult<string>> {
  const v = messageSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Couldn't log the message" };
  const d = v.data;
  return run(async () => {
    const id = await (await requireDb()).rpc<string>("log_message", {
      p_client_id: d.clientId, p_type: d.type, p_language: d.language, p_body: d.body, p_status: d.status,
      p_monthly_record_id: d.monthlyRecordId ?? null, p_payment_id: d.paymentId ?? null,
    });
    revalidatePath("/");
    return id;
  });
}

// ─── Slice 2: clients, challans, messages ───────────────────────────────────

const phoneField = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeIndianPhone(v);
    if (!n) ctx.addIssue({ code: "custom", message: `“${v}” isn't a valid Indian mobile number` });
    return n;
  });

const clientSchema = z.object({
  firm_name: z.string().trim().min(1, "Firm name is needed").max(120),
  firm_name_hi: z.string().trim().max(120).optional().default(""),
  owner_name: z.string().trim().max(80).optional().default(""),
  phone: phoneField,
  whatsapp_phone: phoneField,
  alt_phone: phoneField,
  address: z.string().trim().max(300).optional().default(""),
  pf_establishment_code: z.string().trim().max(30).optional().default(""),
  esic_code: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{17}$/.test(v), "ESIC code is 17 digits"),
  esic_code_verified: z.boolean(),
  default_charge_paise: paise,
  partner_code: z.enum(["A", "R", ""]),
  challan_payer_default: z.enum(["us", "client"]),
  preferred_language: z.enum(["hi", "en"]),
  active: z.boolean(),
  kind: z.enum(["regular", "occasional"]),
  notes: z.string().trim().max(1000).optional().default(""),
});
export type ClientInput = z.input<typeof clientSchema>;

export async function saveClient(clientId: string | null, input: ClientInput): Promise<ActionResult<string>> {
  if (clientId !== null && !uuid.safeParse(clientId).success) return { ok: false, error: "Unknown client" };
  const v = clientSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Check the details" };
  return run(async () => {
    const id = await (await requireDb()).rpc<string>("save_client", { p_client_id: clientId, p_data: v.data });
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    revalidatePath("/");
    return id;
  });
}

export async function getMessageSetup(): Promise<ActionResult<MessageSetup>> {
  return run(async () => (await requireDb()).rpc<MessageSetup>("message_setup"));
}

const challanSchema = z.object({
  monthlyRecordId: uuid,
  clientId: uuid,
  type: z.enum(["pf", "esic"]),
  reference: z.string().trim().min(3, "Enter the TRRN / challan number").max(40),
  amountPaise: paise,
  paidOn: isoDate,
  paidBy: z.enum(["us", "client"]),
  partnerId: uuid.nullable(),
  replacesId: uuid.nullable(),
  replaceReason: z.string().trim().max(200).optional(),
  verifyNow: z.boolean(),
});

const MAX_FILE = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/** Records (or corrects) a challan, optionally with its proof file, and optionally confirms the proof. */
export async function saveChallan(form: FormData): Promise<ActionResult<string>> {
  const raw = JSON.parse(String(form.get("data") ?? "{}"));
  const v = challanSchema.safeParse(raw);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Check the challan details" };
  const d = v.data;
  if (d.paidBy === "us" && !d.partnerId) return { ok: false, error: "Choose who paid the challan" };
  if (d.replacesId && !d.replaceReason) return { ok: false, error: "Say why the challan is being corrected" };
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) return { ok: false, error: "File is larger than 4 MB. Take a screenshot or a smaller PDF." };
    if (!FILE_TYPES.includes(file.type)) return { ok: false, error: "Use a PDF, PNG, JPG or WEBP file" };
  }
  if (d.verifyNow && !(file instanceof File && file.size > 0)) return { ok: false, error: "Attach the proof to confirm it" };
  return run(async () => {
    const db = await requireDb();
    const id = await db.rpc<string>("record_challan", {
      p_monthly_record_id: d.monthlyRecordId, p_type: d.type, p_amount_paise: d.amountPaise, p_paid_on: d.paidOn, p_paid_by: d.paidBy,
      p_paid_by_partner_id: d.paidBy === "us" ? d.partnerId : null,
      p_trrn: d.type === "pf" ? d.reference : null, p_challan_number: d.type === "esic" ? d.reference : null,
      p_evidence_path: null, p_replaces_id: d.replacesId, p_replace_reason: d.replaceReason ?? null, p_notes: null,
    });
    if (file instanceof File && file.size > 0) {
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
      const path = await uploadPrivateFile("challans", `${d.clientId}/${d.monthlyRecordId}/${d.type}-${id}.${ext}`, file);
      await db.rpc("attach_challan_evidence", { p_challan_id: id, p_path: path });
      if (d.verifyNow) await db.rpc("verify_challan", { p_challan_id: id });
    }
    revalidatePath("/");
    revalidatePath(`/clients/${d.clientId}`);
    return id;
  });
}

/** Attach proof to an existing challan and confirm it (a partner checked the client's challan). */
export async function verifyChallanWithProof(form: FormData): Promise<ActionResult<true>> {
  const id = uuid.safeParse(form.get("challanId"));
  const clientId = uuid.safeParse(form.get("clientId"));
  const recordId = uuid.safeParse(form.get("monthlyRecordId"));
  if (!id.success || !clientId.success || !recordId.success) return { ok: false, error: "Unknown challan" };
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && (file.size > MAX_FILE || !FILE_TYPES.includes(file.type))) return { ok: false, error: "Use a PDF or image under 4 MB" };
  return run(async () => {
    const db = await requireDb();
    if (hasFile) {
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
      const path = await uploadPrivateFile("challans", `${clientId.data}/${recordId.data}/proof-${id.data}.${ext}`, file);
      await db.rpc("attach_challan_evidence", { p_challan_id: id.data, p_path: path });
    }
    await db.rpc("verify_challan", { p_challan_id: id.data });
    revalidatePath("/");
    revalidatePath(`/clients/${clientId.data}`);
    return true as const;
  });
}
