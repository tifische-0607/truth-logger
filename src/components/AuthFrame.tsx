import type { ReactNode } from "react";
import { BaseStrip, BrandLogo, COMPANY, GradientHero, Kicker } from "@/components/BrandLogo";
import { DOCUMENT_FOOTER } from "@/lib/document-footer";

/** Sign-in and invitation set-up: a gradient "moment" beside a white reading panel. */
export function AuthFrame({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <div className="grid flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <GradientHero className="flex flex-col justify-between gap-10 px-6 pt-8 pb-28 lg:px-12 lg:pt-12 lg:pb-40">
          <BrandLogo variant="reverse" size={36} />
          <div className="max-w-md">
            <p className="text-on-gradient font-display text-2xl leading-snug font-medium lg:text-3xl">
              Turning data into decisions that hold up.
            </p>
          </div>
        </GradientHero>
        <main className="flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md space-y-5">
            <div>
              <Kicker>{kicker}</Kicker>
              <h1 className="font-display text-3xl font-medium">{title}</h1>
            </div>
            {children}
          </div>
        </main>
      </div>
      <footer className="text-muted-foreground border-t px-6 py-4 text-xs">
        {DOCUMENT_FOOTER} · {COMPANY.name} · {COMPANY.reg} · {COMPANY.email} · {COMPANY.web}
      </footer>
      <BaseStrip />
    </div>
  );
}
