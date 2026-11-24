"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
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
  BookOpen,
  Activity,
  Share2,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { BrandSwitcher } from "./BrandSwitcher";
import type { Organization, Brand, OrgRole } from "@growth-os/db";

interface NavItemConfig {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeTone?: "green" | "blue" | "orange";
}

interface NavGroupConfig {
  header: string;
  items: NavItemConfig[];
}

const NAV_GROUPS: NavGroupConfig[] = [
  {
    header: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    header: "Marketing Strategy",
    items: [
      { key: "business", label: "Business", href: "/clients", icon: Building2 },
      { key: "trends", label: "Trends", href: "/trends", icon: TrendingUp },
      { key: "trend_alerts", label: "Trend Alerts", href: "/trend-alerts", icon: BellRing },
      { key: "strategy", label: "Strategy", href: "/strategy", icon: Target },
    ],
  },
  {
    header: "Content Generation",
    items: [
      { key: "studio", label: "AI Studio", href: "/studio", icon: Wand2 },
      { key: "carousel_studio", label: "Carousel Studio", href: "/carousel-studio", icon: Clapperboard },
      { key: "video_studio", label: "Video Studio", href: "/video-studio", icon: Film },
      { key: "content", label: "Content Factory", href: "/content", icon: Factory },
      { key: "review", label: "Creative Review", href: "/review", icon: CheckSquare, badge: 3, badgeTone: "orange" },
    ],
  },
  {
    header: "Publishing Engine",
    items: [
      { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
      { key: "publishing", label: "Publishing", href: "/publishing", icon: Send },
      { key: "blog", label: "Blog", href: "/blog", icon: Newspaper },
    ],
  },
  {
    header: "Team",
    items: [
      { key: "board", label: "Board", href: "/board", icon: KanbanSquare },
    ],
  },
  {
    header: "Insight",
    items: [
      { key: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3 },
      { key: "intelligence", label: "Intelligence", href: "/intelligence", icon: BrainCircuit },
      { key: "settings", label: "Settings", href: "/settings", icon: Settings },
      { key: "channels", label: "Channels", href: "/settings/channels", icon: Share2 },
      { key: "team", label: "Team & access", href: "/settings/team", icon: Users },
      { key: "platform", label: "Platform", href: "/settings/platform", icon: Activity },
      { key: "manual", label: "User Manual", href: "/manual", icon: BookOpen },
    ],
  },
];

interface SidebarProps {
  currentOrg: Organization;
  organizations: { organization: Organization; role: OrgRole }[];
  currentBrand: Brand | null;
  brands: Brand[];
  userRole: OrgRole;
  features: { feature: string; level: string }[];
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  currentOrg,
  organizations,
  currentBrand,
  brands,
  userRole,
  features,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sp-sidebar-pinned");
    if (saved !== null) {
      setPinned(saved === "true");
    }
  }, []);

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    localStorage.setItem("sp-sidebar-pinned", String(next));
  };

  const isExpanded = pinned || hovered;

  // Filter navigation items by user role and permissions
  const filteredGroups = NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => {
      if (item.key === "dashboard" || item.key === "manual") return true;
      if (item.key === "team" || item.key === "settings" || item.key === "platform" || item.key === "channels") {
        return userRole === "owner" || userRole === "admin";
      }
      const match = features.find((f) => f.feature === item.key);
      return !match || match.level !== "none";
    });
    return { ...group, items };
  }).filter((g) => g.items.length > 0);

  const sidebarContent = (
    <div className="flex flex-col h-full select-none">
      {/* Top Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-border/40">
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-sm text-primary flex-shrink-0 shadow-sm">
            S
          </div>
          {isExpanded && (
            <div className="min-w-0 animate-in fade-in duration-200">
              <span className="font-bold tracking-tight text-foreground text-sm flex items-center gap-1.5">
                ScalePods <span className="text-primary italic font-serif text-xs">Growth OS</span>
              </span>
            </div>
          )}
        </Link>

        {isExpanded && (
          <button
            onClick={togglePin}
            title={pinned ? "Collapse to icon rail" : "Pin sidebar open"}
            className="hidden md:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-fill-tertiary transition-colors"
          >
            {pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Mobile Close Button */}
        <button
          onClick={onMobileClose}
          className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-fill-tertiary"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Switchers Region */}
      <div className="p-3 space-y-2 border-b border-border/40">
        <WorkspaceSwitcher
          currentOrg={currentOrg}
          organizations={organizations}
          collapsed={!isExpanded}
        />
        <BrandSwitcher
          currentBrand={currentBrand}
          brands={brands}
          collapsed={!isExpanded}
        />
      </div>

      {/* Scrolling Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5 scrollbar-thin">
        {filteredGroups.map((group) => (
          <div key={group.header} className="space-y-1">
            {isExpanded && (
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 py-1">
                {group.header}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    title={!isExpanded ? item.label : undefined}
                    className={clsx(
                      "nav-item group relative",
                      active && "active",
                      !isExpanded && "justify-center px-0 py-2.5"
                    )}
                  >
                    <Icon className={clsx("w-4 h-4 flex-shrink-0", active ? "text-ctaText" : "text-muted-foreground group-hover:text-foreground")} />
                    {isExpanded && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}

                    {/* Badge */}
                    {item.badge && isExpanded && (
                      <span
                        className={clsx(
                          "px-1.5 py-0.2 rounded-md text-[10px] font-bold",
                          item.badgeTone === "orange"
                            ? "bg-destructive/20 text-destructive border border-destructive/30"
                            : "bg-primary/20 text-primary border border-primary/30"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.badge && !isExpanded && (
                      <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-destructive" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Pill Status */}
      {isExpanded && (
        <div className="p-3 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            SaaS Core Live
          </span>
          <span className="font-mono text-[10px]">v0.2.0</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        onMouseEnter={() => !pinned && setHovered(true)}
        onMouseLeave={() => !pinned && setHovered(false)}
        className={clsx(
          "sidebar hidden md:block sticky top-0 h-screen z-30 transition-all duration-200",
          isExpanded ? "w-64" : "w-[72px]"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Only rendered in DOM when mobileOpen is true) */}
      {mobileOpen && (
        <>
          <div
            onClick={onMobileClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
          />
          <aside
            className="fixed top-0 bottom-0 left-0 w-72 bg-card border-r border-border z-50 md:hidden shadow-2xl animate-in slide-in-from-left duration-200"
          >
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
