import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DocCallout, DocStatus, PrintDocument, type DocTone } from "@/components/print/PrintDocument";
import { INVOICE_STATUS, errText, fmtDate, formatMoney, type ClientSummary, type Invoice } from "@/lib/billing";

export const Route = createFileRoute("/invoice/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice — FA Portal" },
      { name: "description", content: "FridayAnalytics invoice in the FA Portal A4 layout." },
      { property: "og:title", content: "Invoice — FA Portal" },
      { property: "og:description", content: "FridayAnalytics invoice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicePage,
});

const TONE: Record<string, DocTone> = { info: "neutral" as DocTone, caution: "caution", positive: "positive", negative: "negative" };

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const q = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Invoice not found, or you do not have access to it.");
      const inv = data as unknown as Invoice;
      const s = await supabase.rpc("billing_client_summary", { c: inv.client_id });
      if (s.error) throw s.error;
      return { inv, client: s.data as unknown as ClientSummary };
    },
  });
  if (q.error) return <p role="alert" className="bg-failed text-failed-foreground m-6 rounded-md p-4">{errText(q.error)}</p>;
  if (!q.data) return <p className="text-muted-foreground p-6">Loading…</p>;
  const { inv, client } = q.data;
  const st = INVOICE_STATUS[inv.status];
  return (
    <div className="bg-background min-h-screen">
      <div className="flex flex-wrap gap-2 p-4 print:hidden">
        <Button variant="outline" className="min-h-11" onClick={() => history.back()}><ArrowLeft className="size-4" />Back</Button>
        <Button className="min-h-11" onClick={() => window.print()}><Printer className="size-4" />Download PDF</Button>
        <Button asChild variant="ghost" className="min-h-11"><Link to="/portal">Client portal</Link></Button>
      </div>
      <PrintDocument label="Invoice" kicker={inv.number ?? "DRAFT · NOT ISSUED"} title={`Invoice for ${client.client_name}`} subtitle={`Issued ${fmtDate(inv.issued_at)}${inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ""}`}>
        <p><DocStatus tone={TONE[st.tone] ?? "caution"}>{st.label}</DocStatus></p>
        <table className="fa-doc-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
          <tbody>
            {inv.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{l.quantity}</td><td>{formatMoney(l.unit_price, inv.currency)}</td><td>{formatMoney(Math.round(l.quantity * l.unit_price * 100) / 100, inv.currency)}</td></tr>)}
            <tr><td colSpan={3}><strong>Total</strong></td><td><strong>{formatMoney(inv.total, inv.currency)}</strong></td></tr>
          </tbody>
        </table>
        {inv.status === "paid" ? <DocCallout>Paid {fmtDate(inv.payment_date)} by {inv.payment_method}, reference <span className="font-mono">{inv.payment_reference}</span>, {formatMoney(inv.payment_amount ?? 0, inv.currency)}.</DocCallout> : null}
        {inv.status === "void" ? <DocCallout>Void: {inv.void_reason}</DocCallout> : null}
        {inv.notes ? <p>{inv.notes}</p> : null}
        <p className="fa-doc-caption">Payment is made directly to FridayAnalytics. There is no online payment.</p>
      </PrintDocument>
    </div>
  );
}
