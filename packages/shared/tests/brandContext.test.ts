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

describe("brandContext", () => {
  it("builds a clean brand context with approved facts only", () => {
    const ctx = buildBrandContext({
      brand: mockBrand,
      profile: mockProfile,
      kit: mockKit,
      voice: mockVoice,
      facts: mockFacts,
      pillars: mockPillars,
    });

    expect(ctx.name).toBe("ScalePods");
    expect(ctx.industry).toBe("AI & Marketing Automation");
    expect(ctx.facts.length).toBe(1);
    expect(ctx.facts[0].statement).toBe("5 hours saved per content marketer each week");
    expect(ctx.voice.bannedWords).toContain("game-changer");
    expect(ctx.colors.primary).toBe("#B1D997");
  });

  it("renders a prompt header with non-negotiable metric safety rules", () => {
    const ctx = buildBrandContext({
      brand: mockBrand,
      profile: mockProfile,
      kit: mockKit,
      voice: mockVoice,
      facts: mockFacts,
      pillars: mockPillars,
    });

    const header = renderPromptHeader(ctx);

    expect(header).toContain("BRAND IDENTITY & VOICE FOR: SCALEPODS");
    expect(header).toContain("5 hours saved per content marketer each week");
    expect(header).toContain("game-changer");
    expect(header).toContain("If no approved fact fits, cite NO number or statistic");
    expect(header).not.toContain("Unverified 200% ROI claim");
  });
});
