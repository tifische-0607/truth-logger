import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDarkNightRecord, logHomeVaultEvent, useDarkNight } from "@/lib/darknight";
import { currentHandler, type RefFile } from "@/lib/sources";

/**
 * Links a home-vault record to a case. Only a reference is written to the hub:
 * the record id, index metadata and the SHA-256 of each file as the gateway sees it now.
 */
export function LinkToCaseDialog({
  open,
  onOpenChange,
  sourceId,
  recordId,
  defaultCaseId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  recordId: string | null;
  defaultCaseId?: string;
  onLinked?: (refId: string) => void;
}) {
  const queryClient = useQueryClient();
  const dn = useDarkNight();
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [incidentUuid, setIncidentUuid] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setCaseId(defaultCaseId ?? "");
      setIncidentUuid("");
      setNote("");
    }
  }, [open, defaultCaseId]);

  const record = useQuery({
    queryKey: ["darknight-record", dn.base, recordId],
    enabled: open && !!recordId && !!dn.base,
    queryFn: () => getDarkNightRecord(dn.base!, recordId!),
  });

  const cases = useQuery({
    queryKey: ["cases", "linkable"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, status")
        .neq("status", "closed")
        .order("opened_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const incidents = useQuery({
    queryKey: ["incidents", caseId],
    enabled: open && !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("id, incident_id, start_date, summary")
        .eq("case_id", caseId)
        .order("incident_id");
      if (error) throw error;
      return data;
    },
  });

  const link = useMutation({
    mutationFn: async () => {
      const r = record.data;
      if (!r) throw new Error("The record hasn't loaded from DarkNight yet.");
      if (!caseId) throw new Error("Choose a case.");
      const missing = r.files.filter((f) => !f.available);
      const files: RefFile[] = r.files
        .filter((f) => f.available)
        .map((f) => ({
          file_id: f.file_id,
          filename: f.filename,
          kind: f.kind,
          size_bytes: f.size_bytes,
          sha256: f.sha256,
        }));
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("evidence_refs")
        .insert({
          case_id: caseId,
          incident_id: incidentUuid || null,
          source_id: sourceId,
          record_id: r.record_id,
          record_code: r.record_code,
          platform: r.platform,
          item_type: r.item_type,
          published_at: r.published_at,
          files,
          note: note.trim() || null,
          linked_by_name:
            currentHandler() !== "unknown" ? currentHandler() : (auth.user?.email ?? null),
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("This record is already linked to that case.");
        throw error;
      }
      await logHomeVaultEvent({
        evidenceRefId: data.id,
        action: "linked",
        notes: `Linked ${r.record_code} with ${files.length} file hash${files.length === 1 ? "" : "es"}${
          missing.length ? `; ${missing.length} file(s) missing on the NAS at linking` : ""
        }. Content stays in the home vault.`,
      });
      return data.id;
    },
    onSuccess: (refId) => {
      toast.success(`Linked to CASE-${caseId}`);
      void queryClient.invalidateQueries({ queryKey: ["evidence-refs"] });
      void queryClient.invalidateQueries({ queryKey: ["evidence-refs-count", caseId] });
      void queryClient.invalidateQueries({ queryKey: ["search-refs"] });
      onOpenChange(false);
      onLinked?.(refId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't link the record"),
  });

  const r = record.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to a case</DialogTitle>
          <DialogDescription>
            The case keeps a reference and the SHA-256 of each file. The content stays in the home
            vault.
          </DialogDescription>
        </DialogHeader>

        {record.isLoading ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Loading the record from DarkNight…
          </p>
        ) : record.error ? (
          <p className="text-failed-foreground text-sm">
            {record.error instanceof Error ? record.error.message : "DarkNight didn't answer."}
          </p>
        ) : r ? (
          <div className="bg-muted rounded-lg p-3 text-sm">
            <div className="font-mono font-semibold">{r.record_code}</div>
            <div className="text-muted-foreground">
              {r.files.filter((f) => f.available).length} of {r.files.length} files available to
              fingerprint
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-case">Case</Label>
            <select
              id="link-case"
              value={caseId}
              onChange={(e) => {
                setCaseId(e.target.value);
                setIncidentUuid("");
              }}
              className="border-input bg-background h-12 w-full rounded-md border px-3 text-base"
            >
              <option value="">Choose a case…</option>
              {(cases.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  CASE-{c.id}
                  {c.target_of_complaint ? ` · ${c.target_of_complaint}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-incident">Incident (optional)</Label>
            <select
              id="link-incident"
              value={incidentUuid}
              disabled={!caseId}
              onChange={(e) => setIncidentUuid(e.target.value)}
              className="border-input bg-background h-12 w-full rounded-md border px-3 text-base disabled:opacity-60"
            >
              <option value="">No incident</option>
              {(incidents.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  INC-{i.incident_id}
                  {i.start_date ? ` · ${i.start_date}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-note">Case note (optional)</Label>
            <Textarea
              id="link-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this belongs in the case. Stored in the cloud, so describe; don't quote."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!r || !caseId || link.isPending} onClick={() => link.mutate()}>
            {link.isPending ? "Linking…" : "Link to case"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
