"use client";

import { Menu, Bell, ShieldCheck, LogOut, Coins } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { logout } from "@/app/auth/actions";
import type { Organization, Brand, Profile, OrgRole } from "@growth-os/db";

interface TopBarProps {
  currentOrg: Organization;
  currentBrand: Brand | null;
  profile: Profile | null;
  userEmail?: string;
  userRole: OrgRole;
  onMobileOpen: () => void;
}

export function TopBar({
  currentOrg,
  currentBrand,
  profile,
  userEmail,
  userRole,
  onMobileOpen,
}: TopBarProps) {
  const displayName = profile?.full_name || userEmail || "Marketer";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 h-[69px] border-b border-border/60 bg-card/75 backdrop-blur-xl px-4 md:px-8 flex items-center justify-between transition-colors">
      {/* Left: Mobile Toggle & Context */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileOpen}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-fill-tertiary transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[200px]">
            {currentOrg.name}
          </span>
          {currentBrand && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground truncate max-w-[120px] sm:max-w-[180px]">
                {currentBrand.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: Actions, Badges & Profile */}
      <div className="flex items-center gap-2.5 sm:gap-4">
        {/* Credits Pill */}
        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold">
          <Coins className="w-3.5 h-3.5" />
          <span>200 Credits</span>
        </div>

        {/* Notifications Bell */}
        <button
          title="Notifications"
          className="relative w-9 h-9 rounded-lg flex items-center justify-center border border-border/80 bg-panel text-muted-foreground hover:text-foreground hover:bg-fill-secondary transition-all"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive animate-pulse" />
        </button>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* User Capsule */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-border/60">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
            {initials}
          </div>

          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-foreground truncate max-w-[120px]">
              {displayName}
            </div>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 capitalize">
              <ShieldCheck className="w-3 h-3 text-primary" />
              {userRole}
            </div>
          </div>

          {/* Logout */}
          <form action={logout}>
            <button
              type="submit"
              title="Sign Out"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
