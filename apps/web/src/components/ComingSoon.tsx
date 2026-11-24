import React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export interface ComingSoonProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeText?: string;
  highlights?: string[];
  actionText?: string;
  actionHref?: string;
}

export function ComingSoon({
  title,
  description,
  icon: Icon,
  badgeText = "In Development",
  highlights,
  actionText = "Back to Dashboard",
  actionHref = "/dashboard",
}: ComingSoonProps) {
  return (
    <div className="max-w-3xl mx-auto my-8">
      <div className="card p-8 md:p-14 relative overflow-hidden text-center flex flex-col items-center shadow-xl">
        {/* Subtle accent glow background */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[240px] bg-primary/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 right-10 w-[240px] h-[160px] bg-secondary/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-lg">
          {/* Badge */}
          <div className="mb-6">
            <Badge tone="green" className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider gap-1.5 inline-flex items-center shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {badgeText}
            </Badge>
          </div>

          {/* Icon Badge */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-panel to-card border border-glass-border flex items-center justify-center text-primary shadow-lg mb-6 ring-4 ring-primary/10">
            <Icon className="w-9 h-9" />
          </div>

          {/* Title */}
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground mb-3">
            {title}
          </h2>

          {/* Description */}
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8 max-w-md">
            {description}
          </p>

          {/* Highlights / Features Sneak Peek if provided */}
          {highlights && highlights.length > 0 && (
            <div className="w-full text-left bg-panel/70 border border-border/60 rounded-2xl p-5 md:p-6 mb-8 shadow-inner">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Planned Capabilities</span>
              </div>
              <ul className="space-y-2.5">
                {highlights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-xs md:text-sm text-foreground/85">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Back button */}
          <Link
            href={actionHref}
            className="btn-primary inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl shadow-md hover:opacity-95 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{actionText}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
