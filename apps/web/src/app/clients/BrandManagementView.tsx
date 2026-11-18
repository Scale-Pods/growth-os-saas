"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  Building2,
  Sparkles,
  Palette,
  Volume2,
  CheckCircle2,
  Columns3,
  Users2,
  Layers,
  Plus,
  Trash2,
  ExternalLink,
  Save,
  Check,
  AlertCircle,
  Eye,
  Type,
  ShieldCheck,
  Share2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import {
  saveBusinessProfileAction,
  saveBrandKitAction,
  saveBrandVoiceAction,
  saveBrandFactAction,
  deleteBrandFactAction,
  saveBrandPillarAction,
  deleteBrandPillarAction,
  saveCompetitorAction,
  deleteCompetitorAction,
  createBrandAction,
  switchBrandAction,
} from "./actions";
import type {
  Brand,
  BrandProfile,
  BrandKit,
  BrandVoice,
  BrandFact,
  BrandPillar,
  Competitor,
  Organization,
  OrgRole,
} from "@growth-os/db";

interface BrandManagementViewProps {
  currentOrg: Organization;
  currentBrand: Brand;
  brands: Brand[];
  profile: BrandProfile | null;
  kit: BrandKit | null;
  voice: BrandVoice | null;
  facts: BrandFact[];
  pillars: BrandPillar[];
  competitors: Competitor[];
  userRole: OrgRole;
}

type TabKey =
  | "profile"
  | "kit"
  | "voice"
  | "facts"
  | "pillars"
  | "competitors"
  | "brands";

export function BrandManagementView({
  currentOrg,
  currentBrand,
  brands,
  profile: initialProfile,
  kit: initialKit,
  voice: initialVoice,
  facts: initialFacts,
  pillars: initialPillars,
  competitors: initialCompetitors,
  userRole,
}: BrandManagementViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [previewPlatform, setPreviewPlatform] = useState<"linkedin" | "instagram">("linkedin");
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Local state for dynamic lists
  const [facts, setFacts] = useState(initialFacts);
  const [pillars, setPillars] = useState(initialPillars);
  const [competitors, setCompetitors] = useState(initialCompetitors);

  // Forms dynamic fields
  const [toneInput, setToneInput] = useState(initialVoice?.tone_words?.join(", ") || "Bold, Analytical, Action-oriented");
  const [bannedInput, setBannedInput] = useState(initialVoice?.banned_words?.join(", ") || "game-changer, synergy, disrupt, revolutionize");
  const [ctasInput, setCtasInput] = useState(initialVoice?.approved_ctas?.join("\n") || "Book a 15-min strategy call\nGet started with Growth OS\nLearn more");
  const [hashtagsInput, setHashtagsInput] = useState(initialVoice?.preferred_hashtags?.join(", ") || "#GrowthOS, #ScalePods, #B2BMarketing");

  // New Fact inputs
  const [newFactStatement, setNewFactStatement] = useState("");
  const [newFactSource, setNewFactSource] = useState("");

  // New Pillar inputs
  const [newPillarName, setNewPillarName] = useState("");
  const [newPillarDesc, setNewPillarDesc] = useState("");
  const [newPillarShare, setNewPillarShare] = useState(25);

  // New Competitor inputs
  const [newCompName, setNewCompName] = useState("");
  const [newCompUrl, setNewCompUrl] = useState("");
  const [newCompNotes, setNewCompNotes] = useState("");

  // New Brand modal
  const [newBrandName, setNewBrandName] = useState("");
  const [showNewBrandModal, setShowNewBrandModal] = useState(false);

  // Color Kit state
  const [primaryColor, setPrimaryColor] = useState(initialKit?.colors?.primary || "#B1D997");
  const [secondaryColor, setSecondaryColor] = useState(initialKit?.colors?.secondary || "#63A5E7");
  const [accentColor, setAccentColor] = useState(initialKit?.colors?.accent || "#CC6B49");
  const [headingFont, setHeadingFont] = useState(initialKit?.fonts?.heading || "Instrument Serif");
  const [bodyFont, setBodyFont] = useState(initialKit?.fonts?.body || "Inter");

  const showBanner = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  // 1. Save Profile
  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await saveBusinessProfileAction(currentBrand.id, fd);
    setSaving(false);
    if (res.error) showBanner("error", res.error);
    else showBanner("success", "Business Profile saved successfully.");
  };

  // 2. Save Brand Kit
  const handleSaveKit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    fd.set("color_primary", primaryColor);
    fd.set("color_secondary", secondaryColor);
    fd.set("color_accent", accentColor);
    fd.set("font_heading", headingFont);
    fd.set("font_body", bodyFont);
    const res = await saveBrandKitAction(currentBrand.id, fd);
    setSaving(false);
    if (res.error) showBanner("error", res.error);
    else showBanner("success", "Visual Identity & Brand Kit saved.");
  };

  // 3. Save Voice
  const handleSaveVoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    fd.set("tone_words", toneInput);
    fd.set("banned_words", bannedInput);
    fd.set("approved_ctas", ctasInput);
    fd.set("preferred_hashtags", hashtagsInput);
    const res = await saveBrandVoiceAction(currentBrand.id, fd);
    setSaving(false);
    if (res.error) showBanner("error", res.error);
    else showBanner("success", "Brand Voice & Guidelines saved.");
  };

  // 4. Add Fact
  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFactStatement.trim()) return;
    setSaving(true);
    const res = await saveBrandFactAction(currentBrand.id, null, newFactStatement, newFactSource, true);
    setSaving(false);
    if (res.error) {
      showBanner("error", res.error);
    } else if (res.data) {
      setFacts([res.data, ...facts]);
      setNewFactStatement("");
      setNewFactSource("");
      showBanner("success", "Approved Fact added.");
    }
  };

  const handleDeleteFact = async (id: string) => {
    const res = await deleteBrandFactAction(currentBrand.id, id);
    if (res.error) showBanner("error", res.error);
    else setFacts(facts.filter((f) => f.id !== id));
  };

  // 5. Add Pillar
  const handleAddPillar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPillarName.trim()) return;
    setSaving(true);
    const res = await saveBrandPillarAction(currentBrand.id, null, newPillarName, newPillarDesc, newPillarShare);
    setSaving(false);
    if (res.error) {
      showBanner("error", res.error);
    } else if (res.data) {
      setPillars([...pillars, res.data]);
      setNewPillarName("");
      setNewPillarDesc("");
      showBanner("success", "Content Pillar added.");
    }
  };

  const handleDeletePillar = async (id: string) => {
    const res = await deleteBrandPillarAction(currentBrand.id, id);
    if (res.error) showBanner("error", res.error);
    else setPillars(pillars.filter((p) => p.id !== id));
  };

  // 6. Add Competitor
  const handleAddCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) return;
    setSaving(true);
    const res = await saveCompetitorAction(currentBrand.id, null, newCompName, newCompUrl, newCompNotes);
    setSaving(false);
    if (res.error) {
      showBanner("error", res.error);
    } else if (res.data) {
      setCompetitors([...competitors, res.data]);
      setNewCompName("");
      setNewCompUrl("");
      setNewCompNotes("");
      showBanner("success", "Competitor tracked.");
    }
  };

  const handleDeleteCompetitor = async (id: string) => {
    const res = await deleteCompetitorAction(currentBrand.id, id);
    if (res.error) showBanner("error", res.error);
    else setCompetitors(competitors.filter((c) => c.id !== id));
  };

  // 7. Create Brand
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;
    setSaving(true);
    const res = await createBrandAction(currentOrg.id, newBrandName);
    setSaving(false);
    if (res.error) {
      showBanner("error", res.error);
    } else {
      setShowNewBrandModal(false);
      setNewBrandName("");
      showBanner("success", `Brand "${res.data?.name}" created successfully.`);
      window.location.reload();
    }
  };

  // Total pillar percentage
  const totalPillarPct = pillars.reduce((sum, p) => sum + p.target_share_pct, 0);

  return (
    <div className="space-y-6">
      {/* Status Alert Banner */}
      {statusMessage && (
        <div
          className={clsx(
            "p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all animate-in fade-in duration-200",
            statusMessage.type === "success"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === "success" ? (
              <Check className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        </div>
      )}

      {/* Brand Top Bar & Switcher Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 text-primary flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
            {currentBrand.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground">
                {currentBrand.name}
              </span>
              <Badge tone="green">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Active Brand
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Workspace: <span className="font-semibold text-foreground">{currentOrg.name}</span> · Plan:{" "}
              <span className="capitalize text-primary font-mono text-[11px]">{currentOrg.plan_id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Switcher if multiple brands */}
          {brands.length > 1 && (
            <select
              value={currentBrand.id}
              onChange={(e) => switchBrandAction(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-panel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.id === currentBrand.id ? "(Current)" : ""}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowNewBrandModal(true)}
            className="btn-ghost text-xs px-3 py-2 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Add Brand</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation Pill Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin border-b border-border/40">
        {[
          { key: "profile", label: "Profile & Audience", icon: Building2 },
          { key: "kit", label: "Logo & Visual Kit", icon: Palette },
          { key: "voice", label: "Voice & Tone", icon: Volume2 },
          { key: "facts", label: `Approved Facts (${facts.length})`, icon: CheckCircle2 },
          { key: "pillars", label: `Pillars (${pillars.length})`, icon: Columns3 },
          { key: "competitors", label: `Competitors (${competitors.length})`, icon: Users2 },
          { key: "brands", label: `All Brands (${brands.length})`, icon: Layers },
        ].map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as TabKey)}
              className={clsx(
                "px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all",
                active
                  ? "bg-primary text-ctaText shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-fill-tertiary"
              )}
            >
              <Icon className={clsx("w-3.5 h-3.5", active ? "text-ctaText" : "text-muted-foreground")} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Grid: Form Tab (Left) + Live Post Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        {/* Left Column: Active Tab Content */}
        <div className="space-y-6">
          {/* TAB 1: BUSINESS PROFILE & AUDIENCE */}
          {activeTab === "profile" && (
            <Card className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Business Profile & Target Audience</h2>
                <p className="text-xs text-muted-foreground">
                  Foundational company knowledge that seeds all strategy, trend matching, and copy generation.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label mb-1.5 block">Brand Name</label>
                    <input
                      type="text"
                      disabled
                      value={currentBrand.name}
                      className="input opacity-60 cursor-not-allowed text-xs"
                    />
                  </div>
                  <div>
                    <label className="label mb-1.5 block">Tagline / Motto</label>
                    <input
                      type="text"
                      name="tagline"
                      defaultValue={initialProfile?.tagline || ""}
                      placeholder="e.g. Autonomous Content Engine for B2B"
                      className="input text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label mb-1.5 block">Industry / Niche</label>
                    <input
                      type="text"
                      name="industry"
                      defaultValue={initialProfile?.industry || ""}
                      placeholder="e.g. AI SaaS, Logistics, Healthcare"
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="label mb-1.5 block">Official Website</label>
                    <input
                      type="url"
                      name="website_url"
                      defaultValue={initialProfile?.website_url || ""}
                      placeholder="https://yourcompany.com"
                      className="input text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="label mb-1.5 block">Business Description</label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={initialProfile?.description || ""}
                    placeholder="Describe what your company does, core value proposition, and problems solved..."
                    className="input text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="label mb-1.5 block">Products & Services</label>
                  <textarea
                    name="products_services"
                    rows={2}
                    defaultValue={initialProfile?.products_services || ""}
                    placeholder="List flagship solutions, tiers, pricing models, or core offerings..."
                    className="input text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="label mb-1.5 block">Target Audience & Ideal Customer Profile (ICP)</label>
                  <textarea
                    name="target_audience"
                    rows={2}
                    defaultValue={initialProfile?.target_audience || ""}
                    placeholder="e.g. B2B SaaS Founders, VP Marketing, Content Creators with $5M-$50M ARR..."
                    className="input text-xs resize-none"
                  />
                </div>

                <div>
                  <label className="label mb-1.5 block">Business Goals</label>
                  <input
                    type="text"
                    name="goals"
                    defaultValue={initialProfile?.goals || ""}
                    placeholder="e.g. Drive 50 qualified inbound demo calls/month via LinkedIn and Instagram"
                    className="input text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label mb-1.5 block">Contact Email</label>
                    <input
                      type="email"
                      name="contact_email"
                      defaultValue={initialProfile?.contact_email || ""}
                      placeholder="contact@yourbrand.com"
                      className="input text-xs"
                    />
                  </div>
                  <div>
                    <label className="label mb-1.5 block">Contact Phone</label>
                    <input
                      type="text"
                      name="contact_phone"
                      defaultValue={initialProfile?.contact_phone || ""}
                      placeholder="+1 (555) 019-2834"
                      className="input text-xs"
                    />
                  </div>
                </div>

                {/* Social Handles */}
                <div>
                  <label className="label mb-2 block font-semibold">Social Channels & Official Handles</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      name="social_linkedin"
                      defaultValue={initialProfile?.social_urls?.linkedin || ""}
                      placeholder="LinkedIn URL"
                      className="input text-xs"
                    />
                    <input
                      type="text"
                      name="social_instagram"
                      defaultValue={initialProfile?.social_urls?.instagram || ""}
                      placeholder="Instagram URL"
                      className="input text-xs"
                    />
                    <input
                      type="text"
                      name="social_twitter"
                      defaultValue={initialProfile?.social_urls?.twitter || ""}
                      placeholder="Twitter / X URL"
                      className="input text-xs"
                    />
                    <input
                      type="text"
                      name="social_youtube"
                      defaultValue={initialProfile?.social_urls?.youtube || ""}
                      placeholder="YouTube Channel URL"
                      className="input text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary text-xs px-5 py-2.5">
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? "Saving Profile..." : "Save Business Profile"}</span>
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 2: BRAND KIT & VISUAL IDENTITY */}
          {activeTab === "kit" && (
            <Card className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Visual Identity & Design Kit</h2>
                <p className="text-xs text-muted-foreground">
                  Custom colors, fonts, and assets applied automatically to all rendered graphics, carousels, and video clips.
                </p>
              </div>

              <form onSubmit={handleSaveKit} className="space-y-5">
                {/* Logos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label mb-1.5 block">Light Logo URL</label>
                    <input
                      type="url"
                      name="logo_url"
                      defaultValue={initialKit?.logo_url || ""}
                      placeholder="https://assets.yourcompany.com/logo-light.svg"
                      className="input text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">SVG, PNG or WEBP (transparent background)</p>
                  </div>
                  <div>
                    <label className="label mb-1.5 block">Dark Logo URL</label>
                    <input
                      type="url"
                      name="logo_dark_url"
                      defaultValue={initialKit?.logo_dark_url || ""}
                      placeholder="https://assets.yourcompany.com/logo-dark.svg"
                      className="input text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Rendered on dark slide templates</p>
                  </div>
                </div>

                {/* Color Palette */}
                <div>
                  <label className="label mb-2 block font-semibold">6-Point Palette Swatches</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl border border-border bg-panel space-y-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase">Primary / CTA</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="input text-xs font-mono uppercase"
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-border bg-panel space-y-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase">Secondary / Info</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="input text-xs font-mono uppercase"
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-xl border border-border bg-panel space-y-1.5">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase">Accent / Warm</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="input text-xs font-mono uppercase"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fonts */}
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
                      <option value="Outfit">Outfit</option>
                    </select>
                  </div>
                  <div>
                    <label className="label mb-1.5 block">Body Typography</label>
                    <select
                      value={bodyFont}
                      onChange={(e) => setBodyFont(e.target.value)}
                      className="input text-xs"
                    >
                      <option value="Inter">Inter (Optimized Legibility)</option>
                      <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                      <option value="DM Sans">DM Sans</option>
                      <option value="Roboto">Roboto</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label mb-1.5 block">Image Style & Aesthetic Guidelines</label>
                  <textarea
                    name="image_style_notes"
                    rows={2}
                    defaultValue={initialKit?.image_style_notes || ""}
                    placeholder="e.g. Modern dark glassmorphism, 3D clay illustrations, minimalist editorial, clean gradients..."
                    className="input text-xs resize-none"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary text-xs px-5 py-2.5">
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? "Saving Kit..." : "Save Brand Kit"}</span>
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 3: BRAND VOICE & GUIDELINES */}
          {activeTab === "voice" && (
            <Card className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Brand Voice, Tone & Guardrails</h2>
                <p className="text-xs text-muted-foreground">
                  Define exact tone traits, prohibited words, approved calls to action, and hashtags.
                </p>
              </div>

              <form onSubmit={handleSaveVoice} className="space-y-4">
                <div>
                  <label className="label mb-1.5 block">Tone Words (Comma-separated)</label>
                  <input
                    type="text"
                    value={toneInput}
                    onChange={(e) => setToneInput(e.target.value)}
                    placeholder="e.g. Bold, Analytical, Action-oriented, Direct, Empathetic"
                    className="input text-xs"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {toneInput.split(",").map((t) => t.trim()).filter(Boolean).map((t, idx) => (
                      <span key={idx} className="badge">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label mb-1.5 block text-primary font-semibold">DO Examples (Good Copy Style)</label>
                    <textarea
                      name="do_examples"
                      rows={3}
                      defaultValue={initialVoice?.do_examples || ""}
                      placeholder="e.g. Open with a surprising fact. Keep sentences under 15 words. Use bullet points for takeaways."
                      className="input text-xs resize-none"
                    />
                  </div>
                  <div>
                    <label className="label mb-1.5 block text-destructive font-semibold">DON'T Examples (Fluff to Avoid)</label>
                    <textarea
                      name="dont_examples"
                      rows={3}
                      defaultValue={initialVoice?.dont_examples || ""}
                      placeholder="e.g. Never use corporate jargon. Avoid empty adjectives like 'revolutionary' or 'ultimate'."
                      className="input text-xs resize-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="label mb-1.5 block text-destructive font-semibold">
                    Banned Words & Phrases (Strictly Prohibited)
                  </label>
                  <input
                    type="text"
                    value={bannedInput}
                    onChange={(e) => setBannedInput(e.target.value)}
                    placeholder="e.g. game-changer, synergy, unlock, unleash, paradigm shift, 10x"
                    className="input text-xs"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {bannedInput.split(",").map((b) => b.trim()).filter(Boolean).map((b, idx) => (
                      <span key={idx} className="badge-orange">
                        ✕ {b}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label mb-1.5 block font-semibold">
                    Approved Calls to Action (CTAs, One per line)
                  </label>
                  <textarea
                    rows={3}
                    value={ctasInput}
                    onChange={(e) => setCtasInput(e.target.value)}
                    placeholder="Book a 15-min strategy session&#10;Try Growth OS free&#10;Download the 2026 B2B Playbook"
                    className="input text-xs font-mono resize-none"
                  />
                </div>

                <div>
                  <label className="label mb-1.5 block">Preferred Hashtags (Comma-separated)</label>
                  <input
                    type="text"
                    value={hashtagsInput}
                    onChange={(e) => setHashtagsInput(e.target.value)}
                    placeholder="#GrowthOS, #ScalePods, #B2BMarketing"
                    className="input text-xs"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary text-xs px-5 py-2.5">
                    <Save className="w-3.5 h-3.5" />
                    <span>{saving ? "Saving Voice..." : "Save Voice & Guardrails"}</span>
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 4: APPROVED FACTS & PROOF POINTS */}
          {activeTab === "facts" && (
            <div className="space-y-6">
              <Card className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-foreground">Approved Facts & Proof Points</h2>
                    <p className="text-xs text-muted-foreground">
                      Only verified claims in this repository may be cited by AI generation models.
                    </p>
                  </div>
                  <Badge tone="green">
                    <ShieldCheck className="w-3 h-3" />
                    Fact-Gate Active
                  </Badge>
                </div>

                {/* Add new fact card */}
                <form onSubmit={handleAddFact} className="p-3.5 rounded-xl bg-panel border border-border/80 space-y-3">
                  <div className="text-xs font-semibold text-foreground">Add New Verified Fact</div>
                  <div>
                    <input
                      type="text"
                      value={newFactStatement}
                      onChange={(e) => setNewFactStatement(e.target.value)}
                      placeholder="e.g. 5 hours saved per recruiter every week with AI sourcing"
                      className="input text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newFactSource}
                      onChange={(e) => setNewFactSource(e.target.value)}
                      placeholder="Source / Study (e.g. ScalePods Q3 Customer Benchmark)"
                      className="input text-xs flex-1"
                    />
                    <button type="submit" disabled={saving || !newFactStatement.trim()} className="btn-primary text-xs px-4 py-2.5 flex-shrink-0">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Fact</span>
                    </button>
                  </div>
                </form>

                {/* Facts List */}
                <div className="space-y-2.5">
                  {facts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border">
                      No approved facts added yet. Add verified statistics above to seed the AI fact-gate.
                    </div>
                  ) : (
                    facts.map((fact) => (
                      <div
                        key={fact.id}
                        className="p-3.5 rounded-xl border border-border bg-panel flex items-start justify-between gap-3 group hover:border-primary/40 transition-colors"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <span>{fact.statement}</span>
                          </div>
                          {fact.source && (
                            <div className="text-[11px] text-muted-foreground italic">
                              Source: {fact.source}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteFact(fact.id)}
                          title="Delete Fact"
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-fill-tertiary transition-colors opacity-80 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* TAB 5: CONTENT PILLARS */}
          {activeTab === "pillars" && (
            <Card className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">Content Pillars & Editorial Mix</h2>
                  <p className="text-xs text-muted-foreground">
                    Target mix of editorial themes for weekly content generation (Target: 100% total).
                  </p>
                </div>
                <span
                  className={clsx(
                    "px-2.5 py-1 rounded-lg text-xs font-bold font-mono",
                    totalPillarPct === 100
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-destructive/20 text-destructive border border-destructive/30"
                  )}
                >
                  Total: {totalPillarPct}%
                </span>
              </div>

              {/* Add Pillar Form */}
              <form onSubmit={handleAddPillar} className="p-3.5 rounded-xl bg-panel border border-border/80 space-y-3">
                <div className="text-xs font-semibold text-foreground">Add Content Pillar</div>
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                  <input
                    type="text"
                    value={newPillarName}
                    onChange={(e) => setNewPillarName(e.target.value)}
                    placeholder="Pillar Name (e.g. Growth Engine Strategy)"
                    className="input text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={newPillarShare}
                      onChange={(e) => setNewPillarShare(Number(e.target.value))}
                      className="input text-xs w-20"
                    />
                    <span className="text-xs text-muted-foreground">% Mix</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPillarDesc}
                    onChange={(e) => setNewPillarDesc(e.target.value)}
                    placeholder="Short description of angles covered in this pillar"
                    className="input text-xs flex-1"
                  />
                  <button type="submit" disabled={saving || !newPillarName.trim()} className="btn-primary text-xs px-4 py-2 flex-shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Pillar</span>
                  </button>
                </div>
              </form>

              {/* Pillars List */}
              <div className="space-y-2.5">
                {pillars.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border">
                    No custom pillars configured. Defaulting to standard HR / Sales / Ops / Marketing mix.
                  </div>
                ) : (
                  pillars.map((pil) => (
                    <div
                      key={pil.id}
                      className="p-3.5 rounded-xl border border-border bg-panel flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-foreground flex items-center gap-2">
                          <span>{pil.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-fill-tertiary text-primary">
                            {pil.target_share_pct}%
                          </span>
                        </div>
                        {pil.description && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{pil.description}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeletePillar(pil.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-fill-tertiary"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* TAB 6: COMPETITORS */}
          {activeTab === "competitors" && (
            <Card className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-foreground">Competitor Intelligence Tracking</h2>
                <p className="text-xs text-muted-foreground">
                  Track rival brands, social handles, and notes to feed comparative positioning and trend scanning.
                </p>
              </div>

              {/* Add Competitor */}
              <form onSubmit={handleAddCompetitor} className="p-3.5 rounded-xl bg-panel border border-border/80 space-y-3">
                <div className="text-xs font-semibold text-foreground">Track New Competitor</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newCompName}
                    onChange={(e) => setNewCompName(e.target.value)}
                    placeholder="Competitor Name (e.g. Acme Corp)"
                    className="input text-xs"
                  />
                  <input
                    type="url"
                    value={newCompUrl}
                    onChange={(e) => setNewCompUrl(e.target.value)}
                    placeholder="https://competitor.com"
                    className="input text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCompNotes}
                    onChange={(e) => setNewCompNotes(e.target.value)}
                    placeholder="Key weaknesses, messaging angles, or pricing differences"
                    className="input text-xs flex-1"
                  />
                  <button type="submit" disabled={saving || !newCompName.trim()} className="btn-primary text-xs px-4 py-2 flex-shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Track</span>
                  </button>
                </div>
              </form>

              {/* Competitors List */}
              <div className="space-y-2.5">
                {competitors.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border">
                    No competitors listed yet. Add rival companies above.
                  </div>
                ) : (
                  competitors.map((comp) => (
                    <div
                      key={comp.id}
                      className="p-3.5 rounded-xl border border-border bg-panel flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-foreground flex items-center gap-2">
                          <span>{comp.name}</span>
                          {comp.website_url && (
                            <a
                              href={comp.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline text-[10px] inline-flex items-center gap-0.5"
                            >
                              Visit <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        {comp.notes && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{comp.notes}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteCompetitor(comp.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-fill-tertiary"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* TAB 7: ALL BRANDS & PLAN LIMITS */}
          {activeTab === "brands" && (
            <Card className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground">Multi-Brand Management</h2>
                  <p className="text-xs text-muted-foreground">
                    Switch between brands or add new client brands for your workspace.
                  </p>
                </div>
                <button
                  onClick={() => setShowNewBrandModal(true)}
                  className="btn-primary text-xs px-3.5 py-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Brand</span>
                </button>
              </div>

              <div className="p-3 rounded-xl border border-primary/20 bg-primary/10 text-xs flex items-center justify-between">
                <span className="text-foreground">
                  Workspace Plan: <strong className="capitalize">{currentOrg.plan_id}</strong> · Currently using{" "}
                  <strong>{brands.length}</strong> brand(s).
                </span>
                <span className="text-[11px] text-primary font-medium">Database Plan Limits Enforced</span>
              </div>

              <div className="space-y-2.5">
                {brands.map((b) => (
                  <div
                    key={b.id}
                    className={clsx(
                      "p-4 rounded-xl border flex items-center justify-between gap-4 transition-all",
                      b.id === currentBrand.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-panel hover:bg-panel/80"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 text-primary flex items-center justify-center font-bold text-sm">
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-foreground flex items-center gap-2">
                          <span>{b.name}</span>
                          {b.id === currentBrand.id && (
                            <Badge tone="green">Current Active</Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Status: {b.status} · Created: {new Date(b.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    {b.id !== currentBrand.id && (
                      <button
                        onClick={() => switchBrandAction(b.id)}
                        className="btn-ghost text-xs px-3 py-1.5"
                      >
                        Switch to Brand
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Sticky Live Brand Post Preview */}
        <div className="sticky top-24 space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Live Brand Preview
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPreviewPlatform("linkedin")}
                  className={clsx(
                    "px-2 py-1 rounded text-[10px] font-semibold transition-colors",
                    previewPlatform === "linkedin" ? "bg-primary text-ctaText" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  LinkedIn
                </button>
                <button
                  onClick={() => setPreviewPlatform("instagram")}
                  className={clsx(
                    "px-2 py-1 rounded text-[10px] font-semibold transition-colors",
                    previewPlatform === "instagram" ? "bg-primary text-ctaText" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Instagram
                </button>
              </div>
            </div>

            {/* Post Card Render */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-lg space-y-3">
              {/* Creator Header */}
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0"
                  style={{
                    backgroundColor: primaryColor,
                    color: "#0B1A08",
                  }}
                >
                  {currentBrand.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">{currentBrand.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {initialProfile?.tagline || "Autonomous Marketing OS"} · 1h
                  </div>
                </div>
                <div className="ml-auto">
                  <PlatformBadge platform={previewPlatform} size="sm" />
                </div>
              </div>

              {/* Sample Hook and Body with Applied Tone and Facts */}
              <div className="text-xs text-foreground/90 space-y-2 leading-relaxed font-sans">
                <p>
                  Most marketing teams spend 15+ hours every week juggling prompts, tools, and publishing queues.
                </p>
                {facts.length > 0 && (
                  <p className="p-2.5 rounded-lg border border-border/80 bg-panel text-[11px] text-foreground font-medium">
                    ✨ Verified Benchmark: {facts[0].statement}.
                  </p>
                )}
                <p className="text-muted-foreground text-[11px]">
                  Here is how high-growth teams automate their complete content loop:
                </p>
              </div>

              {/* Rendered Mock Image with Brand Palette */}
              <div
                className="w-full aspect-[16/9] rounded-lg flex flex-col justify-between p-4 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}22 0%, #10131C 100%)`,
                  border: `1px solid ${primaryColor}44`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ backgroundColor: primaryColor, color: "#0B1A08" }}
                  >
                    Framework
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">{currentBrand.name}</span>
                </div>

                <div className="space-y-1">
                  <div
                    className="text-lg font-bold tracking-tight text-foreground"
                    style={{ fontFamily: headingFont === "Instrument Serif" ? "var(--font-instrument-serif)" : "sans-serif" }}
                  >
                    {pillars[0]?.name || "Autonomous Growth OS"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Content Engine · Cross-Platform Publishing
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: secondaryColor }} />
                  <span className="text-[9px] text-muted-foreground">Generated by Growth OS</span>
                </div>
              </div>

              {/* CTA & Hashtags */}
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-semibold text-primary">
                  👉 {ctasInput.split("\n")[0] || "Book a 15-min demo"}
                </div>
                <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1 font-mono">
                  {hashtagsInput.split(",").map((h) => h.trim()).filter(Boolean).map((h, i) => (
                    <span key={i}>{h}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-fill-tertiary text-[11px] text-muted-foreground">
              💡 <strong>System Prompt Integration:</strong> This Brand Context is compiled at runtime into every LLM brief via <code>renderPromptHeader()</code>, enforcing tone words and metric safety rules.
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: Create New Brand */}
      {showNewBrandModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 rounded-2xl border border-glass-border bg-card shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Add New Brand</h3>
              <button
                onClick={() => setShowNewBrandModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create an additional brand under workspace <strong>{currentOrg.name}</strong>. Database triggers verify your plan tier allowance.
            </p>
            <form onSubmit={handleCreateBrand} className="space-y-4">
              <div>
                <label className="label mb-1.5 block">Brand Name</label>
                <input
                  type="text"
                  required
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="e.g. Apex Health, ScalePods AI"
                  className="input text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewBrandModal(false)}
                  className="btn-ghost text-xs px-3.5 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newBrandName.trim()}
                  className="btn-primary text-xs px-4 py-2"
                >
                  {saving ? "Creating..." : "Create Brand"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
