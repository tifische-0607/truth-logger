import { useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { useMe } from "@/lib/projects";
import { formatDateTime } from "@/lib/format";
import { sha256Hex } from "@/lib/worker-shared";
import { extractLearnings } from "@/lib/frameworks.functions";
import { ENTRY_KINDS, LEARNING_CATEGORIES, PROPOSALS, VERSION_STATUS, kindLabel, type VersionStatus } from "@/lib/frameworks";
import { cn } from "@/lib/utils";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
export const Route = createFileRoute("/_authenticated/frameworks")({
  validateSearch: (r: Record<string, unknown>): { entry?: string | undefined } => ({ entry: str(r["entry"]) }),
  head: () => hubHead("Frameworks", "FA Portal framework library and the FridayAnalytics universal standard."),
  component: Frameworks,
});

const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);

type Entry = { id: string; code: string; name: string; kind: string };
type Version = { id: string; entry_id: string; version: number; effective_from: string; summary: string; body: string; items: unknown; change_note: string; author: string; created_at: string; status: VersionStatus; decided_by?: string | null | undefined; decision_note?: string | null | undefined };

function useLibrary() {
  return useQuery({
    queryKey: ["frameworks"],
    queryFn: async () => {
      const [e, v, a, s, l, d, ev] = await Promise.all([
        supabase.from("framework_entries").select("id, code, name, kind").order("kind").order("code"),
        supabase.from("framework_versions").select("*").order("version", { ascending: false }),
        supabase.from("framework_approvals").select("*"),
        supabase.from("framework_sources").select("*").order("uploaded_at", { ascending: false }),
        supabase.from("framework_learnings").select("*").order("created_at", { ascending: false }),
        supabase.from("framework_learning_decisions").select("*"),
        supabase.from("framework_events").select("*").order("at", { ascending: false }).limit(100),
      ]);
      const err = e.error ?? v.error ?? a.error ?? s.error ?? l.error ?? d.error ?? ev.error;
      if (err) throw err;
      const statuses = await Promise.all((v.data ?? []).map((x) => supabase.rpc("fw_version_status", { _v: x.id })));
      const appr = new Map((a.data ?? []).map((x) => [x.version_id, x]));
      const versions: Version[] = (v.data ?? []).map((x, i) => ({ ...x, status: (statuses[i]?.data as VersionStatus) ?? "pending", decided_by: appr.get(x.id)?.decided_by, decision_note: appr.get(x.id)?.note }));
      const ids = new Set<string>();
      versions.forEach((x) => { ids.add(x.author); if (x.decided_by) ids.add(x.decided_by); });
      (ev.data ?? []).forEach((x) => x.actor && ids.add(x.actor));
      (s.data ?? []).forEach((x) => ids.add(x.uploaded_by));
      const { data: people } = ids.size ? await supabase.from("profiles").select("id, display_name, email").in("id", [...ids]) : { data: [] };
      const name = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || "Staff"]));
      return { entries: (e.data ?? []) as Entry[], versions, sources: s.data ?? [], learnings: l.data ?? [], decisions: new Map((d.data ?? []).map((x) => [x.learning_id, x])), events: ev.data ?? [], who: (id?: string | null) => (id ? name.get(id) ?? "Staff" : "System") };
    },
  });
}

function StatusChip({ s }: { s: VersionStatus }) {
  const m = VERSION_STATUS[s];
  return <Chip><span className={cn("size-2 rounded-full", m.dot)} aria-hidden /> {m.label}</Chip>;
}

function Frameworks() {
  const me = useMe();
  const lib = useLibrary();
  const { entry } = Route.useSearch();
  const navigate = useNavigate({ from: "/frameworks" });
  const isEditor = !!(me.data?.isOwner || me.data?.isCurator);
  const isCurator = !!me.data?.isCurator;
  if (lib.error) return <><PageHeader title="Frameworks" /><p role="alert" className="bg-muted rounded-lg px-4 py-3 text-sm">{errText(lib.error)}</p></>;
  if (!lib.data) return <p className="text-muted-foreground text-sm">Loading library…</p>;
  const L = lib.data;
  const open = L.entries.find((x) => x.id === entry);
  return (
    <>
      <PageHeader kicker="Frameworks" title="Framework library" subtitle="One FridayAnalytics universal standard. External frameworks are source material, never parallel rulebooks. Staff only; clients never see this library." actions={isEditor && !open ? <AddEntry /> : undefined} />
      {open ? <EntryDetail e={open} L={L} isEditor={isEditor} isCurator={isCurator} onBack={() => void navigate({ search: {} })} /> : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {L.entries.map((e) => {
              const vs = L.versions.filter((v) => v.entry_id === e.id);
              const act = vs.find((v) => v.status === "active");
              const pend = vs.filter((v) => v.status === "pending").length;
              return (
                <article key={e.id} className={cn("panel space-y-2 p-5", e.kind === "universal_standard" && "ring-primary ring-2")}>
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-display font-medium">{e.name}</h2><Chip>{kindLabel(e.kind)}</Chip></div>
                  <p className="text-muted-foreground font-mono text-xs">{e.code}</p>
                  <p className="text-sm">{act ? <>In force: version {act.version}, effective {act.effective_from}</> : "No approved version yet. Content not loaded."}</p>
                  {pend ? <Chip tone="bg-warn text-warn-foreground"><span className="bg-caution size-2 rounded-full" aria-hidden /> {pend} awaiting Curator</Chip> : null}
                  <Button variant="outline" className="min-h-11" onClick={() => void navigate({ search: { entry: e.id } })}>Open</Button>
                </article>
              );
            })}
          </div>
          <Section id="fw-log" title="Change log" hint="Every change, with its author and approval. Append-only.">
            {L.events.length === 0 ? <p className="text-muted-foreground text-sm">No changes yet.</p> : (
              <ul className="divide-y text-sm">{L.events.map((x) => <li key={x.id} className="py-2">{formatDateTime(x.at)} · {L.who(x.actor)} · {x.action.replace(/_/g, " ")}{x.entry_id ? ` · ${L.entries.find((e) => e.id === x.entry_id)?.code ?? ""}` : ""}</li>)}</ul>
            )}
          </Section>
        </div>
      )}
    </>
  );
}

type Lib = NonNullable<ReturnType<typeof useLibrary>["data"]>;

function useRpc<V>(fn: (v: V) => PromiseLike<{ error: unknown }>, done: string, after?: () => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (v: V) => { const { error } = await fn(v); if (error) throw error; },
    onSuccess: () => { setErr(null); toast.success(done); void qc.invalidateQueries({ queryKey: ["frameworks"] }); void qc.invalidateQueries({ queryKey: ["framework-active"] }); after?.(); },
    onError: (e) => setErr(errText(e)),
  });
  return { m, err, setErr };
}

function FormDialog({ trigger, title, desc, children, onSubmit, pending, err, open, setOpen }: { trigger: string; title: string; desc: string; children: ReactNode; onSubmit: () => void; pending: boolean; err: string | null; open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="min-h-11">{trigger}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {children}
          <Refuse t={err} />
          <DialogFooter><Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="min-h-11" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddEntry() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [kind, setKind] = useState("framework");
  const { m, err, setErr } = useRpc(() => supabase.rpc("fw_add_entry", { _code: code, _name: name, _kind: kind }), "Entry added.", () => setOpen(false));
  return (
    <FormDialog trigger="Add entry" title="Add a library entry" desc="Entries start with no content. Add a version, then the Curator approves it." open={open} setOpen={(o) => { setOpen(o); setErr(null); }} onSubmit={() => m.mutate(undefined)} pending={m.isPending} err={err}>
      <div className="space-y-1"><Label htmlFor="fw-code">Code (capitals, digits, dashes)</Label><Input id="fw-code" className="min-h-11" value={code} onChange={(e) => setCode(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="fw-name">Name</Label><Input id="fw-name" className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="fw-kind">Type</Label><select id="fw-kind" className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>{ENTRY_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>
    </FormDialog>
  );
}

function ProposeVersion({ e, base }: { e: Entry; base?: Version | undefined }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(base?.summary ?? ""); const [body, setBody] = useState(base?.body ?? "");
  const [terms, setTerms] = useState(Array.isArray(base?.items) ? (base!.items as unknown[]).map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n") : "");
  const [eff, setEff] = useState(new Date().toISOString().slice(0, 10)); const [note, setNote] = useState("");
  const { m, err, setErr } = useRpc(() => {
    const items = terms.split("\n").map((t) => t.trim()).filter(Boolean).map((t) => { try { return JSON.parse(t) as unknown; } catch { return t; } });
    return supabase.rpc("fw_propose_version", { _entry: e.id, _effective: eff, _summary: summary, _body: body, _items: items as never, _note: note });
  }, "New version saved. It waits for the Curator.", () => setOpen(false));
  return (
    <FormDialog trigger="Edit (new version)" title={`New version of ${e.code}`} desc="Saving creates a new version. Older versions stay readable. Modules keep using the version in force until the Curator approves this one." open={open} setOpen={(o) => { setOpen(o); setErr(null); }} onSubmit={() => m.mutate(undefined)} pending={m.isPending} err={err}>
      <div className="space-y-1"><Label htmlFor="v-sum">Summary</Label><Input id="v-sum" className="min-h-11" value={summary} onChange={(x) => setSummary(x.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="v-body">Text</Label><Textarea id="v-body" rows={5} value={body} onChange={(x) => setBody(x.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="v-items">Structured items (one per line: indicator, term or JSON)</Label><Textarea id="v-items" rows={5} className="font-mono text-xs" value={terms} onChange={(x) => setTerms(x.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="v-eff">Effective from</Label><Input id="v-eff" type="date" className="min-h-11" value={eff} onChange={(x) => setEff(x.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="v-note">What changed (required)</Label><Input id="v-note" className="min-h-11" value={note} onChange={(x) => setNote(x.target.value)} /></div>
    </FormDialog>
  );
}

function DecideVersion({ v }: { v: Version }) {
  const [open, setOpen] = useState(false); const [note, setNote] = useState(""); const [approve, setApprove] = useState(true);
  const { m, err, setErr } = useRpc(() => supabase.rpc("fw_decide_version", { _version: v.id, _approve: approve, _note: note }), approve ? "Version approved." : "Version rejected.", () => setOpen(false));
  return (
    <FormDialog trigger="Decide" title={`Decide version ${v.version}`} desc="Only the Curator can approve. Approved versions are used from their effective date; past results keep the version they used." open={open} setOpen={(o) => { setOpen(o); setErr(null); }} onSubmit={() => m.mutate(undefined)} pending={m.isPending} err={err}>
      <fieldset className="flex gap-2"><legend className="sr-only">Decision</legend>
        <Button type="button" aria-pressed={approve} variant={approve ? "default" : "outline"} className="min-h-11" onClick={() => setApprove(true)}>Approve</Button>
        <Button type="button" aria-pressed={!approve} variant={!approve ? "default" : "outline"} className="min-h-11" onClick={() => setApprove(false)}>Reject</Button>
      </fieldset>
      <div className="space-y-1"><Label htmlFor="d-note">Note{approve ? " (optional)" : " (required)"}</Label><Input id="d-note" className="min-h-11" value={note} onChange={(x) => setNote(x.target.value)} /></div>
    </FormDialog>
  );
}

function EntryDetail({ e, L, isEditor, isCurator, onBack }: { e: Entry; L: Lib; isEditor: boolean; isCurator: boolean; onBack: () => void }) {
  const vs = L.versions.filter((v) => v.entry_id === e.id);
  const act = vs.find((v) => v.status === "active");
  const srcs = L.sources.filter((s) => s.entry_id === e.id || e.kind === "universal_standard");
  return (
    <div className="space-y-6">
      <Button variant="outline" className="min-h-11" onClick={onBack}>Back to library</Button>
      <Section id="entry" title={`${e.name} (${e.code})`} hint={kindLabel(e.kind)} actions={isEditor ? <ProposeVersion e={e} base={vs[0]} /> : undefined}>
        {vs.length === 0 ? <p className="text-muted-foreground text-sm">No versions yet. Content not loaded.</p> : (
          <ul className="divide-y">
            {vs.map((v) => (
              <li key={v.id} className="space-y-1 py-4">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Version {v.version}</span><StatusChip s={v.status} />{isCurator && v.status === "pending" ? <DecideVersion v={v} /> : null}</div>
                <p className="text-muted-foreground text-xs">Effective {v.effective_from} · by {L.who(v.author)} on {formatDateTime(v.created_at)}{v.decided_by ? ` · decided by ${L.who(v.decided_by)}` : ""}{v.decision_note ? `: ${v.decision_note}` : ""}</p>
                <p className="text-sm">{v.summary}</p>
                <p className="text-muted-foreground text-sm">Change: {v.change_note}</p>
                {v === act || v === vs[0] ? (
                  <details className="text-sm"><summary className="flex min-h-11 cursor-pointer items-center">Show content ({Array.isArray(v.items) ? (v.items as unknown[]).length : 0} items)</summary>
                    {v.body ? <p className="whitespace-pre-wrap">{v.body}</p> : null}
                    <ul className="mt-2 list-disc space-y-1 pl-5">{(Array.isArray(v.items) ? (v.items as unknown[]) : []).map((x, i) => <li key={i} className="break-words">{typeof x === "string" ? x : <ItemView x={x as Record<string, unknown>} />}</li>)}</ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section id="sources" title="Resources and learnings" hint="Load a resource; its learnings become draft enhancements to the universal standard, each tied to its page and passage. The original file is kept, hashed and versioned." actions={isEditor ? <LoadSource e={e} /> : undefined}>
        {srcs.length === 0 ? <p className="text-muted-foreground text-sm">No resources loaded.</p> : (
          <ul className="space-y-5">{srcs.map((s) => <SourceBlock key={s.id} s={s} L={L} isEditor={isEditor} isCurator={isCurator} />)}</ul>
        )}
      </Section>
    </div>
  );
}

function ItemView({ x }: { x: Record<string, unknown> }) {
  return <span>{String(x["text"] ?? JSON.stringify(x))}{x["source"] ? <span className="text-muted-foreground"> · {String(x["source"])}, {String(x["page"] ?? "")}</span> : null}</span>;
}

function LoadSource({ e }: { e: Entry }) {
  const [open, setOpen] = useState(false); const [title, setTitle] = useState(""); const [file, setFile] = useState<File | null>(null);
  const { m, err, setErr } = useRpc(async () => {
    if (!file) return { error: { message: "Choose a file." } };
    const sha = await sha256Hex(await file.arrayBuffer());
    const path = `sources/${sha}/${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await supabase.storage.from("framework-sources").upload(path, file, { upsert: false });
    if (up.error && !/exists/i.test(up.error.message)) return { error: up.error };
    return supabase.rpc("fw_record_source", { _entry: e.id, _title: title || file.name, _file: file.name, _path: path, _sha: sha, _size: file.size });
  }, "Resource loaded and hashed.", () => setOpen(false));
  return (
    <FormDialog trigger="Load resource" title="Load a resource" desc="The file is stored privately under its SHA-256 and is never changed." open={open} setOpen={(o) => { setOpen(o); setErr(null); }} onSubmit={() => m.mutate(undefined)} pending={m.isPending} err={err}>
      <div className="space-y-1"><Label htmlFor="s-title">Title</Label><Input id="s-title" className="min-h-11" value={title} onChange={(x) => setTitle(x.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="s-file">File</Label><Input id="s-file" type="file" className="min-h-11" onChange={(x) => setFile(x.target.files?.[0] ?? null)} /></div>
    </FormDialog>
  );
}

function SourceBlock({ s, L, isEditor, isCurator }: { s: Lib["sources"][number]; L: Lib; isEditor: boolean; isCurator: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const ex = useMutation({ mutationFn: () => extractLearnings({ data: { sourceId: s.id } }), onSuccess: (r) => setMsg(r.message), onError: (e) => setMsg(errText(e)) });
  const ls = L.learnings.filter((l) => l.source_id === s.id);
  const download = async () => {
    const { data, error } = await supabase.storage.from("framework-sources").download(s.storage_path);
    if (error || !data) { toast.error(error?.message ?? "Could not open the file."); return; }
    const sha = await sha256Hex(await data.arrayBuffer());
    if (sha !== s.sha256) { toast.error("Blocked: this file's SHA-256 does not match the record."); return; }
    const url = URL.createObjectURL(data); const a = document.createElement("a"); a.href = url; a.download = s.file_name; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <li className="bg-muted/40 space-y-3 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-semibold">{s.title} <span className="text-muted-foreground text-sm">v{s.version}</span></p><p className="text-muted-foreground font-mono text-xs break-all">SHA-256 {s.sha256}</p><p className="text-muted-foreground text-xs">Loaded by {L.who(s.uploaded_by)} on {formatDateTime(s.uploaded_at)}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" onClick={download}>Download</Button>
          {isEditor ? <Button variant="outline" className="min-h-11" disabled={ex.isPending} onClick={() => ex.mutate()}>Extract learnings</Button> : null}
          {isEditor ? <AddLearning sourceId={s.id} /> : null}
        </div>
      </div>
      {msg ? <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">{msg}</p> : null}
      {ls.length === 0 ? <p className="text-muted-foreground text-sm">No learnings recorded.</p> : (
        <ul className="divide-y">{ls.map((l) => { const d = L.decisions.get(l.id); return (
          <li key={l.id} className="space-y-1 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{PROPOSALS.find((p) => p.id === l.proposal)?.label}</Chip><Chip>{LEARNING_CATEGORIES.find((c) => c.id === l.category)?.label}</Chip>
              <Chip><span className={cn("size-2 rounded-full", d ? (d.decision === "approved" ? "bg-positive" : "bg-negative") : "bg-caution")} aria-hidden /> {d ? (d.decision === "approved" ? "Merged into the standard" : "Rejected") : "Draft, awaiting Curator"}</Chip>
              {l.method === "manual" ? <Chip>Entered by hand</Chip> : null}
            </div>
            <p>{d?.final_text ?? l.text}</p>
            <p className="text-muted-foreground">{l.page}: “{l.passage}”</p>
            {l.overlap_note ? <p className="text-caution-foreground bg-warn rounded px-2 py-1">Possible overlap: {l.overlap_note}</p> : null}
            {d?.note ? <p className="text-muted-foreground">Curator note: {d.note}</p> : null}
            {isCurator && !d ? <DecideLearning id={l.id} text={l.text} /> : null}
          </li>
        ); })}</ul>
      )}
    </li>
  );
}

function AddLearning({ sourceId }: { sourceId: string }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState("definition"); const [prop, setProp] = useState("add"); const [text, setText] = useState(""); const [page, setPage] = useState(""); const [passage, setPassage] = useState("");
  const { m, err, setErr } = useRpc(() => supabase.rpc("fw_add_learning", { _source: sourceId, _category: cat, _proposal: prop, _text: text, _passage: passage, _page: page, _method: "manual" }), "Learning saved as a draft.", () => { setOpen(false); setText(""); setPassage(""); setPage(""); });
  return (
    <FormDialog trigger="Add learning" title="Record a learning" desc="A draft recommended enhancement to the universal standard, linked to the exact page and passage." open={open} setOpen={(o) => { setOpen(o); setErr(null); }} onSubmit={() => m.mutate(undefined)} pending={m.isPending} err={err}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="l-cat">Type</Label><select id="l-cat" className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>{LEARNING_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="l-prop">Recommendation</Label><select id="l-prop" className={sel} value={prop} onChange={(e) => setProp(e.target.value)}>{PROPOSALS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
      </div>
      <div className="space-y-1"><Label htmlFor="l-text">Learning</Label><Textarea id="l-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="l-page">Page or section</Label><Input id="l-page" className="min-h-11" value={page} onChange={(e) => setPage(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="l-pass">Exact passage</Label><Textarea id="l-pass" rows={3} value={passage} onChange={(e) => setPassage(e.target.value)} /></div>
    </FormDialog>
  );
}

function DecideLearning({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false); const [approve, setApprove] = useState(true); const [final, setFinal] = useState(text); const [note, setNote] = useState("");
  const { m, err, setErr } = useRpc(() => supabase.rpc("fw_decide_learning", { _learning: id, _approve: approve, _final: final, _note: note }), approve ? "Merged into the universal standard as a new version." : "Learning rejected.", () => setOpen(false));
  return (
    <FormDialog trigger="Decide" title="Decide this learning" desc="Approving merges it into the universal standard as a new version. Only the Curator can decide." open={open} setOpen={(o) => { setOpen(o); setErr(null); }} onSubmit={() => m.mutate(undefined)} pending={m.isPending} err={err}>
      <fieldset className="flex gap-2"><legend className="sr-only">Decision</legend>
        <Button type="button" aria-pressed={approve} variant={approve ? "default" : "outline"} className="min-h-11" onClick={() => setApprove(true)}>Approve</Button>
        <Button type="button" aria-pressed={!approve} variant={!approve ? "default" : "outline"} className="min-h-11" onClick={() => setApprove(false)}>Reject</Button>
      </fieldset>
      {approve ? <div className="space-y-1"><Label htmlFor="dl-final">Final wording (you may edit)</Label><Textarea id="dl-final" rows={3} value={final} onChange={(e) => setFinal(e.target.value)} /></div> : null}
      <div className="space-y-1"><Label htmlFor="dl-note">Note{approve ? " (optional)" : " (required)"}</Label><Input id="dl-note" className="min-h-11" value={note} onChange={(e) => setNote(e.target.value)} /></div>
    </FormDialog>
  );
}
