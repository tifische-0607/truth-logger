import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  CloudDownload,
  FolderClosed,
  Gauge,
  LayoutTemplate,
  ListPlus,
  Loader2,
  ScrollText,
  SlidersHorizontal,
  LogOut,
  PackageCheck,
  Radio,
  Settings,
  ShieldCheck,
  Server,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { OfflineBanner } from "@/components/OfflineBanner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge },
  { to: "/cases", label: "Cases", icon: FolderClosed },
  { to: "/verify", label: "Verify", icon: ShieldCheck },
  { to: "/offline", label: "Offline", icon: CloudDownload },
  { to: "/export", label: "Export", icon: PackageCheck },
  { to: "/queue", label: "Queue", icon: ListPlus },
  { to: "/worker", label: "Worker", icon: Server },
  { to: "/capture-log", label: "Capture log", icon: ScrollText },
  { to: "/capture-settings", label: "Capture setup", icon: SlidersHorizontal },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/team", label: "Team", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function useWorkerStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["worker-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_status")
        .select("*")
        .eq("id", "worker")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`worker-status-feed-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "worker_status" },
        () => void queryClient.invalidateQueries({ queryKey: ["worker-status"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const lastSeen = query.data?.last_seen ?? null;
  const online = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 120_000 : false;
  return { lastSeen, online, ...query };
}

export function WorkerPill({ compact = false }: { compact?: boolean }) {
  const { lastSeen, online } = useWorkerStatus();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          "size-2.5 rounded-full",
          online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground",
        )}
      />
      <span className="font-medium">{online ? "Worker online" : "Worker offline"}</span>
      {!compact && <span className="opacity-70">· seen {timeAgo(lastSeen)}</span>}
    </div>
  );
}

function useActiveJobs() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["active-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_jobs")
        .select("id, status, url, created_at")
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`active-jobs-feed-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "capture_jobs" },
        () => void queryClient.invalidateQueries({ queryKey: ["active-jobs"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function WorkerStatusCard() {
  const { lastSeen, online, data } = useWorkerStatus();
  const jobs = useActiveJobs();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const running = (jobs.data ?? []).filter((j) => j.status === "running");
  const queued = (jobs.data ?? []).filter((j) => j.status === "queued");
  const hostname = (data as { hostname?: string } | null)?.hostname;

  return (
    <div className="bg-sidebar-accent/40 border-sidebar-border space-y-2.5 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground",
          )}
        />
        <span className="text-xs font-semibold">
          {online ? "Friday Analytics online" : "Friday Analytics offline"}
        </span>
        <Radio className="text-sidebar-foreground/50 ml-auto size-3.5" />
      </div>
      <div className="text-sidebar-foreground/60 space-y-0.5 text-[11px] leading-snug">
        <div>FridayA · seen {timeAgo(lastSeen)}</div>
        {hostname ? <div className="truncate">{hostname}</div> : null}
      </div>
      <div className="text-sidebar-foreground/70 space-y-1 text-[11px]">
        {running.map((j) => (
          <Link
            key={j.id}
            to="/jobs/$jobId"
            params={{ jobId: j.id }}
            className="hover:bg-sidebar-accent flex items-center gap-1.5 rounded-md px-1.5 py-1"
          >
            <Loader2 className="text-running-foreground size-3 animate-spin" />
            <span className="truncate">Capturing… {shortUrl(j.url)}</span>
          </Link>
        ))}
        {queued.length > 0 ? (
          <div className="px-1.5 py-0.5">
            {queued.length} job{queued.length === 1 ? "" : "s"} queued
          </div>
        ) : null}
        {running.length === 0 && queued.length === 0 ? (
          <div className="text-sidebar-foreground/50 px-1.5 py-0.5">No active captures</div>
        ) : null}
      </div>
    </div>
  );
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "").split("/").pop() || u.hostname;
  } catch {
    return url;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground safe-top safe-bottom sticky top-0 hidden h-screen w-64 shrink-0 flex-col p-5 md:flex">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/favicon.png" alt="" width={36} height={36} className="rounded-lg" />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">FB Evidence</div>
            <div className="text-sidebar-foreground/60 text-xs">Monitor</div>
          </div>
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground",
              }}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
        </nav>

        <div className="border-sidebar-border space-y-3 border-t pt-4">
          <WorkerStatusCard />
          <button
            onClick={signOut}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-sidebar text-sidebar-foreground safe-top flex items-center justify-between px-4 py-3 md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm font-bold">
            <img src="/favicon.png" alt="" width={28} height={28} className="rounded-md" />
            FB Evidence
          </Link>
          <WorkerPill compact />
        </header>

        <OfflineBanner />

        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">{children}</main>

        <nav className="bg-sidebar text-sidebar-foreground safe-bottom fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/10 md:hidden">
          {nav.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="text-sidebar-foreground/70 flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium"
              activeProps={{ className: "text-sidebar-primary" }}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}
