import { cn } from "@/lib/utils";

/**
 * FridayAnalytics logo.
 * TODO(brand-assets): PLACEHOLDER lockup until the official SVGs from
 * FA-Portal-Brand-Assets.zip are placed in public/brand/logos/. Swap the
 * implementation here only; every screen uses this component.
 */
export type BrandLogoVariant = "horizontal" | "reverse" | "icon" | "mono-white" | "mono-black";

function Icon({ size, variant }: { size: number; variant: BrandLogoVariant }) {
  const mono = variant === "mono-white" ? "fill-on-gradient" : variant === "mono-black" ? "fill-foreground" : undefined;
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="fa-logo-gi" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--fa-signal-blue)" }} />
          <stop offset="1" style={{ stopColor: "var(--fa-violet)" }} />
        </linearGradient>
      </defs>
      {mono ? null : <rect width="256" height="256" rx="72" fill="url(#fa-logo-gi)" />}
      <g className={mono ?? "fill-brand-indigo"}>
        <rect x="76" y="74" width="17" height="118" rx="3" />
        <rect x="76" y="175" width="112" height="17" rx="3" />
        <rect x="104" y="132" width="17" height="37" rx="3" />
        <rect x="134" y="86" width="17" height="83" rx="3" />
        <rect x="164" y="110" width="17" height="59" rx="3" />
      </g>
    </svg>
  );
}

export function BrandLogo({
  variant = "horizontal",
  size = 32,
  className,
}: {
  variant?: BrandLogoVariant;
  size?: number;
  className?: string;
}) {
  const label = "FridayAnalytics";
  if (variant === "icon") {
    return (
      <span role="img" aria-label={label} className={cn("inline-flex", className)}>
        <Icon size={Math.max(16, size)} variant={variant} />
      </span>
    );
  }
  const text =
    variant === "reverse" || variant === "mono-white" ? "text-on-gradient" : "text-foreground";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex min-w-[120px] items-center gap-2", className)}
      data-placeholder-logo="true"
    >
      <Icon size={size} variant={variant === "reverse" ? "horizontal" : variant} />
      <span className={cn("font-display text-lg leading-none font-medium", text)}>{label}</span>
    </span>
  );
}

/** Product lockup for app chrome: logo, divider, "FA Portal". */
export function ProductLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <BrandLogo variant={compact ? "icon" : "horizontal"} size={compact ? 28 : 28} />
      <span aria-hidden="true" className="bg-border h-6 w-px" />
      <span className="font-display text-muted-foreground text-base font-medium">FA Portal</span>
    </span>
  );
}

/** Rising bars motif — decorative only, never behind text. */
export function RisingBars({ className }: { className?: string }) {
  const h = [22, 30, 26, 40, 36, 52, 46, 62, 58, 74, 70, 88];
  return (
    <svg viewBox="0 0 306 100" aria-hidden="true" className={cn("fa-hero-art pointer-events-none", className)}>
      {h.map((height, i) => (
        <rect key={i} x={i * 26} y={100 - height} width="20" height={height} rx="3" className="fill-bar" />
      ))}
    </svg>
  );
}

export function GradientHero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("fa-gradient fa-gradient-hero relative overflow-hidden", className)}>
      <div aria-hidden="true" className="fa-grid fa-hero-art absolute inset-0" />
      <RisingBars className="absolute right-0 bottom-0 w-[60%] max-w-[420px]" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function BaseStrip({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("fa-base-strip w-full", className)} />;
}

export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("kicker mb-2", className)}>{children}</p>;
}

export const COMPANY = {
  name: "Friday Analytics Sdn. Bhd.",
  reg: "Company Reg. No. 202601040549 (1702644-K)",
  email: "curator@fridayanalytics.org",
  web: "www.fridayanalytics.org",
} as const;
