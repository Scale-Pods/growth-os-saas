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
    <div className="max-w-3xl mx-auto my-6">
      <div className="card p-8 md:p-12 relative overflow-hidden text-center flex flex-col items-center">
        {/* Subtle accent glow background */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-lg">
          {/* Badge */}
          <div className="mb-6">
            <Badge tone="green" className="px-3 py-1 text-xs font-medium uppercase tracking-wider gap-1.5 inline-flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {badgeText}
            </Badge>
          </div>

          {/* Icon Badge */}
          <div className="w-16 h-16 rounded-2xl bg-fill-tertiary border border-glass-border flex items-center justify-center text-primary shadow-sm mb-6">
            <Icon className="w-8 h-8" />
          </div>

          {/* Title */}
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">
            {title}
          </h2>

          {/* Description */}
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8">
            {description}
          </p>

          {/* Highlights / Features Sneak Peek if provided */}
          {highlights && highlights.length > 0 && (
            <div className="w-full text-left bg-fill-quaternary border border-glass-border rounded-xl p-4 md:p-5 mb-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>Planned Capabilities</span>
              </div>
              <ul className="space-y-2">
                {highlights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs md:text-sm text-foreground/80">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Back button */}
          <Link
            href={actionHref}
            className="btn-primary inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{actionText}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
