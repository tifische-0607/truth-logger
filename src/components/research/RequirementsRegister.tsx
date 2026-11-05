import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Section, TextIn, csvList } from "@/components/engagement/ui";
import { Check, Refusal } from "@/components/research/ResearchBits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import { DARKNIGHT_UNAVAILABLE } from "@/lib/library-home";
import { errText, useVaultStatus } from "@/lib/research";
import {
  BASELINE_PLATFORMS,
  LANGUAGES,
  normLanguage,
  normPlatform,
  useRegister,
  type Requirement,
} from "@/lib/requirements";
import { cn } from "@/lib/utils";

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;

export function RequirementsRegister({ projectId, canEdit, canMark }: { projectId: string; canEdit: boolean; canMark: boolean }) {
  const reg = useRegister(projectId);
  const vault = useVaultStatus();
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["research"] });
  const [edit, setEdit] = useState<Requirement | "new" | null>(null);
  const [withdraw, setWithdraw] = useState<Requirement | null>(null);
  const [reopen, setReopen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const st = reg.data?.status;
  const current = reg.data?.current ?? [];
  const lastMark = reg.data?.marks[0] ?? null;

  const mark = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("research_mark_register", { _project: projectId, _complete: true });
      if (error) throw error;
    },
    onSuccess: () => { setErr(null); refresh(); },
    onError: (e) => setErr(errText(e)),
  });

  return (
    <Section
      id="collect-register"
      title="Data collection requirements register"
      hint="Fed by the signed brief. Every collected item must link to one of these requirement IDs; anything else is refused."
      actions={
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className={cn("size-2.5 rounded-full", st?.complete ? "bg-positive" : "bg-caution")} />
          {reg.isLoading ? "Checking…" : st?.complete ? "Complete" : "Not complete"}
        </span>
      }
    >
      {reg.error ? <Refusal text={errText(reg.error)} /> : null}
      {st && !st.brief_signed ? (
        <p className="text-sm">The brief is not signed yet (G0). The register is fed by the signed brief, so requirements can be added once it is signed.</p>
      ) : null}
      {st?.brief_signed ? (
        <p className="text-muted-foreground mb-3 text-sm">
          Brief in force: v{st.brief_version}
          {reg.data?.brief?.platforms.length ? ` · platforms ${reg.data.brief.platforms.join(", ")}` : ""}
          {reg.data?.brief?.languages.length ? ` · languages ${reg.data.brief.languages.join(", ")}` : ""}
          {reg.data?.brief?.window_from ? ` · ${formatDate(reg.data.brief.window_from)} to ${reg.data.brief.window_to ? formatDate(reg.data.brief.window_to) : "open"}` : ""}
        </p>
      ) : null}

      {!vault.isLoading && !vault.data?.online ? (
        <p role="status" className="bg-warn/10 border-warn mb-3 rounded-lg border-l-4 px-4 py-3 text-sm">
          <span className="font-semibold">DarkNight: </span>{DARKNIGHT_UNAVAILABLE}. Evidence is written only to DarkNight, never to cloud storage.
        </p>
      ) : null}

      {current.length ? (
        <ul className="divide-y rounded-lg border">
          {current.map((r) => (
            <li key={r.id} className="grid gap-2 p-4 text-sm md:grid-cols-[110px_1fr_auto] md:items-start">
              <div>
                <p className="font-mono font-semibold">{r.code}</p>
                <p className="text-muted-foreground text-xs">v{r.version} · brief v{r.brief_version}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                  <span aria-hidden className={cn("size-2 rounded-full", r.status === "active" ? "bg-positive" : "bg-muted-foreground")} />
                  {r.status === "active" ? "Active" : "Withdrawn"}
                </p>
              </div>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <Row k="Platform" v={label(BASELINE_PLATFORMS, r.platform)} />
                <Row k="Languages" v={r.languages.map((l) => label(LANGUAGES, l)).join(", ")} />
                <Row k="Accounts" v={r.accounts.join(", ") || "—"} />
                <Row k="Keywords" v={r.keywords.join(", ") || "—"} />
                <Row k="Time window" v={`${formatDate(r.window_from)} to ${formatDate(r.window_to)}`} />
                <Row k="Legal basis" v={r.legal_basis} />
                {r.change_reason ? <Row k="Change reason" v={r.change_reason} /> : null}
              </dl>
              {canEdit && r.status === "active" ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => setEdit(r)}>Change</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setWithdraw(r)}>Withdraw</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : st?.brief_signed ? (
        <p className="text-muted-foreground text-sm">No requirements yet.</p>
      ) : null}

      {st?.problems.length ? (
        <ul className="mt-3">{st.problems.map((p) => <Check key={p} ok={false}>{p}</Check>)}</ul>
      ) : null}
      {lastMark ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Last {lastMark.action === "complete" ? "marked complete" : "reopened"} {formatDateTime(lastMark.marked_at)}
          {lastMark.note ? ` · ${lastMark.note}` : ""}
          {lastMark.register_sha256 ? <span className="font-mono break-all"> · {lastMark.register_sha256}</span> : null}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && st?.brief_signed ? <Button className="min-h-11" onClick={() => setEdit("new")}>Add requirement</Button> : null}
        {canMark && st?.brief_signed && !st.complete ? (
          <Button variant="outline" className="min-h-11" disabled={mark.isPending} onClick={() => mark.mutate()}>
            {mark.isPending ? "Checking…" : "Mark register complete"}
          </Button>
        ) : null}
        {canMark && st?.complete ? <Button variant="outline" className="min-h-11" onClick={() => setReopen(true)}>Reopen register</Button> : null}
      </div>
      <div className="mt-2"><Refusal text={err} /></div>

      {edit ? (
        <RequirementDialog
          projectId={projectId}
          existing={edit === "new" ? null : edit}
          brief={reg.data?.brief ?? null}
          onClose={() => setEdit(null)}
          onDone={() => { setEdit(null); refresh(); }}
        />
      ) : null}
      {withdraw ? (
        <ReasonDialog
          title={`Withdraw ${withdraw.code}?`}
          description="Withdrawn requirements stay on record. Items can no longer be collected against it."
          action="Withdraw"
          onClose={() => setWithdraw(null)}
          run={async (reason) => {
            const { error } = await supabase.rpc("research_withdraw_requirement", { _project: projectId, _req_no: withdraw.req_no, _reason: reason });
            if (error) throw error;
            setWithdraw(null); refresh();
          }}
        />
      ) : null}
      {reopen ? (
        <ReasonDialog
          title="Reopen the register?"
          description="Research cannot start, and the collection device cannot store items, until it is marked complete again."
          action="Reopen"
          onClose={() => setReopen(false)}
          run={async (reason) => {
            const { error } = await supabase.rpc("research_mark_register", { _project: projectId, _complete: false, _note: reason });
            if (error) throw error;
            setReopen(false); refresh();
          }}
        />
      ) : null}
    </Section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{k}</dt>
      <dd className="break-words">{v}</dd>
    </div>
  );
}

function RequirementDialog({
  projectId, existing, brief, onClose, onDone,
}: {
  projectId: string;
  existing: Requirement | null;
  brief: { platforms: string[]; languages: string[]; window_from: string | null; window_to: string | null } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const briefPlats = (brief?.platforms ?? []).map(normPlatform);
  const briefLangs = (brief?.languages ?? []).map(normLanguage).filter((l) => LANGUAGES.some((x) => x.id === l));
  const [platform, setPlatform] = useState(existing?.platform ?? BASELINE_PLATFORMS.find((p) => briefPlats.includes(p.id))?.id ?? "facebook");
  const [accounts, setAccounts] = useState(existing?.accounts.join(", ") ?? "");
  const [keywords, setKeywords] = useState(existing?.keywords.join(", ") ?? "");
  const [langs, setLangs] = useState<string[]>(existing?.languages ?? (briefLangs.length ? briefLangs : ["ms"]));
  const [from, setFrom] = useState(existing?.window_from ?? brief?.window_from ?? "");
  const [to, setTo] = useState(existing?.window_to ?? brief?.window_to ?? "");
  const [basis, setBasis] = useState(existing?.legal_basis ?? "");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("research_add_requirement", {
        _project: projectId, _platform: platform, _accounts: csvList(accounts), _keywords: csvList(keywords),
        _languages: langs, _from: from, _to: to, _legal_basis: basis,
        ...(existing ? { _req_no: existing.req_no, _reason: reason } : {}),
      });
      if (error) throw error;
    },
    onSuccess: onDone,
    onError: (e) => setErr(errText(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Change ${existing.code}` : "Add requirement"}</DialogTitle>
          <DialogDescription>
            Prefilled from the signed brief. The database refuses anything outside the brief in force.
            {existing ? " The change is saved as a new version; the old one stays on record." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="grid gap-1 text-sm font-medium">
            Platform
            <select
              className="border-input bg-background min-h-11 rounded-md border px-3 text-base"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {BASELINE_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <TextIn label="Accounts (comma-separated)" value={accounts} onChange={setAccounts} placeholder="Page name, @handle" />
          <TextIn label="Keywords (comma-separated)" value={keywords} onChange={setKeywords} />
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Languages</legend>
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              {LANGUAGES.map((l) => (
                <label key={l.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <Checkbox
                    checked={langs.includes(l.id)}
                    onCheckedChange={(v) => setLangs((s) => (v === true ? [...s, l.id] : s.filter((x) => x !== l.id)))}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextIn label="Window from" type="date" value={from} onChange={setFrom} />
            <TextIn label="Window to" type="date" value={to} onChange={setTo} />
          </div>
          <TextIn label="Legal basis" value={basis} onChange={setBasis} placeholder="e.g. client instruction for a CMA s.233 complaint" />
          {existing ? <TextIn label="Reason for the change" value={reason} onChange={setReason} /> : null}
          <Refusal text={err} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onClose}>Cancel</Button>
          <Button className="min-h-11" disabled={save.isPending} onClick={() => { setErr(null); save.mutate(); }}>
            {save.isPending ? "Saving…" : existing ? "Save new version" : "Add requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReasonDialog({
  title, description, action, onClose, run,
}: { title: string; description: string; action: string; onClose: () => void; run: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({ mutationFn: () => run(reason), onError: (e) => setErr(errText(e)) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <TextIn label="Reason" value={reason} onChange={setReason} />
        <Refusal text={err} />
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={onClose}>Cancel</Button>
          <Button className="min-h-11" disabled={m.isPending} onClick={() => { setErr(null); m.mutate(); }}>{m.isPending ? "Saving…" : action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
