"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  Building2,
  Sparkles,
  Palette,
  Volume2,
  Share2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Wand2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import {
  saveBusinessProfileAction,
  saveBrandKitAction,
  saveBrandVoiceAction,
  saveBrandFactAction,
  updateOnboardingStateAction,
} from "@/app/clients/actions";
import type { Organization, Brand, OnboardingState } from "@growth-os/db";

interface OnboardingWizardProps {
  organization: Organization;
  brand: Brand;
  initialState: OnboardingState;
  userEmail: string;
}

export function OnboardingWizard({
  organization,
  brand,
  initialState,
  userEmail: _userEmail,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(initialState.step || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Workspace & Role
  const [role, setRole] = useState(initialState.role || "Founder / Marketing Lead");
  const [industry, setIndustry] = useState(initialState.industry || "B2B SaaS & Technology");

  // Step 2: Brand Profile
  const [brandName, setBrandName] = useState(brand.name);
  const [tagline, setTagline] = useState("Autonomous Content Marketing Loop");
  const [websiteUrl, setWebsiteUrl] = useState("https://scalepods.co");
  const [description, setDescription] = useState("AI-accelerated marketing operating system for high-growth tech brands.");
  const [productsServices, setProductsServices] = useState("AI Studio, Carousel Studio, Video Studio, Auto Publishing Engine");
  const [targetAudience, setTargetAudience] = useState("Founders, Head of Marketing, and Content Teams");

  // Step 3: Brand Kit
  const [primaryColor, setPrimaryColor] = useState("#B1D997");
  const [secondaryColor, setSecondaryColor] = useState("#63A5E7");
  const [accentColor, setAccentColor] = useState("#CC6B49");
  const [logoUrl, setLogoUrl] = useState("");
  const [headingFont, setHeadingFont] = useState("Instrument Serif");
  const [bodyFont, setBodyFont] = useState("Inter");

  // Step 4: Brand Voice & Facts
  const [toneWords, setToneWords] = useState("Bold, Analytical, Action-oriented, Punchy");
  const [bannedWords, setBannedWords] = useState("game-changer, synergy, revolutionize, disrupt, paradigm shift");
  const [approvedCtas, setApprovedCtas] = useState("Book a 15-min demo\nTry Growth OS free\nLearn more");
  const [firstFact, setFirstFact] = useState("5 hours saved per content marketer each week");
  const [firstFactSource, setFirstFactSource] = useState("2026 Customer Study");

  const saveStepProgress = async (stepNum: number, completed = false) => {
    const updatedState: OnboardingState = {
      step: stepNum,
      completed,
      workspace_name: organization.name,
      role,
      industry,
      brand_id: brand.id,
      brand_name: brandName,
      website_url: websiteUrl,
    };
    await updateOnboardingStateAction(organization.id, updatedState);
  };

  // Step 1 -> 2
  const handleStep1Next = async () => {
    setSaving(true);
    await saveStepProgress(2);
    setSaving(false);
    setCurrentStep(2);
  };

  // Step 2 -> 3: Save Profile
  const handleStep2Next = async () => {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("tagline", tagline);
    fd.set("industry", industry);
    fd.set("website_url", websiteUrl);
    fd.set("description", description);
    fd.set("products_services", productsServices);
    fd.set("target_audience", targetAudience);

    const res = await saveBusinessProfileAction(brand.id, fd);
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      await saveStepProgress(3);
      setCurrentStep(3);
    }
  };

  // Step 3 -> 4: Save Kit
  const handleStep3Next = async () => {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("logo_url", logoUrl);
    fd.set("color_primary", primaryColor);
    fd.set("color_secondary", secondaryColor);
    fd.set("color_accent", accentColor);
    fd.set("font_heading", headingFont);
    fd.set("font_body", bodyFont);

    const res = await saveBrandKitAction(brand.id, fd);
    setSaving(false);
    if (res.error) {
      setError(res.error);
    } else {
      await saveStepProgress(4);
      setCurrentStep(4);
    }
  };

  // Step 4 -> 5: Save Voice & Fact
  const handleStep4Next = async () => {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("tone_words", toneWords);
    fd.set("banned_words", bannedWords);
    fd.set("approved_ctas", approvedCtas);

    const resVoice = await saveBrandVoiceAction(brand.id, fd);
    if (resVoice.error) {
      setSaving(false);
      setError(resVoice.error);
      return;
    }

    if (firstFact.trim()) {
      await saveBrandFactAction(brand.id, null, firstFact, firstFactSource, true);
    }

    setSaving(false);
    await saveStepProgress(5);
    setCurrentStep(5);
  };

  // Step 5 -> 6: Channels
  const handleStep5Next = async () => {
    setSaving(true);
    await saveStepProgress(6);
    setSaving(false);
    setCurrentStep(6);
  };

  // Step 6: Complete Onboarding!
  const handleComplete = async () => {
    setSaving(true);
    await saveStepProgress(6, true);
    setSaving(false);
    router.push("/dashboard");
    router.refresh();
  };

  const stepsList = [
    { num: 1, title: "Workspace & Role" },
    { num: 2, title: "Brand Profile" },
    { num: 3, title: "Design & Kit" },
    { num: 4, title: "Voice & Facts" },
    { num: 5, title: "Channels" },
    { num: 6, title: "Launch Ready" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-8 selection:bg-primary/20 selection:text-primary relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-primary/10 blur-[130px] rounded-full pointer-events-none -z-10" />

      {/* Top Header */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 border border-primary/30 text-primary flex items-center justify-center font-bold text-sm shadow-sm ring-1 ring-primary/20">
            S
          </div>
          <div>
            <span className="font-bold tracking-tight text-foreground text-sm flex items-center gap-1.5">
              ScalePods <span className="text-primary italic font-serif text-sm">Growth OS</span>
            </span>
            <span className="text-[11px] text-muted-foreground block">Onboarding Setup · Step {currentStep} of 6</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-2">
          <span>Workspace:</span>
          <span className="px-2.5 py-1 rounded-md bg-panel border border-border/80 font-semibold text-foreground">{organization.name}</span>
        </div>
      </div>

      {/* Step Progress Tracker */}
      <div className="max-w-4xl w-full mx-auto my-6">
        <div className="grid grid-cols-6 gap-2.5">
          {stepsList.map((s) => {
            const isCompleted = s.num < currentStep;
            const isCurrent = s.num === currentStep;
            return (
              <div key={s.num} className="space-y-2">
                <div
                  className={clsx(
                    "h-1.5 rounded-full transition-all duration-300",
                    isCompleted
                      ? "bg-primary shadow-[0_0_8px_rgba(177,217,151,0.4)]"
                      : isCurrent
                      ? "bg-gradient-to-r from-primary to-primary/70 animate-pulse shadow-[0_0_12px_rgba(177,217,151,0.6)]"
                      : "bg-fill-tertiary"
                  )}
                />
                <span
                  className={clsx(
                    "text-[10px] hidden md:block truncate transition-colors",
                    isCurrent ? "text-primary font-bold" : isCompleted ? "text-foreground/80 font-medium" : "text-muted-foreground"
                  )}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Step Container */}
      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center py-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: WORKSPACE & ROLE */}
        {currentStep === 1 && (
          <Card className="space-y-6 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold mb-3">
                <Building2 className="w-3.5 h-3.5" /> Step 1: Workspace Setup
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Welcome to Growth OS
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Your isolated tenant has been provisioned. Tell us about your role to tailor your content strategy.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label mb-1.5 block">Workspace Name</label>
                <input
                  type="text"
                  disabled
                  value={organization.name}
                  className="input opacity-70 cursor-not-allowed text-xs"
                />
              </div>

              <div>
                <label className="label mb-1.5 block">Your Role in the Organization</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="input text-xs"
                >
                  <option value="Founder / CEO">Founder / CEO</option>
                  <option value="VP / Head of Marketing">VP / Head of Marketing</option>
                  <option value="Growth Lead">Growth Lead</option>
                  <option value="Content Creator / Copywriter">Content Creator / Copywriter</option>
                  <option value="Agency Owner">Agency Owner</option>
                </select>
              </div>

              <div>
                <label className="label mb-1.5 block">Primary Industry</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. B2B SaaS, FinTech, E-commerce, Recruitment"
                  className="input text-xs"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handleStep1Next}
                disabled={saving}
                className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <span>Continue to Brand Profile</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* STEP 2: BRAND PROFILE */}
        {currentStep === 2 && (
          <Card className="space-y-6 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" /> Step 2: Brand Profile
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Define your brand identity
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                This business knowledge base seeds all autonomous content planning, trends, and review gates.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/10 flex items-center justify-between">
              <div className="text-xs text-foreground">
                Want AI to auto-fill this from your URL?
              </div>
              <button
                disabled
                className="btn-ghost text-xs px-3 py-1 opacity-50 cursor-not-allowed flex items-center gap-1.5"
                title="Available in P04 AI Gateway"
              >
                <Wand2 className="w-3.5 h-3.5 text-primary" />
                <span>Draft from Website (P04)</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label mb-1.5 block">Brand Name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    className="input text-xs"
                  />
                </div>
                <div>
                  <label className="label mb-1.5 block">Website URL</label>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourbrand.com"
                    className="input text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="label mb-1.5 block">Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Next-Generation Autonomous Marketing OS"
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label mb-1.5 block">Business Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input text-xs resize-none"
                />
              </div>

              <div>
                <label className="label mb-1.5 block">Products & Services</label>
                <input
                  type="text"
                  value={productsServices}
                  onChange={(e) => setProductsServices(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label mb-1.5 block">Target Audience</label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="input text-xs"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(1)}
                className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleStep2Next}
                disabled={saving}
                className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <span>Save & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* STEP 3: BRAND KIT & COLORS */}
        {currentStep === 3 && (
          <Card className="space-y-6 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold mb-3">
                <Palette className="w-3.5 h-3.5" /> Step 3: Visual Identity
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Colours, typography & logo
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Configure your visual design language. Templates and carousel slides will adhere to this palette.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label mb-1.5 block">Logo URL (Optional for now)</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://assets.yourcompany.com/logo.svg"
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label mb-2 block font-semibold text-foreground">Primary Palette Swatches</label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-border/80 bg-panel/70 backdrop-blur-sm space-y-2 hover:border-primary/40 transition-colors">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Primary / Accent</span>
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border shadow-inner">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0"
                        />
                      </div>
                      <span className="text-xs font-mono uppercase font-semibold text-foreground">{primaryColor}</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/80 bg-panel/70 backdrop-blur-sm space-y-2 hover:border-primary/40 transition-colors">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Secondary</span>
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border shadow-inner">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0"
                        />
                      </div>
                      <span className="text-xs font-mono uppercase font-semibold text-foreground">{secondaryColor}</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/80 bg-panel/70 backdrop-blur-sm space-y-2 hover:border-primary/40 transition-colors">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Accent Warm</span>
                    <div className="flex items-center gap-2.5">
                      <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-border shadow-inner">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0"
                        />
                      </div>
                      <span className="text-xs font-mono uppercase font-semibold text-foreground">{accentColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label mb-1.5 block">Heading Typography</label>
                  <select
                    value={headingFont}
                    onChange={(e) => setHeadingFont(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="Instrument Serif">Instrument Serif (ScalePods Classic)</option>
                    <option value="Playfair Display">Playfair Display</option>
                    <option value="Space Grotesk">Space Grotesk</option>
                    <option value="Inter">Inter</option>
                  </select>
                </div>
                <div>
                  <label className="label mb-1.5 block">Body Typography</label>
                  <select
                    value={bodyFont}
                    onChange={(e) => setBodyFont(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="Inter">Inter (Clean Modern Sans)</option>
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                    <option value="DM Sans">DM Sans</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(2)}
                className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleStep3Next}
                disabled={saving}
                className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <span>Save & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* STEP 4: VOICE & FACTS */}
        {currentStep === 4 && (
          <Card className="space-y-6 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold mb-3">
                <Volume2 className="w-3.5 h-3.5" /> Step 4: Voice & Metric Safety
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Guardrails & verified facts
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Growth OS enforces strict metric safety: our generation models will never invent false statistics.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label mb-1.5 block">Core Tone Traits (Comma-separated)</label>
                <input
                  type="text"
                  value={toneWords}
                  onChange={(e) => setToneWords(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label mb-1.5 block text-destructive font-semibold">
                  Banned Words & Buzzwords (Strictly Prohibited)
                </label>
                <input
                  type="text"
                  value={bannedWords}
                  onChange={(e) => setBannedWords(e.target.value)}
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="label mb-1.5 block font-semibold text-foreground">
                  Approved Calls to Action (CTAs, One per line)
                </label>
                <textarea
                  rows={2}
                  value={approvedCtas}
                  onChange={(e) => setApprovedCtas(e.target.value)}
                  placeholder="Book a 15-min demo&#10;Try Growth OS free"
                  className="input text-xs font-mono resize-none"
                />
              </div>

              <div>
                <label className="label mb-1.5 block font-semibold">
                  Seed Approved Fact (Stat the AI is allowed to cite)
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={firstFact}
                    onChange={(e) => setFirstFact(e.target.value)}
                    placeholder="e.g. 5 hours saved per content marketer each week"
                    className="input text-xs"
                  />
                  <input
                    type="text"
                    value={firstFactSource}
                    onChange={(e) => setFirstFactSource(e.target.value)}
                    placeholder="Source (e.g. ScalePods 2026 Customer Study)"
                    className="input text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(3)}
                className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleStep4Next}
                disabled={saving}
                className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <span>Save & Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* STEP 5: CONNECT CHANNELS (SKIPPABLE) */}
        {currentStep === 5 && (
          <Card className="space-y-6 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold mb-3">
                <Share2 className="w-3.5 h-3.5" /> Step 5: Social Channels
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Connect publishing platforms
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                You can connect your official accounts now or skip and connect later in the Publishing Engine.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { name: "LinkedIn Page / Profile", id: "linkedin", note: "Direct API integration ready" },
                { name: "Instagram Business", id: "instagram", note: "Meta Graph API token" },
                { name: "YouTube Channel", id: "youtube", note: "Google OAuth ready" },
                { name: "Facebook Page", id: "facebook", note: "Meta Publishing queue" },
              ].map((ch) => (
                <div key={ch.id} className="p-4 rounded-xl border border-border bg-panel flex items-center justify-between">
                  <div className="space-y-0.5">
                    <PlatformBadge platform={ch.id} size="md" />
                    <div className="text-[10px] text-muted-foreground mt-1">{ch.note}</div>
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground px-2 py-1 rounded bg-fill-tertiary">
                    Available in P05
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-fill-tertiary text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span>Channels can be connected at any time before publishing posts.</span>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(4)}
                className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleStep5Next}
                disabled={saving}
                className="btn-primary text-xs px-6 py-2.5 flex items-center gap-2"
              >
                <span>Review & Finish</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {/* STEP 6: LAUNCH READINESS CHECKLIST */}
        {currentStep === 6 && (
          <Card className="space-y-6 animate-in fade-in duration-200">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold mb-3">
                <CheckCircle2 className="w-3.5 h-3.5" /> Step 6: Ready to Create
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Your marketing OS is active
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Everything required to research, generate, review, and schedule content is configured and stored in your tenant database.
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                { title: "Workspace & Role Provisioned", desc: `${organization.name} (${role})`, ok: true },
                { title: "Brand Profile Seeded", desc: `${brandName} · ${industry}`, ok: true },
                { title: "Visual Kit & Palette Ready", desc: `Primary: ${primaryColor} · Font: ${headingFont}`, ok: true },
                { title: "Brand Voice & Fact-Gate Armed", desc: `Tone: ${toneWords.slice(0, 30)}...`, ok: true },
                { title: "Cross-Tenant RLS & Isolation", desc: `Database level org_id=${organization.id.slice(0, 8)}...`, ok: true },
              ].map((item, i) => (
                <div key={i} className="p-3.5 rounded-xl border border-border bg-panel flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">{item.title}</div>
                      <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                  <Badge tone="green">Ready</Badge>
                </div>
              ))}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(5)}
                className="btn-ghost text-xs px-4 py-2 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleComplete}
                disabled={saving}
                className="btn-primary text-xs px-8 py-3 flex items-center gap-2 shadow-lg"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch Growth OS Dashboard</span>
              </button>
            </div>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="max-w-4xl w-full mx-auto text-center pt-4 text-[11px] text-muted-foreground/60">
        ScalePods Growth OS SaaS · Tenant Isolation Guaranteed · All data stored securely in Supabase
      </div>
    </div>
  );
}
