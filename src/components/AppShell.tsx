import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Briefcase,
  CloudDownload,
  FolderClosed,
  Gauge,
  Images,
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
  Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { OfflineBanner } from "@/components/OfflineBanner";
import { NewCaptureSheet } from "@/components/NewCaptureSheet";
import { SourceStatus } from '@/components/SourceStatus';
import { CaseWorkspace, CASE_TABS } from '@/components/CaseWorkspace';
import { HomeReferences } from '@/components/HomeReferences';
import { Button } from '@/components/ui/button';

const nav = [
  { to: "/dashboard", label: "Home", icon: Gauge },
  { to: "/projects", label: "Projects", icon: Briefcase },
  { to: "/search", label: "Search", icon: Search },
  { to: "/cases", label: "Cases", icon: FolderClosed },
  { to: "/collect", label: "Collect", icon: ListPlus },
  { to: "/integrity", label: "Integrity", icon: ShieldCheck },
] as const;
const collectTabs = [['/collect','Now'],['/queue','All jobs'],['/watchlist','Watched pages'],['/results','Results'],['/capture-log','Capture log'],['/worker','Worker'],['/capture-settings','Capture setup']] as const;
const integrityTabs = [['/verify','Verify'],['/export','Export bundle'],['/offline','Offline library']] as const;
const adminTabs = [['/team','Team'],['/templates','Case templates'],['/settings','Settings']] as const;

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
          mini, run <code className="font-mono text-xs">sudo bash worker/install-system.sh</code>{" "}
          so it starts at boot, even before login.
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
  const { pathname } = useLocation();
  const caseMatch = /^\/(cases|trail|timeline|profiles|comments|transcripts|custody|report|dossier|summary)\/([^/]+)$/.exec(pathname);
  const caseId = caseMatch?.[2];
  const workspaceTabs = collectTabs.some(([to]) => pathname === to) ? collectTabs : integrityTabs.some(([to]) => pathname === to) || pathname === '/integrity' ? integrityTabs : adminTabs.some(([to]) => pathname === to) ? adminTabs : pathname === '/cases' || pathname === '/case-database' ? [['/cases','Cases'],['/case-database','Case database']] as const : [];
  const activeWorkspace = caseId || pathname === '/case-database' ? '/cases' : collectTabs.some(([to])=>pathname===to) || pathname.startsWith('/jobs/') ? '/collect' : integrityTabs.some(([to])=>pathname===to) ? '/integrity' : pathname.startsWith('/projects') || pathname.startsWith('/clients/') ? '/projects' : pathname;
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

  return (
    <div className="bg-background flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground safe-top safe-bottom sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto p-5 md:flex">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src="/favicon.png" alt="" width={36} height={36} className="rounded-lg" />
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-tight">FA Portal</div>
            <div className="text-sidebar-foreground/60 text-xs">FridayAnalytics</div>
          </div>
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className={cn("hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors", activeWorkspace===entry.to && 'bg-sidebar-accent text-sidebar-accent-foreground')}
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground",
              }}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
          <p className="mt-5 px-3 text-xs text-sidebar-foreground/60">System</p>
          <Link to="/sources" className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm hover:bg-sidebar-accent"><Server className="size-5"/>Sources</Link>
          <Link to="/team" className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm hover:bg-sidebar-accent"><Users className="size-5"/>Admin</Link>
        </nav>

        <div className="border-sidebar-border space-y-3 border-t pt-4">
          <SourceStatus />
          <WorkerStatusCard />
          <Button variant="ghost"
            onClick={signOut}
            className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors"
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-sidebar text-sidebar-foreground safe-top flex items-center justify-between px-4 py-3 md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm font-bold">
            <img src="/favicon.png" alt="" width={28} height={28} className="rounded-md" />
            FA Portal
          </Link>
          <WorkerPill compact />
        </header>

        <OfflineBanner />
        <WorkerOfflineBanner />


        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
          <div className="md:hidden no-print mb-4 flex gap-3 text-sm"><Link to="/sources" className="inline-flex min-h-11 items-center border rounded px-3">Sources</Link><Link to="/team" className="inline-flex min-h-11 items-center border rounded px-3">Admin</Link></div>
          {workspaceTabs.length>0 && <nav aria-label="Workspace pages" className="no-print mb-6 relative flex overflow-x-auto border-b">{workspaceTabs.map(([to,label])=><Link key={to} to={to} className={cn('shrink-0 min-h-12 px-4 py-3 border-b-2 text-sm',pathname===to?'border-primary text-primary font-semibold':'border-transparent text-muted-foreground')}>{label}</Link>)}</nav>}
          {caseId && <CaseWorkspace caseId={caseId} path={pathname}/>}
          {children}
          {caseId && pathname.startsWith('/trail/') && <HomeReferences caseId={caseId}/>}
        </main>

        <Button
          type="button"
          onClick={() => {
            setCaptureUrl("");
            setCaptureOpen(true);
          }}
          aria-label="New capture"
          className="bg-primary text-primary-foreground safe-bottom fixed right-5 bottom-24 z-50 flex min-h-14 items-center gap-2 rounded-full px-5 text-base font-semibold shadow-lg transition-transform active:scale-95 md:bottom-8"
        >
          <ListPlus className="size-5" />
          New capture
        </Button>

        <NewCaptureSheet
          open={captureOpen}
          onOpenChange={setCaptureOpen}
          initialUrl={captureUrl}
        />

        <nav className="bg-sidebar text-sidebar-foreground safe-bottom fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-sidebar-border md:hidden">
          {nav.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className={cn("text-sidebar-foreground/70 flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium",activeWorkspace===entry.to && 'text-sidebar-primary')}
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
