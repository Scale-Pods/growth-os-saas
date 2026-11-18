import Link from "next/link";
import { ArrowRight, Sparkles, ShieldCheck, Lock, Building2 } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-background">
      <div className="max-w-2xl w-full p-8 rounded-3xl border border-border bg-card shadow-2xl backdrop-blur-sm space-y-8">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          P01 Tenancy & Authentication Initialized
        </div>

        {/* Hero Title */}
        <div className="space-y-3">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Growth OS <span className="text-primary italic">SaaS</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto leading-relaxed">
            Multi-tenant AI marketing operating system. Row-Level Security, Supabase SSR authentication, organization workspaces, and fine-grained feature isolation.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-border bg-panel text-foreground text-sm font-medium hover:bg-panel/80 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-background text-sm font-medium hover:opacity-90 transition-opacity shadow-md"
          >
            Create Workspace <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Features badges */}
        <div className="pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-muted-foreground text-left">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-panel/40 border border-border/50">
            <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Supabase SSR</div>
              <div className="text-[11px] text-muted-foreground">HttpOnly cookie sessions with token rotation</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-panel/40 border border-border/50">
            <ShieldCheck className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Row-Level Security</div>
              <div className="text-[11px] text-muted-foreground">Postgres database-level cross-tenant isolation</div>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-panel/40 border border-border/50">
            <Building2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-foreground">Multi-Tenancy</div>
              <div className="text-[11px] text-muted-foreground">Org workspaces, brand provisioning & RBAC</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
