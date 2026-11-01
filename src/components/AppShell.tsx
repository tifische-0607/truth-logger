import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Camera,
  Database,
  FolderClosed,
  House,
  ListPlus,
  Loader2,
  LogOut,
  Plus,
  Radio,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { OfflineBanner } from "@/components/OfflineBanner";
import { NewCaptureSheet } from "@/components/NewCaptureSheet";
import { CaseWorkspaceHeader, caseIdFromPath } from "@/components/CaseWorkspaceHeader";
import { SectionTabs, sectionForPath, type SectionId } from "@/components/SectionTabs";
import { SourceStatusPanel } from "@/components/SourceStatusPanel";

/** Five workspaces, then Sources and Admin. Each entry owns a section of paths. */
const workspaces = [
  { to: "/dashboard", label: "Home", icon: House, section: "home" },
  { to: "/search", label: "Search", icon: Search, section: "search" },
  { to: "/cases", label: "Cases", icon: FolderClosed, section: "cases" },
  { to: "/collect", label: "Collect", icon: Camera, section: "collect" },
  { to: "/verify", label: "Integrity", icon: ShieldCheck, section: "integrity" },
] as const;

const system = [
  { to: "/sources", label: "Sources", icon: Database, section: "sources" },
  { to: "/team", label: "Admin", icon: SlidersHorizontal, section: "admin" },
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
          {online ? "Friday Analytics FB  online" : "Friday Analytics offline"}
        </span>
        <Radio className="text-sidebar-foreground/50 ml-auto size-3.5" />
      </div>
      <div className="text-sidebar-foreground/60 space-y-0.5 text-[11px] leading-snug">
        <div>Mac mini · seen {timeAgo(lastSeen)}</div>
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

/** Running and queued captures, under the source status in the sidebar. */
function ActiveCaptures() {
  const jobs = useActiveJobs();
  const running = (jobs.data ?? []).filter((j) => j.status === "running");
  const queued = (jobs.data ?? []).filter((j) => j.status === "queued");
  if (!running.length && !queued.length) return null;
  return (
    <div className="text-sidebar-foreground/75 space-y-1 text-[11px]">
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
      {queued.length ? (
        <Link to="/collect" className="hover:bg-sidebar-accent block rounded-md px-1.5 py-1">
          {queued.length} capture{queued.length === 1 ? "" : "s"} queued
        </Link>
      ) : null}
    </div>
  );
}

function WorkerOfflineBanner() {
  const { online, isLoading } = useWorkerStatus();
  const [dismissed, setDismissed] = useState(false);
  if (isLoading || online || dismissed) return null;

  return (
    <div className="bg-failed text-failed-foreground safe-top px-4 py-2.5 text-sm">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <Server className="size-4 shrink-0" />
        <p className="min-w-0 flex-1 leading-snug">
          The Mac mini worker isn't checking in. Captures will wait until it starts — on the Mac
          mini, run <code className="font-mono text-xs">sudo bash worker/install-system.sh</code> so
          it starts at boot, even before login.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold underline underline-offset-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");

  // Home Screen shortcut / shared link: /dashboard?capture=1&url=…
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("capture") === null) return;
    setCaptureUrl(params.get("url") ?? "");
    setCaptureOpen(true);
    params.delete("capture");
    params.delete("url");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const section = sectionForPath(pathname);
  const caseId = caseIdFromPath(pathname);
  const sectionTabs: SectionId | null =
    section === "collect" || section === "integrity" || section === "admin" ? section : null;
  const openCapture = () => {
    setCaptureUrl("");
    setCaptureOpen(true);
  };

  const navClass = (active: boolean) =>
    cn(
      "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    );

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground safe-top safe-bottom sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-5 overflow-y-auto p-5 md:flex">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/favicon.png" alt="" width={36} height={36} className="rounded-lg" />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">Evidence Hub</div>
            <div className="text-sidebar-foreground/60 text-xs">FridayAnalytics</div>
          </div>
        </Link>

        <button
          type="button"
          onClick={openCapture}
          className="bg-sidebar-primary text-sidebar-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
        >
          <Plus className="size-5" /> New capture
        </button>

        <nav aria-label="Main" className="flex flex-col gap-1">
          {workspaces.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              aria-current={section === entry.section ? "page" : undefined}
              className={navClass(section === entry.section)}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
        </nav>

        <nav aria-label="System" className="flex flex-col gap-1">
          <div className="text-sidebar-foreground/55 px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            System
          </div>
          {system.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              aria-current={section === entry.section ? "page" : undefined}
              className={navClass(section === entry.section)}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <SourceStatusPanel />
          <ActiveCaptures />
          <button
            onClick={signOut}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-sidebar text-sidebar-foreground safe-top flex items-center justify-between gap-3 px-4 py-3 md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm font-bold">
            <img src="/favicon.png" alt="" width={28} height={28} className="rounded-md" />
            Evidence Hub
          </Link>
          <div className="flex items-center gap-3">
            <WorkerPill compact />
            <Link
              to="/sources"
              aria-label="Sources"
              className="flex size-11 items-center justify-center rounded-lg"
            >
              <Database className="size-5" />
            </Link>
          </div>
        </header>

        <OfflineBanner />
        <WorkerOfflineBanner />

        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
          {caseId ? <CaseWorkspaceHeader caseId={caseId} pathname={pathname} /> : null}
          {sectionTabs ? <SectionTabs section={sectionTabs} /> : null}
          {children}
        </main>

        <button
          type="button"
          onClick={openCapture}
          aria-label="New capture"
          className="bg-primary text-primary-foreground safe-bottom fixed right-5 bottom-24 z-50 flex min-h-14 items-center gap-2 rounded-full px-5 text-base font-semibold shadow-lg transition-transform active:scale-95 md:hidden"
        >
          <ListPlus className="size-5" />
          New capture
        </button>

        <NewCaptureSheet open={captureOpen} onOpenChange={setCaptureOpen} initialUrl={captureUrl} />

        <nav
          aria-label="Main"
          className="bg-sidebar text-sidebar-foreground safe-bottom fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/10 md:hidden"
        >
          {workspaces.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              aria-current={section === entry.section ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                section === entry.section ? "text-sidebar-primary" : "text-sidebar-foreground/70",
              )}
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
