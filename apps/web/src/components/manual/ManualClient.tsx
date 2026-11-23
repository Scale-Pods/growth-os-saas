"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  Repeat,
  HelpCircle,
  ChevronDown,
  LayoutDashboard,
  Building2,
  TrendingUp,
  BellRing,
  Target,
  Wand2,
  Clapperboard,
  Film,
  Factory,
  CheckSquare,
  CalendarDays,
  Send,
  Newspaper,
  KanbanSquare,
  BarChart3,
  BrainCircuit,
  Settings,
  Users,
  Activity,
  ArrowRight,
  Shield,
  Coins,
  Share2,
} from "lucide-react";

interface SidebarSection {
  title: string;
  description: string;
  pages: {
    name: string;
    route: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    roles?: string;
  }[];
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    title: "Overview",
    description: "Your daily mission control and operational summary.",
    pages: [
      {
        name: "Dashboard",
        route: "/dashboard",
        description: "High-level summary of upcoming scheduled posts, recent marketing activity, and connected social channels.",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Marketing Strategy",
    description: "Define your brands, analyze market trends, and plan campaign initiatives.",
    pages: [
      {
        name: "Business / Brand Kit",
        route: "/clients",
        description: "Set up and manage multiple brand identities: visual logos, color palettes, custom fonts, brand tone, audience ICP, and products.",
        icon: Building2,
      },
      {
        name: "Trends",
        route: "/trends",
        description: "AI-driven market signals, rising keywords, and viral topic detection across social media and search.",
        icon: TrendingUp,
      },
      {
        name: "Trend Alerts",
        route: "/trend-alerts",
        description: "Custom notification rules and webhooks that trigger when breakout topics or keywords surge.",
        icon: BellRing,
      },
      {
        name: "Strategy",
        route: "/strategy",
        description: "Campaign roadmaps, thematic content pillars, and value-proposition matrices mapped to customer personas.",
        icon: Target,
      },
    ],
  },
  {
    title: "Content Generation",
    description: "Transform ideas into high-converting multimedia assets matching your brand voice.",
    pages: [
      {
        name: "AI Studio",
        route: "/studio",
        description: "Interactive creative playground for generating social copy, hook variations, and marketing emails.",
        icon: Wand2,
      },
      {
        name: "Carousel Studio",
        route: "/carousel-studio",
        description: "Visual slide deck builder for LinkedIn and Instagram with automated layout formatting and PDF export.",
        icon: Clapperboard,
      },
      {
        name: "Video Studio",
        route: "/video-studio",
        description: "Script-to-video workflow: viral hook creation, teleprompter pacing, and short-form storyboard generation.",
        icon: Film,
      },
      {
        name: "Content Factory",
        route: "/content",
        description: "High-volume batch creation pipeline to generate dozens of channel-specific assets from single core concepts.",
        icon: Factory,
      },
      {
        name: "Creative Review",
        route: "/review",
        description: "Quality assurance workflow: automated brand voice compliance scoring, team commenting, and final sign-offs.",
        icon: CheckSquare,
      },
    ],
  },
  {
    title: "Publishing Engine",
    description: "Manage scheduling, queue distribution, and long-form CMS distribution.",
    pages: [
      {
        name: "Calendar",
        route: "/calendar",
        description: "Dynamic monthly and weekly editorial timeline. Drag and drop posts to adjust publishing schedules across all channels.",
        icon: CalendarDays,
      },
      {
        name: "Publishing",
        route: "/publishing",
        description: "Live distribution queue console. Monitor post delivery status, retry failed dispatches, and manage API connections.",
        icon: Send,
      },
      {
        name: "Blog",
        route: "/blog",
        description: "SEO-optimized long-form article editor with schema markup generation and direct headless CMS publishing.",
        icon: Newspaper,
      },
    ],
  },
  {
    title: "Team",
    description: "Collaborative project management and sprint tracking.",
    pages: [
      {
        name: "Board",
        route: "/board",
        description: "Agile Kanban board for tracking marketing campaigns, assigning deliverables, and managing sprint deadlines.",
        icon: KanbanSquare,
      },
    ],
  },
  {
    title: "Insight & Workspace",
    description: "Analytics telemetry, machine learning intelligence, and workspace configuration.",
    pages: [
      {
        name: "Analytics",
        route: "/analytics",
        description: "Consolidated performance metrics: impressions, clicks, engagements, and channel ROI comparisons.",
        icon: BarChart3,
      },
      {
        name: "Intelligence",
        route: "/intelligence",
        description: "Machine learning insights: pre-publish engagement predictions, virality scoring, and audience sentiment shifts.",
        icon: BrainCircuit,
      },
      {
        name: "Settings",
        route: "/settings",
        description: "Workspace configuration, billing management, and API credential vault.",
        icon: Settings,
        roles: "Owner & Admin",
      },
      {
        name: "Team & access",
        route: "/settings/team",
        description: "Invite teammates, manage member roles (Owner, Admin, Member), and review pending email invitations.",
        icon: Users,
        roles: "Owner & Admin",
      },
      {
        name: "Platform",
        route: "/settings/platform",
        description: "Real-time system health telemetry, database connectivity diagnostics, and cache status.",
        icon: Activity,
        roles: "Owner & Admin",
      },
    ],
  },
];

const LIFECYCLE_STEPS = [
  {
    step: "01",
    title: "Draft (Idea & Generation)",
    color: "text-muted-foreground",
    badge: "Draft",
    badgeTone: "bg-fill-tertiary text-muted-foreground",
    description:
      "A post starts as an idea, prompt, or trending topic. You generate or write copy in AI Studio or Content Factory. At this stage, it is private and editable.",
  },
  {
    step: "02",
    title: "In Review (QA & Compliance)",
    color: "text-secondary",
    badge: "In Review",
    badgeTone: "bg-secondary/15 text-secondary border border-secondary/30",
    description:
      "When the draft is ready, it enters Creative Review. Growth OS automatically scores it against your brand voice guidelines, and teammates can leave feedback or request revisions.",
  },
  {
    step: "03",
    title: "Approved (Sign-off)",
    color: "text-primary",
    badge: "Approved",
    badgeTone: "bg-primary/15 text-primary border border-primary/30",
    description:
      "Once an Admin or Editor approves the creative, it is certified brand-safe and ready for distribution.",
  },
  {
    step: "04",
    title: "Scheduled (Calendar Queue)",
    color: "text-secondary",
    badge: "Scheduled",
    badgeTone: "bg-secondary/15 text-secondary border border-secondary/30",
    description:
      "The post is assigned a target channel and publish date/time in the Calendar. The background pg-boss scheduler locks the release time.",
  },
  {
    step: "05",
    title: "Publishing (Worker Dispatch)",
    color: "text-amber-400",
    badge: "Publishing",
    badgeTone: "bg-amber-400/15 text-amber-400 border border-amber-400/30",
    description:
      "At the scheduled time, our resilient background workers securely send the media and text payload to the target social API (LinkedIn, X, Facebook, etc.).",
  },
  {
    step: "06",
    title: "Published & Analyzed",
    color: "text-primary",
    badge: "Published",
    badgeTone: "bg-primary/15 text-primary border border-primary/30",
    description:
      "The post is live! Growth OS records the live permalink and begins tracking impressions, clicks, and engagement velocity to feed back into Analytics & Intelligence.",
  },
];

const GLOSSARY_ITEMS = [
  {
    term: "Brand",
    icon: Building2,
    shortDef: "An isolated marketing identity and voice profile.",
    fullDef:
      "A Brand encapsulates everything unique to one product or business line: its logos, typography, visual colors, custom voice guidelines, target audience ICP, and product catalog. A single workspace can manage multiple brands with total separation.",
  },
  {
    term: "Workspace (Organization)",
    icon: Shield,
    shortDef: "The top-level container for your company, team, and billing.",
    fullDef:
      "A Workspace is your organization's secure tenant. All data is isolated using Postgres Row-Level Security (RLS). Team members, billing subscriptions, and connected brand accounts live inside the workspace.",
  },
  {
    term: "Credits",
    icon: Coins,
    shortDef: "The compute currency used for AI generations.",
    fullDef:
      "Credits power intelligent operations: generating headlines, generating carousel decks, drafting blog articles, scoring brand voice, and running trend queries. Workspaces receive credits monthly and can replenish as needed.",
  },
  {
    term: "Channel",
    icon: Share2,
    shortDef: "A connected social media or CMS distribution endpoint.",
    fullDef:
      "A Channel is an authorized external destination—such as a LinkedIn Company Page, X (Twitter) account, Facebook Page, or webhook. Once connected via OAuth, Growth OS can automatically publish posts directly to it.",
  },
];

export function ManualClient() {
  const [activeTab, setActiveTab] = useState<"sidebar" | "lifecycle" | "glossary">("sidebar");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Overview: true,
    "Marketing Strategy": true,
    "Content Generation": true,
    "Publishing Engine": true,
    Team: true,
    "Insight & Workspace": true,
  });

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab("sidebar")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "sidebar"
              ? "bg-primary text-ctaText shadow-sm shadow-primary/20 scale-[1.02]"
              : "text-muted-foreground hover:text-foreground hover:bg-fill-tertiary"
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Sidebar Navigation Guide</span>
        </button>

        <button
          onClick={() => setActiveTab("lifecycle")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "lifecycle"
              ? "bg-primary text-ctaText shadow-sm shadow-primary/20 scale-[1.02]"
              : "text-muted-foreground hover:text-foreground hover:bg-fill-tertiary"
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>Post Lifecycle (Idea &rarr; Published)</span>
        </button>

        <button
          onClick={() => setActiveTab("glossary")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
            activeTab === "glossary"
              ? "bg-primary text-ctaText shadow-sm shadow-primary/20 scale-[1.02]"
              : "text-muted-foreground hover:text-foreground hover:bg-fill-tertiary"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Glossary</span>
        </button>
      </div>

      {/* TAB 1: SIDEBAR GUIDE */}
      {activeTab === "sidebar" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Learn what each area of Growth OS is designed for and which pages to use for your daily tasks.
            </p>
          </div>

          <div className="space-y-4">
            {SIDEBAR_SECTIONS.map((section) => {
              const isOpen = !!openSections[section.title];
              return (
                <div
                  key={section.title}
                  className="card overflow-hidden border border-border/60 transition-all"
                >
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full p-4 md:p-5 flex items-center justify-between text-left hover:bg-fill-quaternary transition-colors"
                  >
                    <div>
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <span>{section.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          ({section.pages.length} {section.pages.length === 1 ? "page" : "pages"})
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                    </div>
                    <div
                      className={`w-7 h-7 rounded-lg bg-fill-tertiary flex items-center justify-center text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="p-4 md:p-5 pt-0 border-t border-border/30 grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-card/40">
                      {section.pages.map((page) => {
                        const Icon = page.icon;
                        return (
                          <Link
                            key={page.route}
                            href={page.route}
                            className="p-3.5 rounded-xl border border-border/50 bg-panel/60 hover:border-primary/40 hover:bg-panel transition-all flex items-start gap-3 group"
                          >
                            <div className="w-9 h-9 rounded-lg bg-fill-tertiary border border-glass-border flex items-center justify-center text-primary group-hover:scale-105 transition-transform shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                                  {page.name}
                                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </span>
                                {page.roles && (
                                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-fill-secondary text-muted-foreground border border-border/40">
                                    {page.roles}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                                {page.description}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: POST LIFECYCLE */}
      {activeTab === "lifecycle" && (
        <div className="space-y-6">
          <div className="card p-6 md:p-8 bg-card/60">
            <h3 className="text-xl font-bold text-foreground mb-2">
              How a post goes from <span className="accent-serif italic font-normal text-primary">idea to published</span>
            </h3>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Growth OS ensures no unverified or off-brand content reaches your public channels. Every post moves through a clear, transparent six-stage pipeline.
            </p>
          </div>

          <div className="space-y-4">
            {LIFECYCLE_STEPS.map((step) => (
              <div
                key={step.step}
                className="card p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4 hover:border-primary/30 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-fill-tertiary border border-glass-border flex items-center justify-center font-mono font-bold text-sm text-primary shrink-0">
                  {step.step}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <h4 className="text-sm md:text-base font-bold text-foreground">
                      {step.title}
                    </h4>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${step.badgeTone}`}>
                      {step.badge}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: GLOSSARY */}
      {activeTab === "glossary" && (
        <div className="space-y-6">
          <div className="card p-6 md:p-8 bg-card/60">
            <h3 className="text-xl font-bold text-foreground mb-2">
              Key Terminology & <span className="accent-serif italic font-normal text-primary">Glossary</span>
            </h3>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Clear definitions of the core concepts in Growth OS to help your entire team align quickly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GLOSSARY_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.term}
                  className="card p-6 flex flex-col justify-between hover:border-primary/40 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-foreground">{item.term}</h4>
                        <div className="text-xs text-secondary font-medium">{item.shortDef}</div>
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed pt-2 border-t border-border/40">
                      {item.fullDef}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FAQ Box */}
          <div className="card p-6 bg-panel/60 border border-border/50">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground mb-3">
              <HelpCircle className="w-4 h-4 text-primary" />
              <span>Need more help?</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              If you have any questions about permissions, API rate limits, or custom brand integrations, your workspace Admin can review diagnostics in{" "}
              <Link href="/settings/platform" className="text-primary hover:underline font-medium">
                Platform Status
              </Link>{" "}
              or invite teammates via{" "}
              <Link href="/settings/team" className="text-primary hover:underline font-medium">
                Team & access
              </Link>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
