import Link from "next/link";
import { ArrowRight, ShieldCheck, Cpu, Layers } from "lucide-react";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
      {/* Background ambient radial glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[250px] bg-secondary/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/25 bg-primary/10 text-primary text-xs font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Continuous Growth OS • The 7-Step Marketing Loop</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1] mb-6">
          The operating system for{" "}
          <span className="accent-serif font-normal italic text-primary">
            modern marketing
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
          Turn audience signals and brand knowledge into published, high-converting campaigns. Research breakout trends, generate on-brand creatives, orchestrate team approvals, and auto-publish across networks.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto mb-14">
          <Link
            href="/signup"
            className="w-full sm:w-auto btn-primary inline-flex items-center justify-center gap-2 text-sm md:text-base font-semibold px-7 py-3 rounded-xl shadow-md hover:opacity-90 transition-opacity"
          >
            <span>Create workspace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-sm md:text-base font-medium px-7 py-3 rounded-xl border border-border bg-panel text-foreground hover:bg-fill-secondary transition-colors"
          >
            Sign in
          </Link>
        </div>

        {/* Technical Value Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-6 border-t border-border/40 text-left">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-card/60 border border-border/50">
            <Cpu className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-foreground">Multi-Modal AI Studio</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Brand-voice trained copy, carousels, and video scripts</div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-card/60 border border-border/50">
            <ShieldCheck className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-foreground">Isolated Tenancy & RLS</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Postgres database-level security across all brands</div>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-card/60 border border-border/50">
            <Layers className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-foreground">Automated Publishing</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Reliable queue execution with failover retries</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
