import React from "react";
import { Building2, Clapperboard, SendHorizontal, Check, Sparkles } from "lucide-react";

interface FeatureCardProps {
  title: string;
  tag: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "green" | "blue" | "orange";
  highlights: string[];
}

const FEATURES: FeatureCardProps[] = [
  {
    title: "Multi-Brand Intelligence Brain",
    tag: "Brand Isolation",
    description: "Every brand has its own identity vault: custom logos, brand colors, typography, tone of voice, ICP definitions, and product offerings.",
    icon: Building2,
    tone: "green",
    highlights: [
      "Strict multi-tenant Row-Level Security (RLS) data isolation",
      "Tone of voice guidelines enforced across all AI generations",
      "Multiple brand switching under a single master organization",
    ],
  },
  {
    title: "Omni-Channel Content Factory",
    tag: "Multi-Modal Creation",
    description: "Generate ready-to-publish assets tailored to each social network: LinkedIn slide decks, short-form video scripts, and SEO blog articles.",
    icon: Clapperboard,
    tone: "blue",
    highlights: [
      "Visual Carousel Studio with automated slide formatting & PDF export",
      "Short-form video script generator with teleprompter timing",
      "Collaborative review pipeline with brand compliance scoring",
    ],
  },
  {
    title: "Resilient Publishing & Queue Engine",
    tag: "Autonomous Dispatch",
    description: "Reliable background publishing worker architecture. Direct social API connections with automatic token refresh, rate limit handling, and failover retries.",
    icon: SendHorizontal,
    tone: "orange",
    highlights: [
      "Visual drag-and-drop editorial calendar across all channels",
      "Autonomous pg-boss queue distribution engine",
      "Real-time dispatch telemetry and instant error notifications",
    ],
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="py-20 md:py-28 border-t border-border/40 bg-card/20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/25 bg-primary/10 text-primary text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Built For Scale</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Architected for <span className="accent-serif italic font-normal text-primary">enterprise velocity</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3">
            Three foundational pillars powering complete end-to-end marketing automation.
          </p>
        </div>

        {/* 3 Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            const accentColor =
              feature.tone === "blue"
                ? "text-secondary border-secondary/30 bg-secondary/10"
                : feature.tone === "orange"
                ? "text-destructive border-destructive/30 bg-destructive/10"
                : "text-primary border-primary/30 bg-primary/10";

            return (
              <div
                key={feature.title}
                className="card p-8 flex flex-col justify-between hover:border-primary/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-200 group bg-gradient-to-b from-card to-card/90"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-inner ${accentColor}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-panel text-muted-foreground border border-border/70">
                      {feature.tag}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>

                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    {feature.description}
                  </p>
                </div>

                <ul className="space-y-3 pt-6 border-t border-border/40">
                  {feature.highlights.map((highlight, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-foreground/80">
                      <div className="w-4 h-4 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5 text-primary">
                        <Check className="w-3 h-3" />
                      </div>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
