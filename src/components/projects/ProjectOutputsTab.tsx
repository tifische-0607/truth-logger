import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Download, FileUp, Hammer, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { HashChip } from "@/components/HashChip";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sha256Hex, useDarkNight } from "@/lib/darknight";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  BuildBlocked,
  attachFile,
  buildOutput,
  outputStoragePath,
  saveBlob,
  type BuildProblem,
  type BuiltOutput,
} from "@/lib/project-outputs";
import {
  OUTPUT_KINDS,
  OUTPUT_STATUS_LABEL,
  OUTPUT_STATUS_STYLE,
  outputKindLabel,
  plural,
  useMe,
  type OutputKind,
  type OutputStatus,
  type ProjectOutput,
  type Workspace,
} from "@/lib/projects";
import { currentHandler } from "@/lib/sources";
import { cn } from "@/lib/utils";

export function ProjectOutputsTab({ ws }: { ws: Workspace }) {
  const [newOpen, setNewOpen] = useState(false);
  const [problems, setProblems] = useState<BuildProblem[] | null>(null);
  const wanted = (ws.current?.output_kinds ?? []) as OutputKind[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-2xl text-sm">
          Each output answers one brief version. Drafts can be rebuilt; once the lead approves an
          output, its file and hash are fixed. Bundles with home-vault files stay on the device that
          built them — the hub keeps only their hash.
        </p>
        {ws.canWork ? (
          <Button className="min-h-11" disabled={!ws.current} onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New output
          </Button>
        ) : null}
      </div>
      {!ws.current ? (
        <p className="panel text-muted-foreground p-6 text-sm">Write the brief first.</p>
      ) : null}
      <div className="space-y-3">
        {ws.outputs.map((o) => (
          <OutputCard key={o.id} ws={ws} o={o} onProblems={setProblems} />
        ))}
        {ws.current && !ws.outputs.length ? (
          <p className="panel text-muted-foreground p-6 text-sm">
            No outputs yet.{" "}
            {wanted.length ? `The brief asks for: ${wanted.map(outputKindLabel).join(", ")}.` : ""}
          </p>
        ) : null}
      </div>
      <NewOutputDialog ws={ws} open={newOpen} onOpenChange={setNewOpen} />
      <Dialog open={!!problems} onOpenChange={(v) => !v && setProblems(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bundle not built</DialogTitle>
            <DialogDescription>
              These files could not be verified, so nothing was packed. Fix or remove the items,
              then build again.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {(problems ?? []).map((p, i) => (
              <li key={i} className="rounded-lg border px-3 py-2">
                <span className="font-mono text-xs font-semibold">{p.code}</span>{" "}
                <span className="text-muted-foreground">{p.filename ?? ""}</span>
                <div>{p.reason}</div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setProblems(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewOutputDialog({
  ws,
  open,
  onOpenChange,
}: {
  ws: Workspace;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const me = useMe();
  const wanted = (ws.current?.output_kinds ?? []) as OutputKind[];
  const [kind, setKind] = useState<OutputKind>(wanted[0] ?? "report");
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_outputs").insert({
        project_id: ws.project.id,
        brief_id: ws.current!.id,
        kind,
        title: title.trim() || `${outputKindLabel(kind)} — ${ws.project.code}`,
        created_by_name: me.data?.name || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", ws.project.id] });
      onOpenChange(false);
      setTitle("");
      toast.success("Draft output created — build or attach its file");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create"),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New output</DialogTitle>
          <DialogDescription>Answers brief version {ws.current?.version}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as OutputKind)}>
              <SelectTrigger aria-label="Output type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_KINDS.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.label}
                    {wanted.includes(k.id) ? "" : " (not in the brief)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {OUTPUT_KINDS.find((k) => k.id === kind)?.blurb}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="o-title">Title</Label>
            <Input
              id="o-title"
              placeholder={`${outputKindLabel(kind)} — ${ws.project.code}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutputCard({
  ws,
  o,
  onProblems,
}: {
  ws: Workspace;
  o: ProjectOutput;
  onProblems: (p: BuildProblem[]) => void;
}) {
  const qc = useQueryClient();
  const me = useMe();
  const dn = useDarkNight();
  const fileRef = useRef<HTMLInputElement>(null);
  const [onlyIncluded, setOnlyIncluded] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const status = o.status as OutputStatus;
  const kind = o.kind as OutputKind;
  const brief = ws.briefs.find((b) => b.id === o.brief_id);
  const superseded = brief && ws.current && brief.id !== ws.current.id;
  const editable = ws.canWork && (status === "draft" || status === "in_review");
  const params = (o.params ?? {}) as Record<string, unknown>;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["project", ws.project.id] });
    void qc.invalidateQueries({ queryKey: ["clients-projects"] });
  };

  const record = async (built: BuiltOutput) => {
    let location: string | null = null;
    if (built.uploadable) {
      const path = outputStoragePath(ws, o.id, built.fileName);
      const { error: upErr } = await supabase.storage.from("evidence").upload(path, built.blob, {
        contentType: built.blob.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;
      location = path;
    }
    const { error } = await supabase
      .from("project_outputs")
      .update({
        sha256: built.sha256,
        file_name: built.fileName,
        size_bytes: built.sizeBytes,
        item_count: built.itemCount,
        params: built.params as never,
        location,
      })
      .eq("id", o.id);
    if (error) throw error;
  };

  const build = useMutation({
    mutationFn: async () => {
      setProgress("Building…");
      const built = await buildOutput(
        kind,
        ws,
        {
          gatewayBase: dn.online ? (dn.base ?? null) : null,
          onlyIncluded,
          handler: me.data?.name || currentHandler(),
        },
        (done, total) => setProgress(`Verifying files ${done} of ${total}…`),
      );
      setProgress("Saving…");
      await record(built);
      if (kind !== "dashboard") saveBlob(built.blob, built.fileName);
      return built;
    },
    onSuccess: (b) => {
      refresh();
      toast.success(
        b.uploadable
          ? `Built ${b.fileName}`
          : `Built ${b.fileName} — kept on this device only (home-vault files inside)`,
      );
    },
    onError: (e) => {
      if (e instanceof BuildBlocked) onProblems(e.problems);
      else toast.error(e instanceof Error ? e.message : "Build failed");
    },
    onSettled: () => setProgress(null),
  });

  const attach = useMutation({
    mutationFn: async (file: File) => {
      const built = await attachFile(ws, file);
      await record(built);
      return built;
    },
    onSuccess: (b) => {
      refresh();
      toast.success(`Attached ${b.fileName}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not attach"),
  });

  const setStatus = useMutation({
    mutationFn: async (patch: { status?: OutputStatus; shared_with_client?: boolean }) => {
      const { error } = await supabase.from("project_outputs").update(patch).eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const download = useMutation({
    mutationFn: async () => {
      if (!o.location) throw new Error("This file was not uploaded");
      const { data, error } = await supabase.storage.from("evidence").download(o.location);
      if (error || !data) throw error ?? new Error("File not found");
      const got = await sha256Hex(await data.arrayBuffer());
      if (o.sha256 && got !== o.sha256)
        throw new Error("The stored file does not match its recorded hash");
      saveBlob(data, o.file_name ?? "output");
      await supabase.from("project_events").insert({
        project_id: ws.project.id,
        output_id: o.id,
        action: "output_downloaded",
        actor: me.data?.uid ?? null,
        actor_name: me.data?.name || null,
        detail: { sha256: got },
      });
    },
    onSuccess: () => toast.success("Downloaded; hash verified"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Download failed"),
  });

  const busy = build.isPending || attach.isPending || setStatus.isPending;
  const needsFile = kind === "evidence_bundle" || kind === "dataset";

  return (
    <article className="panel space-y-3 p-4" aria-label={o.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
              {outputKindLabel(kind)}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                OUTPUT_STATUS_STYLE[status],
              )}
            >
              {OUTPUT_STATUS_LABEL[status]}
            </span>
            {o.shared_with_client ? (
              <span className="bg-done text-done-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                Shared with client
              </span>
            ) : null}
            <span
              className={cn(
                "text-xs",
                superseded ? "text-warn-foreground font-semibold" : "text-muted-foreground",
              )}
            >
              brief v{brief?.version ?? "?"}
              {superseded ? " (superseded)" : ""}
            </span>
          </div>
          <h3 className="mt-1 font-semibold">{o.title}</h3>
          <div className="text-muted-foreground text-xs">
            {o.created_by_name ?? "—"} · created {formatDateTime(o.created_at)}
            {o.approved_at ? ` · approved ${formatDateTime(o.approved_at)}` : ""}
            {o.delivered_at ? ` · delivered ${formatDateTime(o.delivered_at)}` : ""}
          </div>
        </div>
        {progress ? (
          <span className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-4 animate-spin" /> {progress}
          </span>
        ) : null}
      </div>

      {o.file_name || o.sha256 ? (
        <div className="bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-xs">
          <span className="font-mono">{o.file_name}</span>
          <span>{formatBytes(o.size_bytes)}</span>
          <span>{plural(o.item_count ?? 0, "item")}</span>
          {typeof params["files"] === "number" ? (
            <span>{String(params["files"])} files</span>
          ) : null}
          <HashChip value={o.sha256} />
          {!o.location && o.sha256 ? (
            <span className="text-home-foreground">Kept on the building device only</span>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No file yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <>
            {kind === "evidence_bundle" || kind === "dataset" ? (
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <Checkbox
                  checked={onlyIncluded}
                  onCheckedChange={(v) => setOnlyIncluded(Boolean(v))}
                />
                Only items that meet the brief
              </label>
            ) : null}
            <Button
              variant="outline"
              className="min-h-10"
              disabled={busy}
              onClick={() => build.mutate()}
            >
              <Hammer className="size-4" />
              {kind === "report"
                ? "Build skeleton"
                : kind === "dashboard"
                  ? "Take snapshot"
                  : o.sha256
                    ? "Rebuild"
                    : "Build"}
            </Button>
            {kind === "report" || kind === "dataset" ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attach.mutate(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  className="min-h-10"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <FileUp className="size-4" /> Attach final file
                </Button>
              </>
            ) : null}
          </>
        ) : null}
        {kind === "dashboard" ? (
          <Button asChild variant="outline" className="min-h-10">
            <Link
              to="/projects/$projectId"
              params={{ projectId: ws.project.id }}
              search={{ tab: "dashboard" }}
            >
              Open live dashboard
            </Link>
          </Button>
        ) : null}
        {o.location ? (
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            <Download className="size-4" /> Download
          </Button>
        ) : null}

        <span className="flex-1" />
        {ws.canWork && status === "draft" ? (
          <Button
            className="min-h-10"
            disabled={busy || (needsFile && !o.sha256)}
            onClick={() => setStatus.mutate({ status: "in_review" })}
          >
            Submit for review
          </Button>
        ) : null}
        {ws.canWork && status === "in_review" ? (
          <Button
            variant="outline"
            className="min-h-10"
            disabled={busy}
            onClick={() => setStatus.mutate({ status: "draft" })}
          >
            Back to draft
          </Button>
        ) : null}
        {ws.canManage && status === "in_review" ? (
          <Button
            className="min-h-10"
            disabled={busy || (needsFile && !o.sha256)}
            onClick={() => setStatus.mutate({ status: "approved" })}
          >
            Approve
          </Button>
        ) : null}
        {ws.canManage && status === "approved" ? (
          <Button
            className="min-h-10"
            disabled={busy}
            onClick={() => setStatus.mutate({ status: "delivered" })}
          >
            Mark delivered
          </Button>
        ) : null}
        {ws.canManage && status === "delivered" ? (
          <Button
            variant="outline"
            className="min-h-10"
            disabled={busy}
            title={
              ws.client?.portal_enabled
                ? undefined
                : "The client portal is off; this only takes effect when it is on"
            }
            onClick={() => setStatus.mutate({ shared_with_client: !o.shared_with_client })}
          >
            {o.shared_with_client ? "Stop sharing" : "Share with client"}
          </Button>
        ) : null}
        {ws.canManage && status !== "withdrawn" ? (
          <Button
            variant="ghost"
            className="text-failed-foreground min-h-10"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Withdraw this output? It cannot be reinstated.")) {
                setStatus.mutate({ status: "withdrawn" });
              }
            }}
          >
            Withdraw
          </Button>
        ) : null}
      </div>
    </article>
  );
}
