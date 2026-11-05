import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusChip } from "@/components/portal/PortalScreens";
import {
  INVOICE_STATUS, PERIOD_LABEL, REQUEST_STATUS, errText, fmtDate, formatMoney, formatPrice, loadSettings, loadTiers, seatLabel,
  type ClientSummary, type Invoice, type Tier, type UpgradeRequest,
} from "@/lib/billing";
import { cn } from "@/lib/utils";

function useSummary(clientId: string, preview: boolean) {
  return useQuery({
    queryKey: ["billing-summary", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("billing_client_summary", preview ? { c: clientId } : {});
      if (error) throw error;
      return data as unknown as ClientSummary;
    },
  });
}
const useTiers = () => useQuery({ queryKey: ["billing-tiers"], queryFn: loadTiers });
const useSettings = () => useQuery({ queryKey: ["billing-settings"], queryFn: loadSettings });

export function PricingTab({ clientId, preview, canAct }: { clientId: string; preview: boolean; canAct: boolean }) {
  const qc = useQueryClient();
  const sum = useSummary(clientId, preview);
  const tiers = useTiers();
  const settings = useSettings();
  const reqs = useQuery({
    queryKey: ["upgrade-requests", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("upgrade_requests").select("*").eq("client_id", sum.data!.client_id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UpgradeRequest[];
    },
    enabled: !!sum.data,
  });
  const [want, setWant] = useState<Tier | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const error = sum.error ?? tiers.error ?? settings.error ?? reqs.error;
  if (error) return <p role="alert" className="bg-failed text-failed-foreground rounded-md p-4">{errText(error)}</p>;
  if (!sum.data || !tiers.data || !settings.data || !reqs.data) return <p className="text-muted-foreground">Loading…</p>;
  const current = tiers.data.find(t => t.id === sum.data.tier_id);
  const open = reqs.data.find(r => r.status === "requested");
  const name = (id: string | null) => tiers.data.find(t => t.id === id)?.name ?? "—";
  const submit = async () => {
    if (!want) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("billing_request_upgrade", { _tier: want.id, _note: note });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWant(null); setNote("");
    await qc.invalidateQueries({ queryKey: ["upgrade-requests"] });
  };
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">FridayAnalytics invoices you directly. There is no online payment.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {tiers.data.map(t => {
          const isCurrent = t.id === current?.id;
          const higher = !current || t.rank > current.rank;
          return (
            <section key={t.id} aria-label={t.name} className={cn("panel flex flex-col gap-3 p-5", isCurrent && "ring-primary ring-2")}>
              <div className="flex items-center justify-between gap-2"><h2 className="font-display text-xl font-medium">{t.name}</h2>{isCurrent ? <StatusChip tone="positive">Your tier</StatusChip> : null}</div>
              <p className="text-2xl font-semibold">{formatPrice(t.price, settings.data.currency)}</p>
              {t.price !== null ? <p className="text-muted-foreground text-sm">{PERIOD_LABEL[settings.data.billing_period]}</p> : null}
              <p className="text-sm font-medium">{seatLabel(t.seat_limit)}</p>
              {t.contents.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{t.contents.map(c => <li key={c}>{c}</li>)}</ul> : <p className="text-muted-foreground text-sm">Contents to be confirmed by FridayAnalytics.</p>}
              <div className="mt-auto pt-2">
                {higher && !isCurrent ? (
                  <Button className="min-h-11 w-full" disabled={!canAct || !!open} onClick={() => { setErr(""); setWant(t); }}>Request upgrade</Button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {open ? <p className="bg-muted rounded-md p-4 text-sm">Your request for {name(open.requested_tier_id)} is waiting for FridayAnalytics.</p> : null}
      <section className="panel p-5" aria-labelledby="req-h">
        <h2 id="req-h" className="font-semibold">Your upgrade requests</h2>
        {reqs.data.length === 0 ? <p className="text-muted-foreground mt-2 text-sm">No requests yet.</p> : (
          <ul className="mt-3 divide-y">{reqs.data.map(r => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div><p className="font-medium">{name(r.requested_tier_id)}</p><p className="text-muted-foreground text-sm">{fmtDate(r.created_at)}{r.requested_by_name ? ` · ${r.requested_by_name}` : ""}{r.note ? ` · ${r.note}` : ""}</p>{r.decision_note ? <p className="text-sm">FridayAnalytics: {r.decision_note}</p> : null}</div>
              <StatusChip tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusChip>
            </li>))}</ul>
        )}
      </section>
      <Dialog open={!!want} onOpenChange={o => { if (!o) setWant(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request {want?.name}</DialogTitle><DialogDescription>FridayAnalytics will review your request and contact you. Nothing is charged online.</DialogDescription></DialogHeader>
          <label className="text-sm font-medium" htmlFor="up-note">Note (optional)</label>
          <Textarea id="up-note" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} />
          {err ? <p role="alert" className="text-failed-foreground bg-failed rounded-md p-3 text-sm">{err}</p> : null}
          <DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setWant(null)}>Cancel</Button><Button className="min-h-11" disabled={busy} onClick={submit}>{busy ? "Sending…" : "Send request"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BillingTab({ clientId, preview }: { clientId: string; preview: boolean }) {
  const sum = useSummary(clientId, preview);
  const tiers = useTiers();
  const showInvoices = !!sum.data && (sum.data.is_admin || preview);
  const inv = useQuery({
    queryKey: ["client-invoices", clientId],
    enabled: showInvoices,
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("client_id", sum.data!.client_id).neq("status", "draft").order("issued_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Invoice[];
    },
  });
  const error = sum.error ?? tiers.error ?? inv.error;
  if (error) return <p role="alert" className="bg-failed text-failed-foreground rounded-md p-4">{errText(error)}</p>;
  if (!sum.data || !tiers.data) return <p className="text-muted-foreground">Loading…</p>;
  const t = tiers.data.find(x => x.id === sum.data.tier_id);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-5"><p className="text-muted-foreground text-sm">Current tier</p><p className="font-display text-2xl font-medium">{t?.name ?? "Not set yet"}</p></div>
        <div className="panel p-5"><p className="text-muted-foreground text-sm">Seats used</p><p className="font-display text-2xl font-medium">{sum.data.seats_used} of {t ? (t.seat_limit ?? "unlimited") : "—"}</p></div>
      </div>
      {showInvoices ? (
        <section className="panel p-5" aria-labelledby="inv-h">
          <h2 id="inv-h" className="font-semibold">Invoices</h2>
          {!inv.data ? <p className="text-muted-foreground mt-2">Loading…</p> : inv.data.length === 0 ? <p className="text-muted-foreground mt-2 text-sm">No invoices yet.</p> : (
            <ul className="mt-3 divide-y">{inv.data.map(i => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-mono font-medium">{i.number}</p><p className="text-muted-foreground text-sm">Issued {fmtDate(i.issued_at)} · {formatMoney(i.total, i.currency)}{i.due_date ? ` · due ${fmtDate(i.due_date)}` : ""}</p></div>
                <div className="flex items-center gap-2"><StatusChip tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</StatusChip>
                  <Button asChild variant="outline" className="min-h-11"><Link to="/invoice/$invoiceId" params={{ invoiceId: i.id }}>View and download PDF</Link></Button></div>
              </li>))}</ul>
          )}
        </section>
      ) : <p className="text-muted-foreground text-sm">Invoices are shown to your client administrators.</p>}
    </div>
  );
}
