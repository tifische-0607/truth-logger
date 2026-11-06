import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BaseStrip, BrandLogo, COMPANY, GradientHero } from "@/components/BrandLogo";
import { DOCUMENT_FOOTER } from "@/lib/document-footer";
import { getSiteConfig } from '@/lib/portal.functions';
import { siteLink } from '@/lib/site-config';

export const Route = createFileRoute("/")({
  // A dropped connection must not blank the landing page; canonical tags are optional.
  loader: async () => {
    try { return await getSiteConfig(); } catch { return null; }
  },
  head: ({loaderData}) => ({
    meta: [
      { title: "FA Portal — FridayAnalytics" },
      {
        name: "description",
        content:
          "FridayAnalytics client and staff portal for engagements, documents and verified records.",
      },
      { property: "og:title", content: "FA Portal — FridayAnalytics" },
      {
        property: "og:description",
        content:
          "Secure sign-in for FridayAnalytics clients and staff.",
      },
      { property: "og:type", content: "website" },
      ...(loaderData ? [{ property: "og:url", content: siteLink(loaderData.siteUrl, '/') }] : []),
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: loaderData ? [{ rel: "canonical", href: siteLink(loaderData.siteUrl, '/') }] : [],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <GradientHero className="flex-1">
        <div className="mx-auto flex w-full max-w-6xl flex-col px-5 pt-8 pb-40 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <BrandLogo variant="reverse" size={36} />
            <Button asChild variant="secondary">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
          <div className="mt-20 max-w-3xl sm:mt-28">
            <h1 className="text-on-gradient font-display text-4xl font-medium leading-tight sm:text-6xl">FA Portal</h1>
            <p className="text-on-gradient mt-6 max-w-2xl text-2xl leading-relaxed">
              The private portal for FridayAnalytics clients and staff. Access is by invitation only.
            </p>
            <div className="mt-9">
              <Button asChild size="lg" variant="secondary" className="min-h-12 px-6 text-base">
                <Link to="/auth">
                  Sign in
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </GradientHero>
      <footer className="border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-5 text-xs sm:px-8">
          <span>{DOCUMENT_FOOTER}</span>
          <span>{COMPANY.name} · {COMPANY.reg} · {COMPANY.email} · {COMPANY.web}</span>
        </div>
      </footer>
      <BaseStrip />
    </div>
  );
}
