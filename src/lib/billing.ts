import { supabase } from "@/integrations/supabase/client";

export type Tier = { id: string; rank: number; name: string; price: number | null; seat_limit: number | null; contents: string[] };
export type BillingSettings = { currency: "RM" | "USD"; billing_period: "monthly" | "yearly" };
export type InvoiceLine = { description: string; quantity: number; unit_price: number };
export type Invoice = {
  id: string; client_id: string; number: string | null; status: InvoiceStatus; currency: string; lines: InvoiceLine[]; total: number;
  for_tier_id: string | null; notes: string | null; due_date: string | null; created_at: string; issued_at: string | null; paid_at: string | null;
  payment_date: string | null; payment_method: string | null; payment_reference: string | null; payment_amount: number | null;
  void_reason: string | null; voided_at: string | null;
};
export type InvoiceStatus = "draft" | "issued" | "paid" | "void";
export type UpgradeRequest = {
  id: string; client_id: string; current_tier_id: string | null; requested_tier_id: string; requested_by_name: string | null;
  note: string | null; status: "requested" | "approved" | "declined"; decided_at: string | null; decision_note: string | null; created_at: string;
};
export type ClientSummary = { client_id: string; client_name: string; tier_id: string | null; seats_used: number; is_admin: boolean };

export const PRICE_ON_REQUEST = "Price on request";
export const PERIOD_LABEL = { monthly: "per month", yearly: "per year" } as const;

/** Client-facing price: empty price is always "Price on request". */
export function formatPrice(price: number | null | undefined, currency: string): string {
  if (price === null || price === undefined) return PRICE_ON_REQUEST;
  return formatMoney(price, currency);
}
export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Number(amount).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const seatLabel = (limit: number | null) => (limit === null ? "Unlimited seats" : `${limit} seat${limit === 1 ? "" : "s"}`);

/** Mirrors the database total: each line rounded to 2 decimals, then summed. */
export function invoiceTotal(lines: InvoiceLine[]): number {
  return lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price * 100) / 100, 0);
}

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: "info" | "caution" | "positive" | "negative" }> = {
  draft: { label: "Draft", tone: "info" },
  issued: { label: "Issued", tone: "caution" },
  paid: { label: "Paid", tone: "positive" },
  void: { label: "Void", tone: "negative" },
};
export const REQUEST_STATUS: Record<UpgradeRequest["status"], { label: string; tone: "info" | "positive" | "negative" }> = {
  requested: { label: "Requested", tone: "info" },
  approved: { label: "Approved", tone: "positive" },
  declined: { label: "Declined", tone: "negative" },
};

export const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

export async function loadTiers(): Promise<Tier[]> {
  const { data, error } = await supabase.from("billing_tiers").select("id,rank,name,price,seat_limit,contents").order("rank");
  if (error) throw error;
  return (data ?? []) as Tier[];
}
export async function loadSettings(): Promise<BillingSettings> {
  const { data, error } = await supabase.from("billing_settings").select("currency,billing_period").eq("id", 1).single();
  if (error) throw error;
  return data as BillingSettings;
}
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
