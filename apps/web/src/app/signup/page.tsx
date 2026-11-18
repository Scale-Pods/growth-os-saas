"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { signup, type AuthActionResult } from "@/app/auth/actions";
import { Sparkles, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

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
          Creating account...
        </span>
      ) : (
        <>
          Create Account <ArrowRight className="w-4 h-4" />
        </>
      )}
    </button>
  );
}

export default function SignupPage() {
  const [state, formAction] = useActionState<AuthActionResult, FormData>(signup, {});

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4 border border-primary/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Get started</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Create your account to start managing your marketing Growth OS
          </p>
        </div>

        {/* Global Errors / Success */}
        {state?.error && (
          <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        {state?.success && (
          <div className="mb-6 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{state.success}</span>
          </div>
        )}

        {/* Form */}
        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              name="fullName"
              required
              autoComplete="name"
              placeholder="Jane Doe"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Work Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="name@company.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Password (min. 10 characters)
            </label>
            <input
              type="password"
              name="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Must be at least 10 characters for SaaS security compliance.
            </p>
          </div>

          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-primary hover:underline font-medium transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
