"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { signup, type AuthActionResult } from "@/app/auth/actions";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { GoogleButton } from "@/components/GoogleButton";
import { Sparkles, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[320px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[220px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md p-8 md:p-10 rounded-3xl border border-glass-border bg-card/90 shadow-2xl backdrop-blur-xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/15 to-primary/30 text-primary mb-4 border border-primary/30 shadow-md ring-4 ring-primary/5">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">Get started</h1>
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
        <GoogleButton />

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

          <TurnstileWidget resetSignal={state} />

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
