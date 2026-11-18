"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { login, type AuthActionResult } from "@/app/auth/actions";
import { Sparkles, AlertCircle, ArrowRight } from "lucide-react";

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
    <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-sm">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4 border border-primary/20">
          <Sparkles className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card text-center text-muted-foreground text-sm">
            Loading...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
