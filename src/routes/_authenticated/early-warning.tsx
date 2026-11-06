import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { formatDateTime } from "@/lib/format";
import { fetchHomeFile, type HomeFile } from "@/lib/library-home";
import { getAlertChannelStatus } from "@/lib/early-warning.functions";
import { DISPATCH_STATE, FRAMEWORKS, LEVELS, LEVEL_LABEL, SIGNALS, thresholdWord, type Level } from "@/lib/early-warning";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/early-warning")({
  validateSearch: (r: Record<string, unknown>): { preview?: "sample" | undefined } => ({ preview: r["preview"] === "sample" ? "sample" : undefined }),
  head: () => hubHead("Early warning", "Analyst-first early warning for escalating hate speech in FA Portal."),
  component: EarlyWarning,
});

type Alert = {
  id: string; project_id: string; project: string; level: Level; threshold: number; raised_at: string; signal: string; score: number; framework: string;
  capture_ids: string[]; note: string | null;
  decision: { decision: "confirmed" | "dismissed"; reason: string; at: string } | null;
  dispatches: { channel: string; state: string }[] | null;
  notice: { id: string; title: string; briefing: { path: string; sha256: string } | null; handovers: { to: string; at: string }[] | null } | null;
};
type Overview = {
  can_edit_settings: boolean;
  thresholds: { signal: string; level: Level; value: number | null }[];
  frameworks: { code: string; name: string; version_id: string | null; version: number | null }[];
  recipients: { channel: "email" | "telegram"; user_id: string; address: string; name: string | null }[];
  alerts: Alert[];
  signals: { id: string; project: string; signal: string; score: number; outcome: string; at: string }[];
};

const SAMPLE: Overview = {
  can_edit_settings: true,
  thresholds: SIGNALS.flatMap((s) => LEVELS.map((l) => ({ signal: s.id, level: l, value: null }))),
  frameworks: FRAMEWORKS.map((f) => ({ code: f.code, name: f.label, version_id: null, version: null })),
  recipients: [],
  alerts: [{
    id: "sample-a1", project_id: "sample", project: "Sample engagement", level: "warning", threshold: 5, raised_at: "2026-11-06T02:10:00Z",
    signal: "call_to_gather", score: 6, framework: "RABAT", capture_ids: ["sample-capture-1", "sample-capture-2"], note: "Sample — not a real alert",
    decision: null, dispatches: [{ channel: "portal", state: "shown_in_portal" }, { channel: "email", state: "no_recipients" }], notice: null,
  }],
  signals: [{ id: "sample-s1", project: "Sample engagement", signal: "volume_spike", score: 3, outcome: "threshold_not_set", at: "2026-11-06T01:00:00Z" }],
};

const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const sigLabel = (id: string) => SIGNALS.find((s) => s.id === id)?.label ?? id;
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);

function Dot({ tone }: { tone: "positive" | "caution" | "negative" | "muted" }) {
  return <span aria-hidden className={cn("size-2 rounded-full", tone === "positive" ? "bg-positive" : tone === "caution" ? "bg-caution" : tone === "negative" ? "bg-negative" : "bg-muted-foreground")} />;
}
function LevelChip({ level }: { level: Level }) {
  const tone = level === "urgent" ? "negative" : level === "warning" ? "caution" : "muted";
  const bg = level === "urgent" ? "bg-failed text-failed-foreground" : level === "warning" ? "bg-warn text-warn-foreground" : undefined;
  return <Chip tone={bg}><Dot tone={tone} />{LEVEL_LABEL[level]}</Chip>;
}

function EarlyWarning() {
  const { preview } = Route.useSearch();
  const sample = preview === "sample";
  const q = useQuery({
    queryKey: ["ew-overview"], enabled: !sample,
    queryFn: async () => { const { data, error } = await supabase.rpc("ew_overview"); if (error) throw error; return data as unknown as Overview; },
  });
  const statusFn = useServerFn(getAlertChannelStatus);
  const ch = useQuery({ queryKey: ["ew-channels"], enabled: !sample, queryFn: () => statusFn() });
  const data = sample ? SAMPLE : q.data;
  const channels = sample ? { email: { configured: false, missing: ["EW_EMAIL_SENDER_DOMAIN"] }, telegram: { configured: false, missing: ["TELEGRAM_API_KEY"] } } : ch.data;

  return (
    <>
      <PageHeader kicker="06 · Analyse" title="Early warning" subtitle="Scored signals, alerts for analysts, confirmed notices for NGOs. Every alert goes to FridayAnalytics analysts first — never straight to a client." />
      {sample ? <p className="bg-warn text-warn-foreground mb-4 rounded-md px-3 py-2 text-sm">Sample — demonstration data only. Nothing here is saved.</p> : null}
      {q.error ? <Refuse t={errText(q.error)} /> : null}
      {!data && !q.error ? <p className="text-muted-foreground text-sm">Loading…</p> : null}
      {data ? (
        <div className="grid gap-4">
          <Section id="alerts" title="Alerts" hint="An analyst confirms or dismisses each alert. Only a confirmed alert creates a notice the NGO can see." actions={!sample ? <RecordSignal frameworks={data.frameworks} /> : null}>
            {data.alerts.length === 0 ? <p className="text-muted-foreground text-sm">No alerts. Alerts can only be raised once a threshold is set and reached.</p> : (
              <ul className="grid gap-3">{data.alerts.map((a) => <AlertCard key={a.id} a={a} sample={sample} />)}</ul>
            )}
          </Section>

          <Section id="thresholds" title="Thresholds" hint="Not decided yet. A signal with no threshold set can never raise an alert.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead><tr className="text-muted-foreground text-left"><th className="py-2 pr-3">Signal</th>{LEVELS.map((l) => <th key={l} className="py-2 pr-3">{LEVEL_LABEL[l]}</th>)}</tr></thead>
                <tbody>
                  {SIGNALS.map((s) => (
                    <tr key={s.id} className="border-border border-t">
                      <td className="py-2 pr-3 font-medium">{s.label}</td>
                      {LEVELS.map((l) => {
                        const v = data.thresholds.find((t) => t.signal === s.id && t.level === l)?.value ?? null;
                        return <td key={l} className="py-2 pr-3"><span className={cn(v === null && "text-muted-foreground")}>{thresholdWord(v)}</span>
                          {data.can_edit_settings && !sample ? <SetThreshold signal={s.id} level={l} current={v} /> : null}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">Channels by level: Watch — portal only; Warning — portal and email; Urgent — portal, email and Telegram.</p>
          </Section>

          <Section id="channels" title="Channels and recipients" hint="Email and Telegram send nothing until their server settings are in place.">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="bg-muted rounded-lg p-3"><dt className="text-muted-foreground text-sm">Portal</dt><dd className="flex items-center gap-2 font-medium"><Dot tone="positive" />Ready</dd></div>
              {(["email", "telegram"] as const).map((c) => (
                <div key={c} className="bg-muted rounded-lg p-3"><dt className="text-muted-foreground text-sm">{c === "email" ? "Email" : "Telegram"}</dt>
                  <dd className="flex items-center gap-2 font-medium">{channels ? (channels[c].configured ? <><Dot tone="caution" />Configured — sending not switched on</> : <><Dot tone="muted" />Not configured</>) : "Checking…"}</dd></div>
              ))}
            </dl>
            <h3 className="mt-4 mb-2 font-medium">Recipients</h3>
            {!data.can_edit_settings ? <p className="text-muted-foreground text-sm">Only the owner, Curator or Management can see and change recipients.</p>
              : data.recipients.length === 0 ? <p className="text-muted-foreground text-sm">No recipients set.</p>
              : <ul className="grid gap-1 text-sm">{data.recipients.map((r) => <li key={r.channel + r.user_id}>{r.channel === "email" ? "Email" : "Telegram"} · {r.name ?? r.user_id} · <span className="font-mono">{r.address}</span></li>)}</ul>}
            {data.can_edit_settings && !sample ? <div className="mt-3"><SetRecipient /></div> : null}
          </Section>

          <Section id="frameworks" title="Scoring frameworks" hint="Read from the Frameworks library. A signal can only be scored against a Curator-approved version in force.">
            <ul className="grid gap-2 text-sm">
              {data.frameworks.map((f) => (
                <li key={f.code} className="flex flex-wrap items-center gap-2">
                  <Chip tone={f.version_id ? "bg-done text-done-foreground" : "bg-warn text-warn-foreground"}><Dot tone={f.version_id ? "positive" : "caution"} />{f.version_id ? `v${f.version} in force` : "No approved version"}</Chip>
                  <span>{f.name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm"><Link to="/frameworks" className="text-primary underline">Open the Frameworks library</Link> · <Link to="/document-samples/$kind" params={{ kind: "ew-briefing" }} className="text-primary underline">Briefing template (Sample)</Link></p>
          </Section>

          <Section id="signals" title="Recent signals without an alert">
            {data.signals.length === 0 ? <p className="text-muted-foreground text-sm">None.</p> : (
              <ul className="grid gap-1 text-sm">{data.signals.map((s) => (
                <li key={s.id}>{formatDateTime(s.at)} · {s.project} · {sigLabel(s.signal)} · score {s.score} · <strong>{s.outcome === "threshold_not_set" ? "Threshold not set" : "Below threshold"}</strong></li>
              ))}</ul>
            )}
          </Section>
        </div>
      ) : null}
    </>
  );
}

function AlertCard({ a, sample }: { a: Alert; sample: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const download = async () => {
    setMsg(null);
    const { data, error } = await supabase.rpc("ew_briefing_file", { _notice: a.notice!.id });
    if (error) return setMsg(error.message);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setMsg("Sign in to download");
    const res = await fetchHomeFile(data as unknown as HomeFile, session.access_token);
    if (!res.ok) return setMsg(res.message);
    const url = URL.createObjectURL(new Blob([res.bytes])); const el = document.createElement("a"); el.href = url; el.download = res.fileName; el.click(); URL.revokeObjectURL(url);
    setMsg("Fetched live from DarkNight. SHA-256 re-checked and matched.");
  };
  return (
    <li className="border-border rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <LevelChip level={a.level} />
        <span className="font-medium">{sigLabel(a.signal)}</span>
        <span className="text-muted-foreground text-sm">· {a.project} · score {a.score} (threshold {a.threshold}) · {a.framework} · {formatDateTime(a.raised_at)}</span>
      </div>
      {a.note ? <p className="mt-1 text-sm">{a.note}</p> : null}
      <p className="text-muted-foreground mt-1 text-sm">Cited captures: <span className="font-mono break-all">{a.capture_ids.join(", ")}</span></p>
      <ul className="mt-2 grid gap-0.5 text-sm">{(a.dispatches ?? []).map((d, i) => <li key={i}>{d.channel === "portal" ? "Portal" : d.channel === "email" ? "Email" : "Telegram"}: {DISPATCH_STATE[d.state] ?? d.state}</li>)}</ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {a.decision ? (
          <Chip tone={a.decision.decision === "confirmed" ? "bg-done text-done-foreground" : undefined}><Dot tone={a.decision.decision === "confirmed" ? "positive" : "muted"} />{a.decision.decision === "confirmed" ? "Confirmed" : "Dismissed"} · {a.decision.reason}</Chip>
        ) : (<><Chip tone="bg-warn text-warn-foreground"><Dot tone="caution" />Awaiting analyst</Chip>{!sample ? <Decide a={a} /> : <Button className="h-11" disabled>Confirm or dismiss</Button>}</>)}
        {a.notice ? (
          <>
            <span className="text-sm">Notice: “{a.notice.title}”</span>
            {a.notice.briefing ? <Button variant="outline" className="h-11" onClick={download}>Download briefing</Button> : <RegisterBriefing noticeId={a.notice.id} />}
            <Handover noticeId={a.notice.id} />
          </>
        ) : null}
      </div>
      {a.notice?.handovers?.length ? <p className="mt-2 text-sm">Handed over: {a.notice.handovers.map((h) => `${h.to} (${formatDateTime(h.at)})`).join("; ")}</p> : null}
      {msg ? <p role="status" className="mt-2 text-sm">{msg}</p> : null}
    </li>
  );
}

function useAction<T>(fn: (v: T) => Promise<{ error: { message: string } | null }>, onDone: () => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (v: T) => { const { error } = await fn(v); if (error) throw new Error(error.message); },
    onMutate: () => setErr(null),
    onError: (e) => setErr(errText(e)),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["ew-overview"] }); onDone(); },
  });
  return { m, err };
}

function Shell({ trigger, title, desc, open, setOpen, children, onSubmit, busy, err, submit }: {
  trigger: ReactNode; title: string; desc: string; open: boolean; setOpen: (b: boolean) => void; children: ReactNode; onSubmit: () => void; busy: boolean; err: string | null; submit: string;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          {children}
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={busy}>{busy ? "Saving…" : submit}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Decide({ a }: { a: Alert }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(true);
  const [reason, setReason] = useState(""); const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const { m, err } = useAction(() => supabase.rpc("ew_decide", { _alert: a.id, _confirm: confirm, _reason: reason, _title: title, _body: body }), () => { setOpen(false); toast.success(confirm ? "Alert confirmed; notice created" : "Alert dismissed"); });
  return (
    <Shell open={open} setOpen={setOpen} trigger={<Button className="h-11">Confirm or dismiss</Button>} title="Decide this alert" desc="Your decision is logged and cannot be changed." onSubmit={() => m.mutate(undefined)} busy={m.isPending} err={err} submit={confirm ? "Confirm alert" : "Dismiss alert"}>
      <fieldset className="flex gap-4"><legend className="sr-only">Decision</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={confirm} onChange={() => setConfirm(true)} />Confirm</label>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={!confirm} onChange={() => setConfirm(false)} />Dismiss</label>
      </fieldset>
      <div className="grid gap-1"><Label htmlFor="ew-reason">Reason</Label><Textarea id="ew-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {confirm ? (<>
        <div className="grid gap-1"><Label htmlFor="ew-title">Notice title (the NGO sees this)</Label><Input id="ew-title" className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="ew-body">Notice text</Label><Textarea id="ew-body" value={body} onChange={(e) => setBody(e.target.value)} /></div>
      </>) : null}
    </Shell>
  );
}

function RecordSignal({ frameworks }: { frameworks: Overview["frameworks"] }) {
  const [open, setOpen] = useState(false);
  const projects = useQuery({ queryKey: ["ew-projects"], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("projects").select("id,name").order("name"); if (error) throw error; return data; } });
  const [f, setF] = useState({ project: "", signal: SIGNALS[0].id as string, score: "", framework: frameworks[0]?.code ?? "RABAT", captures: "", note: "" });
  const [result, setResult] = useState<string | null>(null);
  const { m, err } = useAction(async () => {
    const r = await supabase.rpc("ew_record_signal", { _project: f.project, _signal: f.signal, _score: Number(f.score), _framework: f.framework, _captures: f.captures.split(/[\s,]+/).filter(Boolean), _note: f.note });
    if (!r.error) { const o = (r.data as { outcome: string }).outcome; setResult(o === "alert" ? "Alert raised for analysts." : o === "threshold_not_set" ? "Signal recorded. Threshold not set, so no alert." : "Signal recorded. Below threshold, so no alert."); }
    return r;
  }, () => { setOpen(false); if (result) toast(result); });
  return (
    <Shell open={open} setOpen={setOpen} trigger={<Button className="h-11">Record signal</Button>} title="Record a scored signal" desc="Cite the captures that support the score. The database decides whether an alert is raised." onSubmit={() => m.mutate(undefined)} busy={m.isPending} err={err} submit="Record signal">
      <div className="grid gap-1"><Label htmlFor="ew-p">Engagement</Label><select id="ew-p" className={sel} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">Choose…</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="grid gap-1"><Label htmlFor="ew-s">Signal</Label><select id="ew-s" className={sel} value={f.signal} onChange={(e) => setF({ ...f, signal: e.target.value })}>{SIGNALS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      <div className="grid gap-1"><Label htmlFor="ew-sc">Score</Label><Input id="ew-sc" className="h-11" inputMode="decimal" value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-fw">Scored against</Label><select id="ew-fw" className={sel} value={f.framework} onChange={(e) => setF({ ...f, framework: e.target.value })}>{FRAMEWORKS.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></div>
      <div className="grid gap-1"><Label htmlFor="ew-c">Capture IDs (comma or space separated)</Label><Textarea id="ew-c" className="font-mono" value={f.captures} onChange={(e) => setF({ ...f, captures: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-n">Note</Label><Input id="ew-n" className="h-11" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
    </Shell>
  );
}

function SetThreshold({ signal, level, current }: { signal: string; level: Level; current: number | null }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(current === null ? "" : String(current)); const [note, setNote] = useState("");
  const { m, err } = useAction(() => supabase.rpc("ew_set_threshold", { _signal: signal, _level: level, _value: (v.trim() === "" ? null : Number(v)) as number, _note: note }), () => setOpen(false));
  return (
    <Shell open={open} setOpen={setOpen} trigger={<Button variant="ghost" className="ml-1 h-11 px-2 text-sm" aria-label={`Set ${LEVEL_LABEL[level]} threshold for ${sigLabel(signal)}`}>Set</Button>} title={`${LEVEL_LABEL[level]} threshold — ${sigLabel(signal)}`} desc="Leave empty for Threshold not set. Every change is logged." onSubmit={() => m.mutate(undefined)} busy={m.isPending} err={err} submit="Save threshold">
      <div className="grid gap-1"><Label htmlFor="ew-tv">Threshold score</Label><Input id="ew-tv" className="h-11" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-tn">Note</Label><Input id="ew-tn" className="h-11" value={note} onChange={(e) => setNote(e.target.value)} /></div>
    </Shell>
  );
}

function SetRecipient() {
  const [open, setOpen] = useState(false);
  const staff = useQuery({ queryKey: ["ew-staff"], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("profiles").select("id,display_name,email"); if (error) throw error; return data; } });
  const [f, setF] = useState({ channel: "email" as "email" | "telegram", user: "", address: "", active: true });
  const { m, err } = useAction(() => supabase.rpc("ew_set_recipient", { _channel: f.channel, _user: f.user, _address: f.address, _active: f.active }), () => setOpen(false));
  return (
    <Shell open={open} setOpen={setOpen} trigger={<Button variant="outline" className="h-11">Add or change recipient</Button>} title="Alert recipient" desc="Recipients must be FridayAnalytics analysts. Nothing is sent until the channel is configured." onSubmit={() => m.mutate(undefined)} busy={m.isPending} err={err} submit="Save recipient">
      <div className="grid gap-1"><Label htmlFor="ew-rc">Channel</Label><select id="ew-rc" className={sel} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as "email" | "telegram" })}><option value="email">Email</option><option value="telegram">Telegram</option></select></div>
      <div className="grid gap-1"><Label htmlFor="ew-ru">Analyst</Label><select id="ew-ru" className={sel} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}><option value="">Choose…</option>{staff.data?.map((p) => <option key={p.id} value={p.id}>{p.display_name ?? p.email}</option>)}</select></div>
      <div className="grid gap-1"><Label htmlFor="ew-ra">{f.channel === "email" ? "Email address" : "Telegram chat ID"}</Label><Input id="ew-ra" className="h-11" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>
    </Shell>
  );
}

function RegisterBriefing({ noticeId }: { noticeId: string }) {
  const [open, setOpen] = useState(false);
  const sources = useQuery({ queryKey: ["ew-home-sources"], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("sources").select("id,name").eq("kind", "home_vault"); if (error) throw error; return data; } });
  const [f, setF] = useState({ source: "", path: "", sha: "", name: "" });
  const { m, err } = useAction(() => supabase.rpc("ew_register_briefing", { _notice: noticeId, _source: f.source, _path: f.path, _sha256: f.sha, _file_name: f.name }), () => setOpen(false));
  return (
    <Shell open={open} setOpen={setOpen} trigger={<Button variant="outline" className="h-11">Register briefing on DarkNight</Button>} title="Briefing document location" desc="The briefing stays on DarkNight. Only its location and SHA-256 are recorded here." onSubmit={() => m.mutate(undefined)} busy={m.isPending} err={err} submit="Register briefing">
      <div className="grid gap-1"><Label htmlFor="ew-bs">DarkNight source</Label><select id="ew-bs" className={sel} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Choose…</option>{sources.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="grid gap-1"><Label htmlFor="ew-bp">Path on DarkNight</Label><Input id="ew-bp" className="h-11 font-mono" value={f.path} onChange={(e) => setF({ ...f, path: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-bh">SHA-256</Label><Input id="ew-bh" className="h-11 font-mono" value={f.sha} onChange={(e) => setF({ ...f, sha: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-bn">File name</Label><Input id="ew-bn" className="h-11" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
    </Shell>
  );
}

function Handover({ noticeId }: { noticeId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ to: "", at: "", note: "" });
  const { m, err } = useAction(() => supabase.rpc("ew_record_handover", { _notice: noticeId, _to: f.to, _at: f.at ? new Date(f.at).toISOString() : "", _note: f.note }), () => setOpen(false));
  return (
    <Shell open={open} setOpen={setOpen} trigger={<Button variant="outline" className="h-11">Record hand-over</Button>} title="Briefing handed over in person" desc="Logged permanently." onSubmit={() => m.mutate(undefined)} busy={m.isPending} err={err} submit="Record hand-over">
      <div className="grid gap-1"><Label htmlFor="ew-ht">Handed to</Label><Input id="ew-ht" className="h-11" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-ha">When</Label><Input id="ew-ha" type="datetime-local" className="h-11" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></div>
      <div className="grid gap-1"><Label htmlFor="ew-hn">Note</Label><Input id="ew-hn" className="h-11" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
    </Shell>
  );
}
