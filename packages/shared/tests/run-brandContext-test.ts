import assert from "node:assert";
import { buildBrandContext, renderPromptHeader } from "../src/brandContext";
import type { Brand, BrandProfile, BrandKit, BrandVoice, BrandFact, BrandPillar } from "@growth-os/db";

const mockBrand: Brand = {
  id: "brand-123",
  org_id: "org-456",
  name: "ScalePods",
  status: "active",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockProfile: Partial<BrandProfile> = {
  tagline: "Autonomous Marketing Operating System",
  industry: "AI & Marketing Automation",
  description: "Next-generation content marketing loop for high-growth tech brands.",
  products_services: "AI Studio, Carousel Studio, Video Studio, Auto Publishing",
  target_audience: "B2B SaaS Founders and Head of Marketing",
  goals: "10x organic reach and pipeline acceleration",
  website_url: "https://scalepods.co",
  social_urls: { linkedin: "https://linkedin.com/company/scalepods" },
};

const mockKit: Partial<BrandKit> = {
  logo_url: "https://scalepods.co/logo.svg",
  colors: {
    primary: "#B1D997",
    secondary: "#63A5E7",
    accent: "#CC6B49",
    background: "#04070D",
    text: "#FFFFFF",
  },
  fonts: {
    heading: "Instrument Serif",
    body: "Inter",
  },
};

const mockVoice: Partial<BrandVoice> = {
  tone_words: ["Bold", "Analytical", "Insightful"],
  do_examples: "Write concisely with punchy takeaways. Back claims with facts.",
  dont_examples: "Never use fluff, hollow hype or unsubstantiated stats.",
  banned_words: ["game-changer", "synergy", "revolutionize", "disrupt"],
  approved_ctas: ["Book a 15-min strategy session", "Try Growth OS free"],
  preferred_hashtags: ["#GrowthOS", "#B2BMarketing", "#ScalePods"],
};

const mockFacts: BrandFact[] = [
  {
    id: "fact-1",
    org_id: "org-456",
    brand_id: "brand-123",
    statement: "5 hours saved per content marketer each week",
    source: "ScalePods 2026 Customer Study",
    approved: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "fact-2",
    org_id: "org-456",
    brand_id: "brand-123",
    statement: "Unverified 200% ROI claim",
    source: null,
    approved: false, // Not approved!
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockPillars: BrandPillar[] = [
  {
    id: "pil-1",
    org_id: "org-456",
    brand_id: "brand-123",
    name: "Growth Engine Strategy",
    description: "Deep frameworks on B2B lead generation",
    target_share_pct: 40,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "pil-2",
    org_id: "org-456",
    brand_id: "brand-123",
    name: "AI & Creative Systems",
    description: "Best practices for automated social publishing",
    target_share_pct: 60,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

console.log("Running BrandContext unit test suite...");

// 1. Test buildBrandContext
const ctx = buildBrandContext({
  brand: mockBrand,
  profile: mockProfile,
  kit: mockKit,
  voice: mockVoice,
  facts: mockFacts,
  pillars: mockPillars,
});

assert.strictEqual(ctx.name, "ScalePods", "Brand name mismatch");
assert.strictEqual(ctx.industry, "AI & Marketing Automation", "Industry mismatch");
assert.strictEqual(ctx.facts.length, 1, "Only approved facts must be retained");
assert.strictEqual(ctx.facts[0].statement, "5 hours saved per content marketer each week");
assert.ok(ctx.voice.bannedWords.includes("game-changer"), "Banned word missing");
assert.strictEqual(ctx.colors.primary, "#B1D997", "Primary color mismatch");
console.log("✓ buildBrandContext test PASSED");

// 2. Test renderPromptHeader
const header = renderPromptHeader(ctx);
assert.ok(header.includes("BRAND IDENTITY & VOICE FOR: SCALEPODS"), "Header title missing");
assert.ok(header.includes("5 hours saved per content marketer each week"), "Approved fact missing from prompt");
assert.ok(header.includes("game-changer"), "Banned words missing from prompt");
assert.ok(header.includes("If no approved fact fits, cite NO number or statistic"), "Metric safety rule missing");
assert.ok(!header.includes("Unverified 200% ROI claim"), "Unapproved fact leaked into prompt header!");
console.log("✓ renderPromptHeader metric-safety and fact-gate test PASSED");

console.log("\nAll brandContext unit tests PASSED successfully!");
