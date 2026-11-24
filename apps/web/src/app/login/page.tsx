"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, type AuthActionResult } from "@/app/auth/actions";
import { Sparkles, AlertCircle, ArrowRight } from "lucide-react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { GoogleButton } from "@/components/GoogleButton";
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
          Signing in...
        </span>
      ) : (
        <>
          Sign In <ArrowRight className="w-4 h-4" />
        </>
      )}
    </button>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const callbackError = searchParams.get("error");

  const [state, formAction] = useActionState<AuthActionResult, FormData>(login, {});

  return (
    <div className="w-full max-w-md p-8 md:p-10 rounded-3xl border border-glass-border bg-card/90 shadow-2xl backdrop-blur-xl relative z-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/15 to-primary/30 text-primary mb-4 border border-primary/30 shadow-md ring-4 ring-primary/5">
          <Sparkles className="w-7 h-7" />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">Welcome back</h1>
        <p className="text-muted-foreground text-sm mt-1.5">
          Sign in to access your Growth OS workspace
        </p>
      </div>

      {/* Global Errors */}
      {callbackError && (
        <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Authentication link expired or invalid. Please sign in with your password.</span>
        </div>
      )}

      {state?.error && (
        <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <GoogleButton next={redirectTo} />

      {/* Form */}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

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
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-muted-foreground">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline font-medium transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
          />
        </div>

        <TurnstileWidget resetSignal={state} />

        <div className="pt-2">
          <SubmitButton />
        </div>
      </form>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-primary hover:underline font-medium transition-colors"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[320px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[220px] bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating Theme Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 rounded-3xl border border-border bg-card text-center text-muted-foreground text-sm">
            Loading...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
