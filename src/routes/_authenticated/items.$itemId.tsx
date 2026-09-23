import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download, ExternalLink, Languages, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { HashChip } from "@/components/HashChip";
import { EvidenceThumb, useSignedUrl } from "@/components/EvidenceThumb";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDateTime, LIVE_KINDS, RENDER_KINDS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/items/$itemId")({
  component: ItemPage,
});

type Artefact = {
  id: string;
  filename: string;
  kind: string;
  storage_path: string;
  sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  captured_at: string;
};

async function logAccess(artefact: Artefact, itemId: string, note: string) {
  const handler = localStorage.getItem("fbem.handler") ?? "unknown";
  const { error } = await supabase.from("custody_events").insert({
    artefact_id: artefact.id,
    item_id: itemId,
    filename: artefact.filename,
    sha256: artefact.sha256,
    action: "accessed",
    handler,
    notes: note,
  });
  if (error) toast.error("Could not write custody event");
}

function ItemPage() {
  const { itemId } = Route.useParams();
  const [viewer, setViewer] = useState<Artefact | null>(null);

  const item = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select(
          "*, artefacts(*), accounts(id, handle, display_name, platform, incident_uuid, incidents(incident_id, case_id))",
        )
        .eq("id", itemId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const children = useQuery({
    queryKey: ["item-children", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, item_code, item_type, author_name, text_original, parent_item_id")
        .eq("parent_item_id", itemId)
        .order("item_code");
      if (error) throw error;
      return data;
    },
  });

  const custody = useQuery({
    queryKey: ["custody", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custody_events")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const viewerUrl = useSignedUrl(viewer?.storage_path ?? null, 300);

  if (item.isLoading) return <p className="text-muted-foreground">Loading evidence item…</p>;
  if (!item.data) return <p className="text-muted-foreground">Evidence item not found.</p>;

  const data = item.data;
  const artefacts = (data.artefacts ?? []) as Artefact[];
  const images = artefacts.filter(
    (a) => LIVE_KINDS.has(a.kind) || RENDER_KINDS.has(a.kind) || a.kind === "media",
  );
  const account = data.accounts;
  const engagement = (data.engagement ?? {}) as Record<string, unknown>;

  return (
    <>
      <PageHeader
        title={data.item_code}
        subtitle={
          account
            ? `CASE-${account.incidents?.case_id} · INC-${account.incidents?.incident_id} · ${account.platform}_@${account.handle}`
            : undefined
        }
        actions={
          data.url ? (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              Source URL <ExternalLink className="size-4" />
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <section className="panel xl:col-span-2">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Screenshots & renders</h2>
          <div className="grid grid-cols-2 gap-4 px-5 pb-5 md:grid-cols-3">
            {images.length ? (
              images.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="group text-left"
                  onClick={() => {
                    setViewer(a);
                    void logAccess(a, itemId, "Viewed full-size in FB Evidence Monitor");
                  }}
                >
                  <EvidenceThumb path={a.storage_path} />
                  <div
                    className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                      LIVE_KINDS.has(a.kind)
                        ? "bg-done text-done-foreground"
                        : "bg-warn text-warn-foreground"
                    }`}
                  >
                    {LIVE_KINDS.has(a.kind)
                      ? "Live screenshot"
                      : RENDER_KINDS.has(a.kind)
                        ? "Render – from API data, not a platform screenshot"
                        : "Media"}
                  </div>
                  <div className="hash text-muted-foreground mt-1">{a.filename}</div>
                </button>
              ))
            ) : (
              <p className="text-muted-foreground col-span-full pb-4 text-sm">
                No image artefacts on this item.
              </p>
            )}
          </div>
        </section>

        <section className="panel space-y-3 p-5">
          <h2 className="font-semibold">Item facts</h2>
          <Fact label="Type" value={data.item_type} />
          <Fact label="Author" value={data.author_name ?? "—"} />
          <Fact label="Author handle" value={data.author_handle ?? "—"} mono />
          <Fact label="Published" value={formatDateTime(data.published_at)} />
          <Fact label="Captured" value={formatDateTime(data.captured_at)} />
          <Fact label="Platform ID" value={data.platform_item_id ?? "—"} mono />
          <Fact label="Folder" value={data.folder_path ?? "—"} mono />
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">Engagement</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(engagement).length ? (
                Object.entries(engagement).map(([k, v]) => (
                  <span
                    key={k}
                    className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs"
                  >
                    {k}: {String(v)}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </div>
          </div>
          {data.parent_item_id ? (
            <Link
              to="/items/$itemId"
              params={{ itemId: data.parent_item_id }}
              className="text-primary inline-block text-sm underline"
            >
              ↑ Go to parent item
            </Link>
          ) : null}
        </section>

        <section className="panel xl:col-span-3">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Text</h2>
          <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
            <div>
              <div className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                Original
              </div>
              <p className="bg-muted/60 rounded-lg border p-4 text-sm whitespace-pre-wrap">
                {data.text_original ?? "—"}
              </p>
            </div>
            <div>
              <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold uppercase">
                <Languages className="size-3.5" /> English translation
              </div>
              <p className="bg-muted/60 rounded-lg border p-4 text-sm whitespace-pre-wrap">
                {data.text_en ?? "—"}
              </p>
              {data.translator_statement ? (
                <p className="text-muted-foreground mt-2 text-xs italic">
                  {data.translator_statement}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {children.data?.length ? (
          <section className="panel xl:col-span-3">
            <h2 className="px-5 pt-5 pb-3 font-semibold">
              Replies & comments ({children.data.length})
            </h2>
            <div className="divide-border divide-y">
              {children.data.map((child) => (
                <Link
                  key={child.id}
                  to="/items/$itemId"
                  params={{ itemId: child.id }}
                  className="hover:bg-muted block px-5 py-3.5 transition-colors"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs font-bold">{child.item_code}</span>
                    <span className="text-sm font-medium">{child.author_name ?? "Unknown"}</span>
                    <span className="text-muted-foreground text-xs">{child.item_type}</span>
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {child.text_original ?? ""}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel xl:col-span-2">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Artefacts ({artefacts.length})</h2>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-3">Filename</th>
                  <th className="py-2 pr-3">Kind</th>
                  <th className="py-2 pr-3">Size</th>
                  <th className="py-2 pr-3">SHA-256</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {artefacts.map((a) => (
                  <tr key={a.id}>
                    <td className="hash py-3 pr-3">{a.filename}</td>
                    <td className="py-3 pr-3 text-xs">{a.kind}</td>
                    <td className="py-3 pr-3 text-xs">{formatBytes(a.size_bytes)}</td>
                    <td className="py-3 pr-3">
                      <HashChip value={a.sha256} label="SHA-256" />
                    </td>
                    <td className="py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await logAccess(a, itemId, "Downloaded from FB Evidence Monitor");
                          const { data: signed, error } = await supabase.storage
                            .from("evidence")
                            .createSignedUrl(a.storage_path, 300, { download: a.filename });
                          if (error || !signed) {
                            toast.error("File not available in the evidence store");
                            return;
                          }
                          window.open(signed.signedUrl, "_blank");
                        }}
                      >
                        <Download className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {artefacts.length ? null : (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground py-6">
                      No artefacts recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel xl:col-span-1">
          <h2 className="px-5 pt-5 pb-3 font-semibold">Chain of custody</h2>
          <ol className="space-y-4 px-5 pb-5">
            {custody.data?.length ? (
              custody.data.map((event) => (
                <li key={event.id} className="border-border relative border-l pl-4">
                  <span className="bg-primary absolute -left-[5px] top-1.5 size-2.5 rounded-full" />
                  <div className="text-xs font-bold tracking-wide uppercase">{event.action}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatDateTime(event.created_at)} · {event.handler ?? "—"}
                  </div>
                  {event.filename ? (
                    <div className="hash text-muted-foreground">{event.filename}</div>
                  ) : null}
                  {event.notes ? <div className="mt-1 text-xs">{event.notes}</div> : null}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground text-sm">No custody events yet.</li>
            )}
          </ol>
        </section>
      </div>

      {viewer ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={() => setViewer(null)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <div className="hash">{viewer.filename}</div>
            <button onClick={() => setViewer(null)} className="p-2">
              <X className="size-6" />
            </button>
          </div>
          <div className="flex-1 touch-pinch-zoom overflow-auto p-4">
            {viewerUrl.data ? (
              <img src={viewerUrl.data} alt={viewer.filename} className="mx-auto max-w-none" />
            ) : (
              <p className="text-center text-white/70">Loading…</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs tracking-wide uppercase">{label}</div>
      <div className={`text-sm ${mono ? "hash" : ""}`}>{value}</div>
    </div>
  );
}
