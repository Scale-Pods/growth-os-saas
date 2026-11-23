import React from "react";
import {
  TrendingUp,
  Target,
  Wand2,
  CheckSquare,
  Send,
  BarChart3,
  BrainCircuit,
  ArrowRight,
} from "lucide-react";

interface StepItem {
  number: string;
  name: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: StepItem[] = [
  {
    number: "01",
    name: "Research",
    label: "Trend Signals",
    description: "Detect viral topics, rising search queries, and competitor momentum.",
    icon: TrendingUp,
  },
  {
    number: "02",
    name: "Plan",
    label: "Strategy & Themes",
    description: "Structure quarterly campaigns and content pillars mapped to target ICPs.",
    icon: Target,
  },
  {
    number: "03",
    name: "Create",
    label: "AI Studio",
    description: "Generate copy, carousels, and video scripts matched to your brand voice.",
    icon: Wand2,
  },
  {
    number: "04",
    name: "Review",
    label: "Approvals & QA",
    description: "Score brand voice compliance and collect stakeholder sign-offs.",
    icon: CheckSquare,
  },
  {
    number: "05",
    name: "Publish",
    label: "Distribution Queue",
    description: "Auto-publish across social networks and CMS platforms on schedule.",
    icon: Send,
  },
  {
    number: "06",
    name: "Measure",
    label: "Performance",
    description: "Track unified reach, engagement velocity, and conversion attribution.",
    icon: BarChart3,
  },
  {
    number: "07",
    name: "Learn",
    label: "Intelligence",
    description: "Feed performance insights back into prompt tuning and topic selection.",
    icon: BrainCircuit,
  },
];

export function TheSevenStepLoop() {
  return (
    <section id="loop" className="py-20 md:py-28 border-t border-border/40 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-secondary/25 bg-secondary/10 text-secondary text-xs font-medium mb-3">
            <span>The Growth Framework</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            The 7-Step <span className="accent-serif italic font-normal text-secondary">Autonomous Loop</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground mt-3">
            A continuous marketing engine that transforms market opportunities into measurable revenue, continuously learning from every post.
          </p>
        </div>

        {/* The 7 Steps: Illustrated Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3.5 relative">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isLast = idx === STEPS.length - 1;

            return (
              <div
                key={step.number}
                className="group relative flex flex-col justify-between p-5 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm hover:border-primary/40 hover:bg-card/90 transition-all shadow-sm"
              >
                {/* Step Top */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono font-bold text-muted-foreground/80 group-hover:text-primary transition-colors">
                      {step.number}
                    </span>
                    <div className="w-8 h-8 rounded-lg bg-fill-tertiary border border-glass-border flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {step.name}
                  </h3>
                  <div className="text-[11px] font-medium text-secondary mb-2">
                    {step.label}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Arrow indicator for desktop */}
                {!isLast && (
                  <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-muted-foreground/40 group-hover:text-primary transition-colors pointer-events-none">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Continuous Loop Callout */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-panel/60 border border-border/40 px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span>Step 07 feeds directly back into Step 01 for compounding growth</span>
          </div>
        </div>
      </div>
    </section>
  );
}
