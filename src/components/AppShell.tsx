import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  Briefcase,
  Building2,
  CloudDownload,
  FolderClosed,
  Gauge,
  Library,
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
  Microscope,
  BookOpen,
  Receipt,
  Siren,
  Network,
  MessagesSquare,
  ScanSearch,
  Plug,
  Bot,
  UserRound,
  UserCog,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import { OfflineBanner } from "@/components/OfflineBanner";
import { NewCaptureSheet } from "@/components/NewCaptureSheet";
import { SidebarVaults } from '@/components/SidebarVaults';
import { CaseWorkspace, CASE_TABS } from '@/components/CaseWorkspace';
import { HomeReferences } from '@/components/HomeReferences';
import { Button } from '@/components/ui/button';
import { ThemeControl } from '@/components/ThemeControl';
import { useMe } from '@/lib/projects';
import { BaseStrip, Kicker, ProductLockup, COMPANY } from '@/components/BrandLogo';
import { DOCUMENT_FOOTER } from '@/lib/document-footer';
import { accessMenuQuery, canOpen } from '@/lib/access-levels';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ACTIVE = "relative bg-sidebar-accent text-sidebar-accent-foreground font-semibold before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary";
const nav_ = [
  { to: "/dashboard", label: "Home", icon: Gauge },
  { to: "/projects", label: "Projects", icon: Briefcase },
  { to: "/search", label: "Search", icon: Search },
  { to: "/cases", label: "Cases", icon: FolderClosed },
  { to: "/collect", label: "Collect", icon: ListPlus },
  { to: "/integrity", label: "Integrity", icon: ShieldCheck },
] as const;
const NAV_SCREEN: Record<string, string> = { '/dashboard': 'dashboard', '/projects': 'engagements', '/search': 'search', '/cases': 'cases', '/collect': 'collect', '/integrity': 'integrity' };
const BASE_OFFLINE = ['dashboard', 'engagements', 'search', 'cases', 'collect', 'integrity', 'library', 'account'];
/** Workspace links, shown only when the database menu includes their screen. */
const SIDE_LINKS = [
  { to: '/library', label: 'Library', icon: Library, screen: 'library' },
  { to: '/research', label: 'Research', icon: Microscope, screen: 'research' },
  { to: '/rejections', label: 'Rejection rates', icon: Microscope, screen: 'research' },
  { to: '/early-warning', label: 'Early warning', icon: Siren, screen: 'early_warning' },
  { to: '/links', label: 'Link analysis', icon: Network, screen: 'links' },
  { to: '/narratives', label: 'Narratives', icon: MessagesSquare, screen: 'narratives' },
  { to: '/evidence-search', label: 'Evidence search', icon: ScanSearch, screen: 'evidence_search' },
  { to: '/frameworks', label: 'Frameworks', icon: BookOpen, screen: 'frameworks' },
] as const;
const SYSTEM_LINKS = [
  { to: '/client-admin', label: 'Client administration', icon: Building2, screen: 'client_admin' },
  { to: '/inbox', label: 'Curator inbox', icon: ScrollText, screen: 'curator_inbox' },
  { to: '/management', label: 'Management', icon: Gauge, screen: 'management' },
  { to: '/billing', label: 'Billing and pricing', icon: Receipt, screen: 'billing' },
  { to: '/users-access', label: 'Users and access', icon: UserCog, screen: 'users_access' },
  { to: '/vaults', label: 'Vaults and evidence move', icon: Server, screen: 'vaults' },
  { to: '/connectors', label: 'Connectors', icon: Plug, screen: 'connectors' },
  { to: '/executive-agent', label: 'Executive agent access', icon: Bot, screen: 'executive_agent' },
  { to: '/team', label: 'Team and case assignment', icon: Users, screen: 'team' },
  { to: '/settings', label: 'Settings', icon: Settings, screen: 'settings' },
  { to: '/templates', label: 'Case templates', icon: LayoutTemplate, screen: 'templates' },
  { to: '/sources', label: 'Sources', icon: Server, screen: 'sources' },
  { to: '/portal', label: 'Client preview', icon: Users, screen: 'client_preview' },
  { to: '/account', label: 'Account', icon: UserRound, screen: 'account' },
] as const;
const collectTabs = [['/collect','Now'],['/queue','All jobs'],['/watchlist','Watched pages'],['/results','Results'],['/capture-log','Capture log'],['/worker','Worker'],['/capture-settings','Capture setup']] as const;
const integrityTabs = [['/verify','Verify'],['/export','Export bundle'],['/offline','Offline library']] as const;
const adminTabs = [['/team','Team'],['/templates','Case templates'],['/settings','Settings'],['/vaults','Vaults']] as const;


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
          online ? "bg-positive animate-pulse" : "bg-negative",
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
    <div className="bg-background space-y-2.5 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            online ? "bg-positive animate-pulse" : "bg-negative",
          )}
        />
        <span className="text-xs font-semibold">
           {online ? "Friday Analytics FB  online" : "Friday Analytics offline"}
        </span>
        <Radio className="text-muted-foreground ml-auto size-3.5" />
      </div>
      <div className="text-muted-foreground space-y-0.5 text-xs leading-snug">
        <div>FridayA · seen {timeAgo(lastSeen)}</div>
        {hostname ? <div className="truncate">{hostname}</div> : null}
      </div>
      <div className="text-foreground space-y-1 text-xs">
        {running.map((j) => (
          <Link
            key={j.id}
            to="/jobs/$jobId"
            params={{ jobId: j.id }}
            className="hover:bg-sidebar-accent flex items-center gap-1.5 rounded-md px-1.5 py-1"
          >
            <Loader2 className="text-caution size-3 animate-spin" />
            <span className="truncate">Capturing… {shortUrl(j.url)}</span>
          </Link>
        ))}
        {queued.length > 0 ? (
          <div className="px-1.5 py-0.5">
            {queued.length} job{queued.length === 1 ? "" : "s"} queued
          </div>
        ) : null}
        {running.length === 0 && queued.length === 0 ? (
          <div className="text-muted-foreground px-1.5 py-0.5">No active captures</div>
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
  const me = useMe();
  const access = useQuery({ ...accessMenuQuery, enabled: typeof navigator === 'undefined' || navigator.onLine });
  // Offline the menu cannot be checked; show the base workspace links only.
  const ok = (screen: string) => access.data ? canOpen(access.data, screen) : BASE_OFFLINE.includes(screen);
  const canCollect = me.data?.isInvestigator ?? false;

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
      <aside className="bg-sidebar text-sidebar-foreground safe-top safe-bottom sticky top-0 hidden h-[calc(100vh-4px)] w-72 shrink-0 flex-col overflow-y-auto p-5 md:flex">
        <Link to="/dashboard" className="flex items-center" aria-label="FA Portal home">
          <ProductLockup />
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {nav_.filter(e => ok(NAV_SCREEN[e.to] ?? 'dashboard')).map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className={cn("hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors", activeWorkspace===entry.to && ACTIVE)}
              
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
          {SIDE_LINKS.filter(l => ok(l.screen)).map(l => <Link key={l.to} to={l.to} className={cn("hover:bg-sidebar-accent text-sidebar-foreground flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium", pathname.startsWith(l.to) && ACTIVE)}><l.icon className="size-5"/>{l.label}</Link>)}
          <p className="kicker mt-5 px-3">{access.data?.level === 'superadmin' ? 'Administration' : 'System'}</p>
          {SYSTEM_LINKS.filter(l => ok(l.screen)).map(l => l.to === '/billing' ? <BillingLink key={l.to} label={l.label} /> : <Link key={l.to} to={l.to} className={cn("hover:bg-sidebar-accent flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm", pathname.startsWith(l.to) && ACTIVE)}><l.icon className="size-5"/>{l.label}</Link>)}
        </nav>

        <div className="border-sidebar-border space-y-3 border-t pt-4">
          <ThemeControl/>
          {ok("vaults") ? <SidebarVaults /> : null}
          <WorkerStatusCard />
          <UserMenu onSignOut={signOut} canUsers={ok("users_access")} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print bg-background border-b text-foreground safe-top flex items-center justify-between px-4 py-3 md:hidden">
          <Link to="/dashboard" className="flex items-center" aria-label="FA Portal home">
            <ProductLockup compact />
          </Link>
          <div className="flex items-center gap-2"><WorkerPill compact /><UserMenu onSignOut={signOut} canUsers={ok("users_access")} compact /></div>
        </header>

        <div className="no-print">
          <OfflineBanner />
          <WorkerOfflineBanner />
        </div>


        <main className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
          <div className="md:hidden no-print mb-4 flex flex-wrap gap-3 text-sm">{[...SIDE_LINKS, ...SYSTEM_LINKS].filter(l => ok(l.screen)).map(l => <Link key={l.to} to={l.to} className="chip bg-secondary text-secondary-foreground inline-flex min-h-11 items-center rounded-[10px] px-3">{l.label}</Link>)}</div>
          {workspaceTabs.length>0 && <nav aria-label="Workspace pages" className="no-print mb-6 relative flex overflow-x-auto border-b">{workspaceTabs.map(([to,label])=><Link key={to} to={to} className={cn('shrink-0 min-h-12 px-4 py-3 border-b-2 text-sm',pathname===to?'border-primary text-foreground font-semibold':'border-transparent text-muted-foreground')}>{label}</Link>)}</nav>}
          {caseId && <CaseWorkspace caseId={caseId} path={pathname}/>}
          {children}
          {caseId && pathname.startsWith('/trail/') && <HomeReferences caseId={caseId}/>}
        </main>
        <footer className="no-print text-muted-foreground border-t px-4 pt-4 pb-24 text-xs md:px-8 md:pb-6">
          <p>{DOCUMENT_FOOTER} · {COMPANY.name} · {COMPANY.reg} · {COMPANY.email}</p>
        </footer>
        <BaseStrip className="no-print sticky bottom-0 z-30 hidden md:block" />

        {canCollect && <Button
          type="button"
          onClick={() => {
            setCaptureUrl("");
            setCaptureOpen(true);
          }}
          aria-label="New capture"
          className="no-print bg-primary text-primary-foreground safe-bottom fixed right-5 bottom-24 z-50 flex min-h-14 items-center gap-2 rounded-full px-5 text-base font-semibold shadow-lg transition-transform active:scale-95 md:bottom-8"
        >
          <ListPlus className="size-5" />
          New capture
        </Button>}

        {canCollect && <NewCaptureSheet
          open={captureOpen}
          onOpenChange={setCaptureOpen}
          initialUrl={captureUrl}
        />}

        <nav className="bg-background text-foreground safe-bottom fixed inset-x-0 bottom-0 z-40 flex flex-col border-t md:hidden"><div className="flex justify-around">
          {nav_.filter(e => ok(NAV_SCREEN[e.to] ?? 'dashboard')).map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className={cn("text-muted-foreground flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",activeWorkspace===entry.to && 'text-foreground font-semibold underline decoration-primary decoration-2 underline-offset-4')}
            >
              <entry.icon className="size-5" />
              {entry.label}
            </Link>
          ))}
          </div>
          <BaseStrip />
        </nav>
      </div>
    </div>
  );
}

const SECTIONS: [RegExp, string][] = [
  [/^\/dashboard/, "01 · Home"], [/^\/(projects|clients)/, "02 · Projects"], [/^\/search/, "03 · Search"],
  [/^\/(cases|case-database|trail|timeline|profiles|comments|transcripts|custody|report|dossier|summary|items|incidents)/, "04 · Cases"],
  [/^\/(collect|rejections|queue|watchlist|results|capture-log|worker|capture-settings|jobs)/, "05 · Collect"],
  [/^\/(integrity|verify|export|offline)/, "06 · Integrity"], [/^\/library/, "07 · Library"],
  [/^\/sources/, "08 · Sources"], [/^\/(team|templates|settings|vaults)/, "09 · Admin"],
  [/^\/inbox/, "Curator"], [/^\/management/, "Management"], [/^\/billing/, "Billing"], [/^\/frameworks/, "Frameworks"], [/^\/account/, "Account"], [/^\/users-access/, "Users and access"],
];
export function sectionKicker(pathname: string) {
  return SECTIONS.find(([re]) => re.test(pathname))?.[1] ?? "FA Portal";
}

export function PageHeader({
  title,
  subtitle,
  actions,
  kicker,
}: {
  kicker?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  const { pathname } = useLocation();
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Kicker>{kicker ?? sectionKicker(pathname)}</Kicker>
        <h1 className="font-display text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
        {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

function BillingLink({ label }: { label: string }) {
  const open = useQuery({ queryKey: ["billing", "open-requests"], refetchInterval: 60_000, queryFn: async () => { const { count } = await supabase.from("upgrade_requests").select("id", { count: "exact", head: true }).eq("status", "requested"); return count ?? 0; } });
  const n = open.data ?? 0;
  return <Link to="/billing" className="hover:bg-sidebar-accent flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm"><Receipt className="size-5"/>{label}{n > 0 ? <span className="bg-primary text-primary-foreground ml-auto rounded-full px-2 py-0.5 text-xs font-semibold" aria-label={`${n} upgrade request${n === 1 ? "" : "s"} waiting`}>{n}</span> : null}</Link>;
}

/** User dropdown: Account (every level), Users and access when allowed, Sign out. */
export function UserMenu({ onSignOut, canUsers, compact = false }: { onSignOut: () => void; canUsers: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  const me = useMe();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn("min-h-11 gap-2", !compact && "w-full justify-start px-3")} aria-label="Account menu"><UserRound className="size-4" />{compact ? null : <span className="truncate">{me.data?.name || 'Account'}</span>}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem className="min-h-11" onSelect={() => void navigate({ to: '/account' })}><UserRound className="size-4" />Account</DropdownMenuItem>
        {canUsers ? <DropdownMenuItem className="min-h-11" onSelect={() => void navigate({ to: '/users-access' })}><UserCog className="size-4" />Users and access</DropdownMenuItem> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={onSignOut}><LogOut className="size-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
