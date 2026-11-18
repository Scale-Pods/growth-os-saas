"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createOrganizationAction, type AuthActionResult } from "@/app/auth/actions";
import { Building2, AlertCircle, ArrowRight } from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-sm shadow-md"
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin"></span>
          Creating workspace...
        </span>
      ) : (
        <>
          Create Workspace & Continue <ArrowRight className="w-4 h-4" />
        </>
      )}
    </button>
  );
}

export function WorkspaceCreationCard({ userEmail }: { userEmail: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [manualSlug, setManualSlug] = useState(false);

  const [state, formAction] = useFormState<AuthActionResult, FormData>(
    createOrganizationAction,
    {}
  );

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!manualSlug) {
      const generated = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(generated);
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualSlug(true);
    setSlug(
      e.target.value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-lg p-8 rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4 border border-primary/20">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Create your workspace
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Signed in as <strong>{userEmail}</strong>. Each workspace acts as an isolated tenant with its own brands, permissions, and team.
          </p>
        </div>

        {state?.error && (
          <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Workspace / Organization Name
            </label>
            <input
              type="text"
              name="name"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Acme Marketing"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Workspace Slug (URL-friendly identifier)
            </label>
            <div className="flex items-center">
              <span className="px-3.5 py-2.5 rounded-l-xl border border-r-0 border-border bg-panel/50 text-muted-foreground text-sm font-mono select-none">
                app.growth-os.com/
              </span>
              <input
                type="text"
                name="slug"
                required
                value={slug}
                onChange={handleSlugChange}
                placeholder="acme-marketing"
                className="w-full px-3.5 py-2.5 rounded-r-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm font-mono transition-all"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Unique identifier used for tenant isolation and subdomains.
            </p>
          </div>

          <div className="pt-3">
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
