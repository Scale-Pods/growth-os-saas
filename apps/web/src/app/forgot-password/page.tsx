"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { TurnstileWidget } from "@/components/TurnstileWidget";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      // TODO(claude): server action for password reset email request
      await new Promise((resolve) => setTimeout(resolve, 800));
      setSuccess(true);
    } catch {
      setError("Unable to process reset request. Please try again later.");
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
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Forgot password</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            Enter your work email and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        {/* Success or Error banners */}
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
                <div className="font-semibold text-foreground">Reset link dispatched</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  If an account exists for <span className="font-medium text-foreground">{email}</span>, you will receive an email shortly with reset instructions.
                </div>
              </div>
            </div>

            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-panel text-foreground border border-border font-medium hover:bg-fill-secondary transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to sign in</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="name@company.com"
                  className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-border bg-panel text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
                />
                <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <TurnstileWidget />

            <div className="pt-2">
              <button
                type="submit"
                disabled={pending || !email}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50 text-sm shadow-md"
              >
                {pending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    Sending link...
                  </span>
                ) : (
                  <>
                    Send reset link <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            <div className="mt-6 text-center text-xs text-muted-foreground pt-4 border-t border-border/40">
              Remember your password?{" "}
              <Link
                href="/login"
                className="text-primary hover:underline font-medium transition-colors"
              >
                Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
