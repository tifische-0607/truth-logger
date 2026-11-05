import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Section } from "@/components/engagement/ui";
import { StatusChip } from "@/components/portal/PortalScreens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hubHead } from "@/lib/hub";
import { useMe } from "@/lib/projects";
import {
  INVOICE_STATUS, PERIOD_LABEL, REQUEST_STATUS, fmtDate, formatMoney, formatPrice, invoiceTotal, loadSettings, loadTiers, seatLabel,
  type Invoice, type InvoiceLine, type Tier, type UpgradeRequest,
} from "@/lib/billing";
import { cn } from "@/lib/utils";

const PILLS = ["Requests", "Invoices", "Pricing", "Log"] as const;
type Pill = (typeof PILLS)[number];
type BClient = { id: string; name: string; code: string; tier_id: string | null; seats_used: number };

export const Route = createFileRoute("/_authenticated/billing")({
  validateSearch: (r: Record<string, unknown>): { pill?: string | undefined } => ({ pill: typeof r["pill"] === "string" ? r["pill"] : undefined }),
  head: () => hubHead("Billing", "FA Portal billing: pricing, upgrade requests, invoices and tier changes."),
  component: Billing,
});

/** Runs a database action, then refreshes. No optimistic update: the screen changes only after the database accepts. */
function useAct() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true); setErr("");
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    await qc.invalidateQueries({ queryKey: ["billing"] });
    await qc.invalidateQueries({ queryKey: ["billing-tiers"] });
    await qc.invalidateQueries({ queryKey: ["billing-settings"] });
    return true;
  };
  return { busy, err, run, setErr };
}
const Refusal = ({ msg }: { msg: string }) => (msg ? <p role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{msg}</p> : null);

function Billing() {
  const me = useMe();
  const raw = Route.useSearch();
  const navigate = useNavigate({ from: "/billing" });
  const pill: Pill = (PILLS as readonly string[]).includes(raw.pill ?? "") ? (raw.pill as Pill) : "Requests";
  const allowed = !!(me.data?.isOwner || me.data?.isManagement);
  const clients = useQuery({ queryKey: ["billing", "clients"], enabled: allowed, queryFn: async () => { const { data, error } = await supabase.rpc("billing_clients"); if (error) throw error; return data as unknown as BClient[]; } });
  const tiers = useQuery({ queryKey: ["billing-tiers"], enabled: allowed, queryFn: loadTiers });
  if (me.isPending) return <p className="p-6">Loading…</p>;
  if (!allowed) return <div className="p-6"><PageHeader title="Billing" /><p role="alert" className="bg-failed text-failed-foreground rounded-md p-4">Billing is open to the owner and Management only.</p></div>;
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title="Billing" subtitle="Pricing, upgrade requests, invoices and tier changes. Clients never pay online." />
      <nav aria-label="Billing sections" className="flex flex-wrap gap-2">{PILLS.map(p => <Button key={p} variant={p === pill ? "default" : "outline"} className="min-h-11" aria-current={p === pill ? "page" : undefined} onClick={() => void navigate({ search: { pill: p } })}>{p}</Button>)}</nav>
      {clients.error || tiers.error ? <Refusal msg={String((clients.error ?? tiers.error)?.message)} /> : !clients.data || !tiers.data ? <p>Loading…</p>
        : pill === "Requests" ? <Requests clients={clients.data} tiers={tiers.data} />
        : pill === "Invoices" ? <Invoices clients={clients.data} tiers={tiers.data} />
        : pill === "Pricing" ? <Pricing tiers={tiers.data} />
        : <Log tiers={tiers.data} clients={clients.data} />}
    </div>
  );
}

function Requests({ clients, tiers }: { clients: BClient[]; tiers: Tier[] }) {
  const q = useQuery({ queryKey: ["billing", "requests"], queryFn: async () => { const { data, error } = await supabase.from("upgrade_requests").select("*").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as UpgradeRequest[]; } });
  const a = useAct();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const cn_ = (id: string) => clients.find(c => c.id === id)?.name ?? "Client";
  const tn = (id: string | null) => tiers.find(t => t.id === id)?.name ?? "No tier";
  return (
    <Section id="req" title="Upgrade requests" hint="New requests from client users appear here. Approving does not change the tier: issue an invoice, record payment, then change the tier.">
      <Refusal msg={a.err} />
      {!q.data ? <p>Loading…</p> : q.data.length === 0 ? <p className="text-muted-foreground">No upgrade requests.</p> : (
        <ul className="divide-y">{q.data.map(r => (
          <li key={r.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{cn_(r.client_id)}: {tn(r.current_tier_id)} → {tn(r.requested_tier_id)}</p><StatusChip tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusChip></div>
            <p className="text-muted-foreground text-sm">{fmtDate(r.created_at)}{r.requested_by_name ? ` · ${r.requested_by_name}` : ""}{r.note ? ` · "${r.note}"` : ""}{r.decision_note ? ` · Decision note: ${r.decision_note}` : ""}</p>
            {r.status === "requested" ? (
              <div className="flex flex-wrap items-end gap-2">
                <Input aria-label="Decision note" placeholder="Note to client (optional)" className="min-h-11 max-w-sm" value={notes[r.id] ?? ""} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button className="min-h-11" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_decide_request", { _request: r.id, _approve: true, _note: notes[r.id] ?? "" }))}>Approve</Button>
                <Button variant="outline" className="min-h-11" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_decide_request", { _request: r.id, _approve: false, _note: notes[r.id] ?? "" }))}>Decline</Button>
              </div>) : null}
          </li>))}</ul>)}
    </Section>
  );
}

function Invoices({ clients, tiers }: { clients: BClient[]; tiers: Tier[] }) {
  const q = useQuery({ queryKey: ["billing", "invoices"], queryFn: async () => { const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as unknown as Invoice[]; } });
  const settings = useQuery({ queryKey: ["billing-settings"], queryFn: loadSettings });
  const a = useAct();
  const [client, setClient] = useState("");
  const [tier, setTier] = useState("none");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [open, setOpen] = useState<string | null>(null);
  const cname = (id: string) => clients.find(c => c.id === id)?.name ?? "Client";
  const create = async () => {
    const ok = await a.run(() => supabase.rpc("billing_create_invoice", { _client: client, _lines: lines as never, _due: due || (null as never), _notes: notes, _tier: tier === "none" ? (null as never) : tier }));
    if (ok) { setLines([{ description: "", quantity: 1, unit_price: 0 }]); setNotes(""); setDue(""); }
  };
  return (
    <div className="space-y-6">
      <Section id="new-inv" title="New invoice" hint={`Saved as a Draft in ${settings.data?.currency ?? "the set currency"}. The invoice number is assigned when you issue it and is never reused.`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Client</Label><Select value={client} onValueChange={setClient}><SelectTrigger className="min-h-11" aria-label="Client"><SelectValue placeholder="Choose a client" /></SelectTrigger><SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>For tier (optional)</Label><Select value={tier} onValueChange={setTier}><SelectTrigger className="min-h-11" aria-label="For tier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not linked to a tier</SelectItem>{tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="due">Due date</Label><Input id="due" type="date" className="min-h-11" value={due} onChange={e => setDue(e.target.value)} /></div>
        </div>
        <div className="mt-4 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_6rem_9rem_auto]">
              <Input aria-label={`Line ${i + 1} description`} placeholder="Description" className="min-h-11" value={l.description} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              <Input aria-label={`Line ${i + 1} quantity`} type="number" min={0} step="any" className="min-h-11" value={l.quantity} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
              <Input aria-label={`Line ${i + 1} unit price`} type="number" min={0} step="0.01" className="min-h-11" value={l.unit_price} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))} />
              <Button variant="ghost" className="min-h-11" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</Button>
            </div>))}
          <Button variant="outline" className="min-h-11" onClick={() => setLines([...lines, { description: "", quantity: 1, unit_price: 0 }])}>Add line</Button>
        </div>
        <div className="mt-3"><Label htmlFor="inv-notes">Notes on the invoice</Label><Textarea id="inv-notes" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><p className="font-semibold">Total {formatMoney(invoiceTotal(lines), settings.data?.currency ?? "")}</p><Button className="min-h-11" disabled={a.busy || !client} onClick={() => void create()}>Save draft</Button></div>
        <div className="mt-3"><Refusal msg={a.err} /></div>
      </Section>
      <Section id="inv-list" title="Invoices">
        {!q.data ? <p>Loading…</p> : q.data.length === 0 ? <p className="text-muted-foreground">No invoices yet.</p> : (
          <ul className="divide-y">{q.data.map(i => (
            <li key={i.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><p className="font-medium"><span className="font-mono">{i.number ?? "Draft"}</span> · {cname(i.client_id)}</p><p className="text-muted-foreground text-sm">{formatMoney(i.total, i.currency)} · created {fmtDate(i.created_at)}{i.issued_at ? ` · issued ${fmtDate(i.issued_at)}` : ""}</p></div>
                <div className="flex items-center gap-2"><StatusChip tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</StatusChip>
                  <Button variant="outline" className="min-h-11" onClick={() => setOpen(open === i.id ? null : i.id)} aria-expanded={open === i.id}>{open === i.id ? "Close" : "Open"}</Button></div>
              </div>
              {open === i.id ? <InvoiceActions inv={i} client={clients.find(c => c.id === i.client_id)} tiers={tiers} /> : null}
            </li>))}</ul>)}
      </Section>
    </div>
  );
}

function InvoiceActions({ inv, client, tiers }: { inv: Invoice; client: BClient | undefined; tiers: Tier[] }) {
  const a = useAct();
  const [pay, setPay] = useState({ date: new Date().toISOString().slice(0, 10), method: "", reference: "", amount: String(inv.total) });
  const [reason, setReason] = useState("");
  const [tier, setTier] = useState(inv.for_tier_id ?? "");
  const [tnote, setTnote] = useState("");
  const current = tiers.find(t => t.id === client?.tier_id);
  return (
    <div className="bg-muted mt-3 space-y-4 rounded-md p-4">
      <Refusal msg={a.err} />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-11"><Link to="/invoice/$invoiceId" params={{ invoiceId: inv.id }}>View and download PDF</Link></Button>
        {inv.status === "draft" ? <Button className="min-h-11" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_issue_invoice", { _invoice: inv.id }))}>Issue invoice</Button> : null}
      </div>
      {inv.status === "issued" ? (
        <fieldset className="grid gap-2 sm:grid-cols-4"><legend className="mb-2 font-semibold">Record payment</legend>
          <div><Label htmlFor={`pd-${inv.id}`}>Date</Label><Input id={`pd-${inv.id}`} type="date" className="min-h-11" value={pay.date} onChange={e => setPay({ ...pay, date: e.target.value })} /></div>
          <div><Label htmlFor={`pm-${inv.id}`}>Method</Label><Input id={`pm-${inv.id}`} placeholder="e.g. bank transfer" className="min-h-11" value={pay.method} onChange={e => setPay({ ...pay, method: e.target.value })} /></div>
          <div><Label htmlFor={`pr-${inv.id}`}>Reference</Label><Input id={`pr-${inv.id}`} className="min-h-11" value={pay.reference} onChange={e => setPay({ ...pay, reference: e.target.value })} /></div>
          <div><Label htmlFor={`pa-${inv.id}`}>Amount ({inv.currency})</Label><Input id={`pa-${inv.id}`} type="number" step="0.01" className="min-h-11" value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} /></div>
          <Button className="min-h-11 sm:col-span-4 sm:w-fit" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_record_payment", { _invoice: inv.id, _date: pay.date, _method: pay.method, _reference: pay.reference, _amount: Number(pay.amount) }))}>Mark as paid</Button>
        </fieldset>) : null}
      {inv.status === "draft" || inv.status === "issued" ? (
        <div className="flex flex-wrap items-end gap-2"><div className="flex-1"><Label htmlFor={`vr-${inv.id}`}>Void reason</Label><Input id={`vr-${inv.id}`} className="min-h-11" value={reason} onChange={e => setReason(e.target.value)} /></div>
          <Button variant="destructive" className="min-h-11" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_void_invoice", { _invoice: inv.id, _reason: reason }))}>Void invoice</Button></div>) : null}
      {inv.status === "paid" ? (
        <fieldset className="space-y-2"><legend className="font-semibold">Change tier</legend>
          <p className="text-sm">{client?.name}: currently {current?.name ?? "no tier"}, {client?.seats_used ?? 0} seats used. Paid {fmtDate(inv.payment_date)} · {inv.payment_method} · <span className="font-mono">{inv.payment_reference}</span></p>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={tier} onValueChange={setTier}><SelectTrigger className="min-h-11 w-56" aria-label="New tier"><SelectValue placeholder="Choose tier" /></SelectTrigger><SelectContent>{tiers.map(t => <SelectItem key={t.id} value={t.id}>{t.name} · {seatLabel(t.seat_limit)}</SelectItem>)}</SelectContent></Select>
            <Input aria-label="Tier change note" placeholder="Note (optional)" className="min-h-11 max-w-xs" value={tnote} onChange={e => setTnote(e.target.value)} />
            <Button className="min-h-11" disabled={a.busy || !tier} onClick={() => void a.run(() => supabase.rpc("billing_change_tier", { _client: inv.client_id, _tier: tier, _invoice: inv.id, _note: tnote }))}>Change tier</Button>
          </div>
        </fieldset>) : null}
      {inv.status === "void" ? <p className="text-sm">Voided {fmtDate(inv.voided_at)}: {inv.void_reason}</p> : null}
    </div>
  );
}

function Pricing({ tiers }: { tiers: Tier[] }) {
  const settings = useQuery({ queryKey: ["billing-settings"], queryFn: loadSettings });
  const a = useAct();
  const [cur, setCur] = useState<string>("");
  const [per, setPer] = useState<string>("");
  if (!settings.data) return <p>Loading…</p>;
  const c = cur || settings.data.currency; const p = per || settings.data.billing_period;
  return (
    <div className="space-y-6">
      <p className="bg-warn text-warn-foreground rounded-md p-4 font-medium">Prices are not yet set. Clients see "Price on request" for any tier without a price. Tier names and contents are placeholders until decided.</p>
      <Section id="settings" title="Currency and billing period" hint="Applies to all tiers and to new invoices.">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label>Currency</Label><Select value={c} onValueChange={setCur}><SelectTrigger className="min-h-11 w-32" aria-label="Currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="RM">RM</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div>
          <div><Label>Billing period</Label><Select value={p} onValueChange={setPer}><SelectTrigger className="min-h-11 w-40" aria-label="Billing period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select></div>
          <Button className="min-h-11" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_update_settings", { _currency: c, _period: p }))}>Save</Button>
        </div>
        <div className="mt-3"><Refusal msg={a.err} /></div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-3">{tiers.map(t => <TierEditor key={`${t.id}-${t.name}-${t.price}-${t.seat_limit}-${t.contents.join("|")}`} t={t} currency={settings.data.currency} period={settings.data.billing_period} />)}</div>
    </div>
  );
}

function TierEditor({ t, currency, period }: { t: Tier; currency: string; period: "monthly" | "yearly" }) {
  const a = useAct();
  const [name, setName] = useState(t.name);
  const [price, setPrice] = useState(t.price === null ? "" : String(t.price));
  const [seats, setSeats] = useState(t.seat_limit === null ? "" : String(t.seat_limit));
  const [contents, setContents] = useState(t.contents.join("\n"));
  return (
    <section className="panel space-y-3 p-5" aria-label={`Edit ${t.name}`}>
      <p className="text-muted-foreground text-sm">Tier {t.rank} · clients now see: {formatPrice(t.price, currency)}{t.price !== null ? ` ${PERIOD_LABEL[period]}` : ""}</p>
      <div><Label htmlFor={`n-${t.id}`}>Name</Label><Input id={`n-${t.id}`} className="min-h-11" value={name} onChange={e => setName(e.target.value)} /></div>
      <div><Label htmlFor={`p-${t.id}`}>Price ({currency}, {period}) · leave empty for "Price on request"</Label><Input id={`p-${t.id}`} type="number" min={0} step="0.01" className="min-h-11" value={price} onChange={e => setPrice(e.target.value)} /></div>
      <div><Label htmlFor={`s-${t.id}`}>Seat limit · leave empty for unlimited</Label><Input id={`s-${t.id}`} type="number" min={1} className="min-h-11" value={seats} onChange={e => setSeats(e.target.value)} /></div>
      <div><Label htmlFor={`c-${t.id}`}>What this tier contains (one per line)</Label><Textarea id={`c-${t.id}`} rows={5} value={contents} onChange={e => setContents(e.target.value)} /></div>
      <Refusal msg={a.err} />
      <Button className="min-h-11" disabled={a.busy} onClick={() => void a.run(() => supabase.rpc("billing_update_tier", { _tier: t.id, _name: name, _price: price === "" ? (null as never) : Number(price), _seat_limit: seats === "" ? (null as never) : Number(seats), _contents: contents.split("\n") }))}>Save {t.name}</Button>
    </section>
  );
}

function Log({ tiers, clients }: { tiers: Tier[]; clients: BClient[] }) {
  const q = useQuery({ queryKey: ["billing", "log"], queryFn: async () => {
    const [p, e, t] = await Promise.all([
      supabase.from("billing_price_log").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("billing_events").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("client_tier_log").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    const err = p.error ?? e.error ?? t.error; if (err) throw err;
    const ids = [...new Set([...(p.data ?? []), ...(e.data ?? []), ...(t.data ?? [])].map(r => r.actor))];
    const { data: people } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
    return { p: p.data ?? [], e: e.data ?? [], t: t.data ?? [], people: people ?? [] };
  } });
  if (q.error) return <Refusal msg={q.error.message} />;
  if (!q.data) return <p>Loading…</p>;
  const who = (id: string) => { const r = q.data.people.find(x => x.id === id); return r?.display_name || r?.email || "Client user"; };
  const tn = (id: string | null) => tiers.find(x => x.id === id)?.name ?? "—";
  const cn_ = (id: string) => clients.find(x => x.id === id)?.name ?? "Client";
  const v = (x: unknown) => (x === null || x === undefined ? "empty" : Array.isArray(x) ? x.join("; ") || "empty" : String(x));
  const Row = ({ at, by, children }: { at: string; by: string; children: React.ReactNode }) => <li className="grid gap-1 py-2 text-sm sm:grid-cols-[11rem_12rem_1fr]"><span className="text-muted-foreground">{new Date(at).toLocaleString("en-GB")}</span><span>{by}</span><span>{children}</span></li>;
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">These logs are append-only: the database refuses any edit or deletion.</p>
      <Section id="lg-p" title="Price and tier edits"><ul className="divide-y">{q.data.p.length === 0 ? <li className="text-muted-foreground">No edits yet.</li> : q.data.p.map(r => <Row key={r.id} at={r.created_at} by={who(r.actor)}>{r.tier_id ? `${tn(r.tier_id)} · ` : ""}{r.field}: {v(r.old_value)} → {v(r.new_value)}</Row>)}</ul></Section>
      <Section id="lg-t" title="Tier changes"><ul className="divide-y">{q.data.t.length === 0 ? <li className="text-muted-foreground">No tier changes yet.</li> : q.data.t.map(r => <Row key={r.id} at={r.created_at} by={who(r.actor)}>{cn_(r.client_id)}: {tn(r.old_tier_id)} → {tn(r.new_tier_id)} · {r.seats_used} seats used{r.note ? ` · ${r.note}` : ""}</Row>)}</ul></Section>
      <Section id="lg-e" title="Invoice and request events"><ul className="divide-y">{q.data.e.length === 0 ? <li className="text-muted-foreground">No events yet.</li> : q.data.e.map(r => <Row key={r.id} at={r.created_at} by={who(r.actor)}><span className={cn("font-medium")}>{r.kind.replace(/_/g, " ")}</span> · {cn_(r.client_id)}</Row>)}</ul></Section>
    </div>
  );
}
