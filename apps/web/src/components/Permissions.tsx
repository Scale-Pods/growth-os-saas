"use client";

import { createContext, useContext, useMemo } from "react";
import type { OrgRole } from "@growth-os/db";

export type Level = "none" | "view" | "edit" | "full";
const RANK: Record<Level, number> = { none: 0, view: 1, edit: 2, full: 3 };

interface PermissionState {
  role: OrgRole;
  levels: Record<string, Level>;
}

const PermissionContext = createContext<PermissionState | null>(null);

export function PermissionsProvider({
  role,
  features,
  children,
}: {
  role: OrgRole;
  features: { feature: string; level: string }[];
  children: React.ReactNode;
}) {
  const value = useMemo<PermissionState>(() => {
    const levels: Record<string, Level> = {};
    for (const f of features) levels[f.feature] = (f.level as Level) in RANK ? (f.level as Level) : "none";
    return { role, levels };
  }, [role, features]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

/**
 * Courtesy check for the UI only. The server and the database decide for real.
 * Returns whether the member has at least `level` on `feature`, plus a reason to show when disabled.
 */
export function useCan(feature: string, level: Exclude<Level, "none"> = "view") {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error("useCan must be used inside <PermissionsProvider>");
  const have: Level = ctx.role === "owner" || ctx.role === "admin" ? "full" : (ctx.levels[feature] ?? "view");
  const allowed = RANK[have] >= RANK[level];
  return {
    allowed,
    reason: allowed
      ? null
      : `You need ${level === "full" ? "Full" : level === "edit" ? "Edit" : "View"} access to ${feature.replace(/_/g, " ")}. An admin can grant it in Team & access.`,
  };
}
