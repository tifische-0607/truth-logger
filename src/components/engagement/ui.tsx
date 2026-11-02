import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Workspace } from "@/lib/projects";
import { cn } from "@/lib/utils";

/** Run a database write; on refusal show the database's own message, which names what is missing. */
export function useDbAction<V = void>(
  ws: Workspace,
  fn: (v: V) => Promise<unknown>,
  done?: string,
  after?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", ws.project.id] });
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
      if (done) toast.success(done);
      after?.();
    },
    onError: (e) => {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: unknown }).message)
            : "Could not save";
      toast.error(msg, { duration: 14000 });
    },
  });
}

export function Section({
  id,
  title,
  hint,
  children,
  actions,
}: {
  id: string;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden" aria-labelledby={id}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          {hint ? <p className="text-muted-foreground mt-1 max-w-3xl text-xs">{hint}</p> : null}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Locked({ children }: { children: ReactNode }) {
  return (
    <p className="bg-muted text-muted-foreground rounded-lg px-4 py-3 text-sm" role="note">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function TextIn({
  label,
  value,
  onChange,
  hint,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint ?? ""} className={className ?? ""}>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </Field>
  );
}

export function AreaIn({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint ?? ""} className={className ?? ""}>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </Field>
  );
}

export function Submit({
  pending,
  disabled,
  children,
  onClick,
  variant,
}: {
  pending: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
  variant?: "default" | "outline";
}) {
  return (
    <Button
      variant={variant ?? "default"}
      className="min-h-11"
      disabled={pending || disabled}
      onClick={onClick}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null} {children}
    </Button>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: string | undefined }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone ?? "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

export const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "bg-failed text-failed-foreground",
  HIGH: "bg-failed/70 text-failed-foreground",
  MEDIUM: "bg-warn text-warn-foreground",
  LOW: "bg-muted text-foreground",
};

export const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
export const csvList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
