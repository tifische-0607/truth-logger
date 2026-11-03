import type { ReactNode } from "react";
import { RisingBars } from "@/components/BrandLogo";
import { TAGLINE } from "@/lib/brand";
import { DOCUMENT_COMPANY_LINE, DOCUMENT_FOOTER } from "@/lib/document-footer";

/**
 * The one A4 layout for every generated document (see "Generated documents" in styles.css).
 * - Header on every page (repeating table head): official logo + document label + hairline.
 * - Footer on every page (page margin boxes): attribution, company line, "Page n of N", 3 mm strip.
 * - Optional cover for long documents: gradient, grid, rising bars, reverse logo, white details panel.
 */
export type CoverDetail = [label: string, value: string];

const css = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const FOOTER_VAR = `:root{--fa-doc-footer:"${css(DOCUMENT_FOOTER)}\\A ${css(DOCUMENT_COMPANY_LINE)}";}`;

export function PrintDocument({
  label,
  kicker,
  title,
  subtitle,
  cover,
  sample = false,
  children,
}: {
  /** Right side of the page header, e.g. "Case report". */
  label: string;
  /** Kicker above the H1, e.g. "01 · CASE REPORT" or a reference code. */
  kicker: string;
  title: string;
  subtitle?: string;
  /** Long documents only (dossier, case report, custody report). */
  cover?: { details: CoverDetail[]; tagline?: boolean };
  /** Marks sample data on the header, cover and H1. */
  sample?: boolean;
  children: ReactNode;
}) {
  const shownLabel = sample ? `${label} · Sample` : label;
  return (
    <div className="fa-doc fa-doc-sheet">
      <style>{FOOTER_VAR}</style>
      {cover ? (
        <section className="fa-doc-cover" aria-label={`${label} cover`}>
          <div aria-hidden="true" className="fa-doc-grid" />
          <RisingBars className="fa-doc-bars" />
          <img className="fa-doc-cover-logo" src="/brand/logos/fa-logo-horizontal-reverse.svg" alt="FridayAnalytics" />
          <p className="fa-doc-cover-kicker">{kicker}</p>
          <h1 className="fa-doc-cover-title">{title}</h1>
          {subtitle ? <p className="fa-doc-cover-subtitle">{subtitle}</p> : null}
          {cover.tagline ? <p className="fa-doc-cover-tagline">{TAGLINE}</p> : null}
          <div className="fa-doc-cover-panel">
            {sample ? <p className="mb-2"><span className="fa-doc-sample">Sample</span></p> : null}
            <dl>
              {cover.details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="fa-doc-cover-footer">
              {DOCUMENT_FOOTER}
              <br />
              {DOCUMENT_COMPANY_LINE}
            </p>
          </div>
        </section>
      ) : null}
      <table className="fa-doc-frame">
        <thead>
          <tr>
            <td>
              <div className="fa-doc-header fa-doc-page-head">
                <img src="/brand/logos/fa-logo-horizontal-for-light-bg.svg" alt="FridayAnalytics" />
                <span className="fa-doc-label">{shownLabel}</span>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="fa-doc-body">
                {cover ? null : (
                  <>
                    <p className="fa-doc-kicker">{kicker}</p>
                    <h1>
                      {title} {sample ? <span className="fa-doc-sample align-middle">Sample</span> : null}
                    </h1>
                    {subtitle ? <p className="fa-doc-subtitle">{subtitle}</p> : null}
                  </>
                )}
                {children}
                <p className="fa-doc-screen-footer">
                  {DOCUMENT_FOOTER}
                  <br />
                  {DOCUMENT_COMPANY_LINE}
                </p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Kicker for a section heading inside a document. */
export function DocKicker({ children }: { children: ReactNode }) {
  return <p className="fa-doc-kicker">{children}</p>;
}

export type DocTone = "positive" | "caution" | "negative" | "info" | "neutral";
/** Status as word plus dot, never colour alone. */
export function DocStatus({ tone = "neutral", children }: { tone?: DocTone; children: ReactNode }) {
  return <span className="fa-doc-status" data-tone={tone}>{children}</span>;
}

export function DocCallout({ children, card = false }: { children: ReactNode; card?: boolean }) {
  return <div className={card ? "fa-doc-card" : "fa-doc-callout"}>{children}</div>;
}
