import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 bg-card/40">
      {/* Bottom CTA Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-b border-border/40">
        <div className="card p-8 md:p-12 text-center max-w-4xl mx-auto flex flex-col items-center relative overflow-hidden">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">
            Ready to streamline your marketing operations?
          </h3>
          <p className="text-sm md:text-base text-muted-foreground max-w-lg mb-8 leading-relaxed">
            Create an organization workspace in seconds. Connect your channels, define your brand voice, and start the autonomous loop.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="/signup"
              className="btn-primary inline-flex items-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-xl shadow-md hover:opacity-90 transition-opacity"
            >
              <span>Get started with Growth OS</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl border border-border bg-panel text-foreground hover:bg-fill-secondary transition-colors"
            >
              Sign in to workspace
            </Link>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-foreground">ScalePods Marketing Growth OS</span>
          <span>&copy; {new Date().getFullYear()} ScalePods Inc.</span>
        </div>

        <div className="flex items-center gap-6">
          <Link href="/manual" className="hover:text-foreground transition-colors">
            User Manual
          </Link>
          <Link href="/login" className="hover:text-foreground transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="hover:text-foreground transition-colors">
            Create workspace
          </Link>
        </div>
      </div>
    </footer>
  );
}
