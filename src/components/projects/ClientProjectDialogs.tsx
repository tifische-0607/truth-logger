import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Client } from "@/lib/projects";

const toCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function NewClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [sector, setSector] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setCode("");
      setCodeTouched(false);
      setSector("");
      setContact("");
      setEmail("");
    }
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: name.trim(),
          code: code.trim(),
          sector: sector.trim() || null,
          contact_name: contact.trim() || null,
          contact_email: email.trim() || null,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
      toast.success("Client added");
      onOpenChange(false);
      void navigate({ to: "/clients/$clientId", params: { clientId: id } });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && /duplicate/.test(e.message)
          ? "That client code is already used"
          : e instanceof Error
            ? e.message
            : "Could not add the client",
      ),
  });

  const codeOk = /^[A-Z0-9][A-Z0-9-]{1,23}$/.test(code);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            A client holds projects. Only the owner can add or edit clients.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!codeTouched) setCode(toCode(e.target.value).slice(0, 12));
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-code">Code</Label>
            <Input
              id="c-code"
              className="font-mono"
              value={code}
              aria-invalid={!!code && !codeOk}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(toCode(e.target.value));
              }}
            />
            <p className="text-muted-foreground text-xs">
              Capitals, digits and dashes. Used in project codes and file names.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-sector">Sector</Label>
            <Input id="c-sector" value={sector} onChange={(e) => setSector(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="c-contact">Contact</Label>
              <Input id="c-contact" value={contact} onChange={(e) => setContact(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-email">Contact email</Label>
              <Input
                id="c-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !codeOk || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Add client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewProjectDialog({
  open,
  onOpenChange,
  clients,
  defaultClientId,
  existingCodes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
  defaultClientId?: string | undefined;
  existingCodes: string[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [due, setDue] = useState("");
  const [summary, setSummary] = useState("");

  const suggest = (cid: string) => {
    const c = clients.find((x) => x.id === cid);
    if (!c) return "";
    const year = new Date().getFullYear();
    let n = 1;
    while (existingCodes.includes(`${c.code}-${year}-${String(n).padStart(2, "0")}`)) n++;
    return `${c.code}-${year}-${String(n).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (open) {
      const cid = defaultClientId ?? (clients.length === 1 ? clients[0]!.id : "");
      setClientId(cid);
      setCode(suggest(cid));
      setName("");
      setDue("");
      setSummary("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          client_id: clientId,
          code: code.trim(),
          name: name.trim(),
          summary: summary.trim() || null,
          due_on: due || null,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
      void qc.invalidateQueries({ queryKey: ["workable-projects"] });
      toast.success("Project created — write its brief next");
      onOpenChange(false);
      void navigate({
        to: "/projects/$projectId",
        params: { projectId: id },
        search: { tab: "brief" },
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && /duplicate/.test(e.message)
          ? "That project code is already used"
          : e instanceof Error
            ? e.message
            : "Could not create the project",
      ),
  });

  const codeOk = /^[A-Z0-9][A-Z0-9-]{1,31}$/.test(code);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            You become its lead. Next you write the brief and criteria, then link evidence.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Client</Label>
            <Select
              value={clientId}
              onValueChange={(v) => {
                setClientId(v);
                setCode(suggest(v));
              }}
            >
              <SelectTrigger aria-label="Client">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.code}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-name">Project name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="p-code">Code</Label>
              <Input
                id="p-code"
                className="font-mono"
                value={code}
                aria-invalid={!!code && !codeOk}
                onChange={(e) => setCode(toCode(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-due">Due</Label>
              <Input id="p-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-summary">Summary</Label>
            <Textarea
              id="p-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One or two lines on what the client asked for."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!clientId || !name.trim() || !codeOk || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
