import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5">
              ScalePods
              <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">
                OS
              </span>
            </span>
            <span className="text-[10px] text-muted-foreground font-medium -mt-0.5">Marketing Growth Engine</span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#loop" className="hover:text-foreground transition-colors">
            The 7-Step Loop
          </a>
          <a href="#features" className="hover:text-foreground transition-colors">
            Capabilities
          </a>
          <Link href="/manual" className="hover:text-foreground transition-colors">
            User Manual
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center justify-center text-xs md:text-sm font-medium px-4 py-2 rounded-xl text-foreground hover:bg-fill-secondary transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="btn-primary inline-flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium px-4 py-2 rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            <span>Create workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
