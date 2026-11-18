"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { Organization, Brand, Profile, OrgRole } from "@growth-os/db";

interface AppShellProps {
  currentOrg: Organization;
  organizations: { organization: Organization; role: OrgRole }[];
  currentBrand: Brand | null;
  brands: Brand[];
  profile: Profile | null;
  userEmail?: string;
  userRole: OrgRole;
  features: { feature: string; level: string }[];
  children: React.ReactNode;
}

export function AppShell({
  currentOrg,
  organizations,
  currentBrand,
  brands,
  profile,
  userEmail,
  userRole,
  features,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background text-foreground transition-colors">
      {/* Sidebar */}
      <Sidebar
        currentOrg={currentOrg}
        organizations={organizations}
        currentBrand={currentBrand}
        brands={brands}
        userRole={userRole}
        features={features}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          currentOrg={currentOrg}
          currentBrand={currentBrand}
          profile={profile}
          userEmail={userEmail}
          userRole={userRole}
          onMobileOpen={() => setMobileOpen(true)}
        />

        <main className="flex-1 max-w-[1680px] w-full mx-auto p-4 md:p-8 space-y-8">
          {children}
        </main>
      </div>
    </div>
  );
}
