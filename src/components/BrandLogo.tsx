import { cn } from "@/lib/utils";

/**
 * Official FridayAnalytics + FA Portal artwork from FA-Portal-Brand-Assets.zip
 * and FA-Portal-Lens-Logo-and-Icons.zip, served from public/brand/.
 * Every screen renders logos through this component only.
 *
 * Company logo (FridayAnalytics) stays in headers; the Lens product mark is
 * for the app icon, favicon and next to the "FA Portal" product name.
 */
export type BrandLogoVariant = "horizontal" | "reverse" | "icon" | "mono-white" | "mono-black";

const COMPANY_LOGO: Record<BrandLogoVariant, string> = {
  horizontal: "/brand/logos/fa-logo-horizontal-for-light-bg.svg",
  reverse: "/brand/logos/fa-logo-horizontal-reverse.svg",
  icon: "/brand/logos/fa-icon.svg",
  "mono-white": "/brand/logos/fa-logo-horizontal-mono-white.svg",
  "mono-black": "/brand/logos/fa-logo-horizontal-mono-black.svg",
};

const COMPANY_ICON: Record<BrandLogoVariant, string> = {
  horizontal: "/brand/logos/fa-icon.svg",
  reverse: "/brand/logos/fa-icon-reverse.svg",
  icon: "/brand/logos/fa-icon.svg",
  "mono-white": "/brand/logos/fa-icon-mono-white.svg",
  "mono-black": "/brand/logos/fa-icon-mono-black.svg",
};

/** Lens product mark (magnifier around rising bars on the gradient tile). */
const LENS_ICON = "/brand/lens/fa-portal-icon.svg";

/** Company horizontal lockups are 1029x256 (~4:1); icons are square. */
const LOCKUP_RATIO = 1029 / 256;

export function BrandLogo({
  variant = "horizontal",
  size = 32,
  className,
}: {
  variant?: BrandLogoVariant;
  /** Height in px. Lockups render ~4x wider than tall. */
  size?: number;
  className?: string;
}) {
  const label = "FridayAnalytics";
  const height = Math.max(16, size);
  if (variant === "icon") {
    return (
      <span role="img" aria-label={label} className={cn("inline-flex", className)}>
        <img src={COMPANY_ICON.icon} alt="" width={height} height={height} draggable={false} className="shrink-0" />
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} className={cn("inline-flex items-center", className)}>
      <img
        src={COMPANY_LOGO[variant]}
        alt=""
        height={height}
        width={Math.round(height * LOCKUP_RATIO)}
        draggable={false}
        className="min-w-[120px] shrink-0"
        style={{ height, width: height * LOCKUP_RATIO }}
      />
    </span>
  );
}

/** Product lockup for app chrome: Lens mark, divider, "FA Portal". */
export function ProductLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <span role="img" aria-label="FA Portal" className="inline-flex">
        <img src={LENS_ICON} alt="" width={24} height={24} draggable={false} className="shrink-0" />
      </span>
      <span aria-hidden="true" className="bg-input h-6 w-px" />
      <span className="font-display text-muted-foreground text-base font-medium">
        {compact ? "FA Portal" : "FA Portal"}
      </span>
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
