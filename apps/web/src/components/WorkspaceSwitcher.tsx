"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, Plus } from "lucide-react";
import type { Organization, OrgRole } from "@growth-os/db";

interface WorkspaceSwitcherProps {
  currentOrg: Organization;
  organizations: { organization: Organization; role: OrgRole }[];
  collapsed?: boolean;
}

export function WorkspaceSwitcher({
  currentOrg,
  organizations,
  collapsed,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchWorkspace = (orgId: string) => {
    document.cookie = `active_org_id=${orgId}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  };

  if (collapsed) {
    return (
      <div className="relative flex justify-center py-2" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          title={`Active Workspace: ${currentOrg.name}`}
          className="w-10 h-10 rounded-xl bg-panel border border-border flex items-center justify-center text-primary hover:border-primary/50 transition-colors"
        >
          <Building2 className="w-5 h-5" />
        </button>

        {open && (
          <div className="absolute left-14 top-0 w-64 p-2 rounded-2xl border border-glass-border bg-card shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              Workspaces ({organizations.length})
            </div>
            <div className="py-1 max-h-56 overflow-y-auto space-y-1">
              {organizations.map(({ organization: org, role }) => (
                <button
                  key={org.id}
                  onClick={() => {
                    switchWorkspace(org.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-fill-tertiary text-left text-xs transition-colors"
                >
                  <div className="truncate">
                    <div className="font-medium text-foreground truncate">{org.name}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{role}</div>
                  </div>
                  {org.id === currentOrg.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-border/60">
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-primary hover:bg-primary/10 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Workspace</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-panel hover:bg-fill-tertiary text-left transition-all group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/25 text-primary flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {currentOrg.name}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {currentOrg.slug}.growthos
            </div>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 p-2 rounded-2xl border border-glass-border bg-card shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
            Select Workspace
          </div>
          <div className="py-1 max-h-56 overflow-y-auto space-y-1">
            {organizations.map(({ organization: org, role }) => (
              <button
                key={org.id}
                onClick={() => {
                  switchWorkspace(org.id);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-fill-tertiary text-left text-xs transition-colors"
              >
                <div className="truncate">
                  <div className="font-medium text-foreground truncate">{org.name}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">Role: {role}</div>
                </div>
                {org.id === currentOrg.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
          <div className="pt-2 border-t border-border/60">
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 p-2 rounded-lg text-primary hover:bg-primary/10 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Workspace</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
