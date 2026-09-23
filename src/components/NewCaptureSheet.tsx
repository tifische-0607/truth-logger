import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

const HANDLER_KEY = "fbem.handler";

type Options = {
  max_comments: number;
  live_comment_limit: number;
  include_replies: boolean;
  live_screenshots: boolean;
  rendered_sheets: boolean;
  archive: boolean;
  translate: boolean;
  download_media: boolean;
  recapture: boolean;
};

const defaultOptions: Options = {
  max_comments: 500,
  live_comment_limit: 100,
  include_replies: true,
  live_screenshots: true,
  rendered_sheets: true,
  archive: true,
  translate: true,
  download_media: true,
  recapture: false,
};

const toggles: { key: keyof Options; label: string; hint: string }[] = [
  { key: "include_replies", label: "Include replies", hint: "Capture nested replies to comments" },
  {
    key: "live_screenshots",
    label: "Live screenshots",
    hint: "Real platform screenshots for the first comments",
  },
  { key: "rendered_sheets", label: "Rendered sheets", hint: "PDF sheets built from API data" },
  { key: "archive", label: "Archive copy", hint: "Save a raw archive of the page" },
  { key: "translate", label: "Translate to English", hint: "With a translator statement" },
  { key: "download_media", label: "Download media", hint: "Images and video attached to posts" },
  { key: "recapture", label: "Re-capture", hint: "Force a new capture of an existing item" },
];

export function NewCaptureSheet({
  open,
  onOpenChange,
  initialUrl = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [url, setUrl] = useState(initialUrl);
  const [handler, setHandler] = useState("");
  const [caseId, setCaseId] = useState("");
  const [newCase, setNewCase] = useState(false);
  const [caseTarget, setCaseTarget] = useState("");
  const [caseOffence, setCaseOffence] = useState("");
  const [caseAgency, setCaseAgency] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [newIncident, setNewIncident] = useState(false);
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [incidentSummary, setIncidentSummary] = useState("");
  const [options, setOptions] = useState<Options>(defaultOptions);

  useEffect(() => {
    if (open) setUrl(initialUrl);
  }, [open, initialUrl]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(HANDLER_KEY) : null;
    if (stored) setHandler(stored);
  }, []);

  const cases = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, status")
        .order("opened_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const incidents = useQuery({
    queryKey: ["incidents", caseId],
    enabled: Boolean(caseId) && !newCase,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("id, incident_id, summary, start_date")
        .eq("case_id", caseId)
        .order("incident_id");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (cases.data && cases.data.length === 0) setNewCase(true);
  }, [cases.data]);

  useEffect(() => {
    if (!newCase && caseId && incidents.data && incidents.data.length === 0) setNewIncident(true);
  }, [newCase, caseId, incidents.data]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!url.trim()) throw new Error("A Facebook URL is required");
      if (!caseId.trim()) throw new Error("A case reference is required");
      if (!incidentId.trim()) throw new Error("An incident number is required");

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("capture_jobs")
        .insert({
          url: url.trim(),
          case_id: caseId.trim(),
          incident_id: incidentId.trim(),
          incident_date: incidentDate || null,
          handler: handler.trim() || null,
          options,
          case_meta: newCase
            ? {
                target_of_complaint: caseTarget,
                offence_alleged: caseOffence,
                jurisdiction_agency: caseAgency,
                lead_handler: handler,
              }
            : {},
          incident_meta: newIncident
            ? { start_date: incidentDate, summary: incidentSummary }
            : {},
          created_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (newCase) {
        await supabase.from("cases").upsert(
          {
            id: caseId.trim(),
            target_of_complaint: caseTarget || null,
            offence_alleged: caseOffence || null,
            jurisdiction_agency: caseAgency || null,
            lead_handler: handler || null,
          },
          { onConflict: "id" },
        );
      }
      if (newIncident) {
        await supabase.from("incidents").upsert(
          {
            case_id: caseId.trim(),
            incident_id: incidentId.trim(),
            start_date: incidentDate || null,
            summary: incidentSummary || null,
          },
          { onConflict: "case_id,incident_id" },
        );
      }

      localStorage.setItem(HANDLER_KEY, handler);
      return data.id as string;
    },
    onSuccess: (jobId) => {
      void queryClient.invalidateQueries();
      onOpenChange(false);
      toast.success("Capture queued");
      void navigate({ to: "/jobs/$jobId", params: { jobId } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not queue"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="text-xl">New capture</SheetTitle>
          <SheetDescription>
            Queue a Facebook URL for the Mac mini worker to capture as evidence.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-5 pb-8">
          <div className="space-y-2">
            <Label htmlFor="url">Facebook URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.facebook.com/…"
              className="h-12 text-base"
              inputMode="url"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="handler">Handler</Label>
            <Input
              id="handler"
              value={handler}
              onChange={(e) => setHandler(e.target.value)}
              placeholder="Your name"
              className="h-12 text-base"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base">Case</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewCase((v) => !v);
                  setCaseId("");
                }}
              >
                {newCase ? "Pick existing" : "Create new"}
              </Button>
            </div>

            {newCase ? (
              <div className="space-y-3">
                <Input
                  value={caseId}
                  onChange={(e) => setCaseId(e.target.value)}
                  placeholder="Case reference, e.g. 2026-014"
                  className="h-12 text-base"
                />
                <Input
                  value={caseTarget}
                  onChange={(e) => setCaseTarget(e.target.value)}
                  placeholder="Target of complaint"
                  className="h-12 text-base"
                />
                <Input
                  value={caseOffence}
                  onChange={(e) => setCaseOffence(e.target.value)}
                  placeholder="Offence alleged, e.g. CMA 1998 s.233"
                  className="h-12 text-base"
                />
                <Input
                  value={caseAgency}
                  onChange={(e) => setCaseAgency(e.target.value)}
                  placeholder="Jurisdiction / agency, e.g. PDRM, MCMC"
                  className="h-12 text-base"
                />
              </div>
            ) : (
              <div className="grid gap-2">
                {cases.data?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCaseId(c.id);
                      setIncidentId("");
                      setNewIncident(false);
                    }}
                    className={`flex min-h-14 items-center justify-between rounded-lg border px-4 text-left text-sm transition-colors ${
                      caseId === c.id ? "border-primary bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    <span className="font-mono font-semibold">{c.id}</span>
                    <span className="text-muted-foreground truncate pl-3">
                      {c.target_of_complaint ?? "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {caseId ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Incident</Label>
                {!newCase ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setNewIncident((v) => !v);
                      setIncidentId("");
                    }}
                  >
                    {newIncident ? "Pick existing" : "Create new"}
                  </Button>
                ) : null}
              </div>

              {newIncident || newCase ? (
                <div className="space-y-3">
                  <Input
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    placeholder="Incident number, e.g. 03"
                    className="h-12 text-base"
                  />
                  <Input
                    type="date"
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    className="h-12 text-base"
                  />
                  <Textarea
                    value={incidentSummary}
                    onChange={(e) => setIncidentSummary(e.target.value)}
                    placeholder="Short summary of the incident"
                    rows={3}
                  />
                </div>
              ) : (
                <div className="grid gap-2">
                  {incidents.data?.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => {
                        setIncidentId(i.incident_id);
                        if (i.start_date) setIncidentDate(i.start_date);
                      }}
                      className={`flex min-h-14 items-center justify-between rounded-lg border px-4 text-left text-sm transition-colors ${
                        incidentId === i.incident_id
                          ? "border-primary bg-accent"
                          : "hover:bg-muted"
                      }`}
                    >
                      <span className="font-mono font-semibold">INC-{i.incident_id}</span>
                      <span className="text-muted-foreground truncate pl-3">
                        {i.summary ?? "—"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <Separator />

          <div className="space-y-4">
            <Label className="text-base">Options</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxc" className="text-muted-foreground text-xs">
                  Max comments
                </Label>
                <Input
                  id="maxc"
                  type="number"
                  min={1}
                  value={options.max_comments}
                  onChange={(e) =>
                    setOptions({ ...options, max_comments: Number(e.target.value) || 0 })
                  }
                  className="h-12 text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="livec" className="text-muted-foreground text-xs">
                  Live screenshots for first
                </Label>
                <Input
                  id="livec"
                  type="number"
                  min={0}
                  value={options.live_comment_limit}
                  onChange={(e) =>
                    setOptions({ ...options, live_comment_limit: Number(e.target.value) || 0 })
                  }
                  className="h-12 text-base"
                />
              </div>
            </div>

            <div className="divide-border divide-y rounded-xl border">
              {toggles.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-muted-foreground text-xs">{t.hint}</div>
                  </div>
                  <Switch
                    checked={Boolean(options[t.key])}
                    onCheckedChange={(v) => setOptions({ ...options, [t.key]: v })}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button
            className="h-14 w-full text-base"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? "Queueing…" : "Queue capture"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
