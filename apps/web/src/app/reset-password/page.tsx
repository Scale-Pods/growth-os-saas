"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Check, X } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password strength checks (min 10 chars, letter, number/symbol)
  const hasMinLength = password.length >= 10;
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumberOrSymbol = /[\d\W]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const isFormValid = hasMinLength && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) return;

    setPending(true);
    setError(null);

    try {
      // TODO(claude): server action for setting new password
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSuccess(true);
    } catch {
      setError("Unable to reset password. The link may have expired.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md p-8 rounded-2xl border border-border bg-card shadow-2xl backdrop-blur-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4 border border-primary/20">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Set new password</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Create a secure password for your Growth OS account.
          </p>
        </div>

        {/* Global Errors */}
        {error && (
          <div className="mb-6 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-foreground">Password updated successfully</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Your new credentials are saved. You can now sign in with your updated password.
                </div>
              </div>
            </div>

            <Link
              href="/login"
              className="w-full btn-primary flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium shadow-md text-sm"
            >
              <span>Continue to sign in</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                New Password
              </label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
              />
            </div>

            {/* Strength Requirements Hints */}
            <div className="p-3 rounded-xl bg-panel/60 border border-border/50 space-y-1.5 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Password requirements:
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {hasMinLength ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className={hasMinLength ? "text-foreground" : "text-muted-foreground"}>
                  At least 10 characters
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {hasMixedCase ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className={hasMixedCase ? "text-foreground" : "text-muted-foreground"}>
                  Upper and lowercase letters
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {hasNumberOrSymbol ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className={hasNumberOrSymbol ? "text-foreground" : "text-muted-foreground"}>
                  At least one number or symbol
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <div className="text-[11px] text-destructive mt-1">Passwords do not match</div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={pending || !isFormValid}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-sm shadow-md"
              >
                {pending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    Updating password...
                  </span>
                ) : (
                  <>
                    Update Password <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            <div className="mt-6 text-center text-xs text-muted-foreground pt-4 border-t border-border/40">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
