import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type SectionId = "collect" | "integrity" | "admin";

type Tab = { to: NonNullable<LinkProps["to"]>; label: string; match?: string[] };

export const SECTION_TABS: Record<SectionId, { title: string; tabs: Tab[] }> = {
  collect: {
    title: "Collect",
    tabs: [
      { to: "/collect", label: "Now" },
      { to: "/queue", label: "All jobs", match: ["/jobs/"] },
      { to: "/watchlist", label: "Watched pages" },
      { to: "/results", label: "Results" },
      { to: "/capture-log", label: "Capture log" },
      { to: "/worker", label: "Worker" },
      { to: "/capture-settings", label: "Capture setup" },
    ],
  },
  integrity: {
    title: "Integrity",
    tabs: [
      { to: "/verify", label: "Verify" },
      { to: "/export", label: "Export bundle" },
      { to: "/offline", label: "Offline library" },
    ],
  },
  admin: {
    title: "Admin",
    tabs: [
      { to: "/team", label: "Team and case access" },
      { to: "/templates", label: "Case templates" },
      { to: "/settings", label: "Settings" },
    ],
  },
};

/** Which sidebar section a path belongs to, for highlighting and section tabs. */
export function sectionForPath(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/projects") || pathname.startsWith("/clients")) return "projects";
  if (pathname.startsWith("/sources")) return "sources";
  for (const [id, cfg] of Object.entries(SECTION_TABS)) {
    if (cfg.tabs.some((t) => isTabActive(t, pathname))) return id;
  }
  return "cases";
}

function isTabActive(tab: Tab, pathname: string) {
  return (
    pathname === tab.to ||
    pathname.startsWith(`${tab.to}/`) ||
    (tab.match ?? []).some((m) => pathname.startsWith(m))
  );
}

/** Tabs across the top of the Collect, Integrity and Admin workspaces. */
export function SectionTabs({ section }: { section: SectionId }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cfg = SECTION_TABS[section];
  return (
    <div className="no-print border-border -mx-4 mb-6 border-b px-4 md:-mx-8 md:px-8">
      <div className="text-muted-foreground pt-1 text-xs font-semibold tracking-wider uppercase">
        {cfg.title}
      </div>
      <nav aria-label={`${cfg.title} views`} className="-mb-px flex gap-6 overflow-x-auto">
        {cfg.tabs.map((tab) => {
          const active = isTabActive(tab, pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-12 shrink-0 items-center border-b-[3px] text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground border-transparent font-medium",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
