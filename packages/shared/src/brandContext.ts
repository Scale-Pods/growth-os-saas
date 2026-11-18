/**
 * Brand Context Builder & Prompt Header Generator (P03)
 *
 * In the Growth OS SaaS, nothing brand-specific is ever hardcoded in prompts or code.
 * All generation engines (P06 Strategy, P07 AI Studio, P07 Carousel, P07 Video, P07 Content)
 * consume a structured BrandContext assembled at runtime via buildBrandContext().
 */

import type {
  Brand,
  BrandProfile,
  BrandKit,
  BrandVoice,
  BrandFact,
  BrandPillar,
} from "@growth-os/db";

export interface BrandContextInput {
  brand: Brand;
  profile?: Partial<BrandProfile> | null;
  kit?: Partial<BrandKit> | null;
  voice?: Partial<BrandVoice> | null;
  facts?: BrandFact[] | null;
  pillars?: BrandPillar[] | null;
}

export interface BrandContext {
  id: string;
  orgId: string;
  name: string;
  tagline: string;
  industry: string;
  description: string;
  productsServices: string;
  audience: string;
  goals: string;
  websiteUrl: string;
  voice: {
    tone: string[];
    doExamples: string;
    dontExamples: string;
    bannedWords: string[];
    approvedCtas: string[];
    preferredHashtags: string[];
  };
  facts: Array<{
    statement: string;
    source?: string | null;
  }>;
  pillars: Array<{
    name: string;
    description?: string | null;
    targetSharePct: number;
  }>;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
    [key: string]: string;
  };
  fonts: {
    heading: string;
    body: string;
    [key: string]: string;
  };
  logoUrl?: string | null;
  logoDarkUrl?: string | null;
  handles: Record<string, string>;
}

/**
 * Builds a standardized, normalized BrandContext object.
 * Caps string lengths to protect LLM context windows against prompt-injection and overflow.
 */
export function buildBrandContext(input: BrandContextInput): BrandContext {
  const { brand, profile, kit, voice, facts = [], pillars = [] } = input;

  const defaultColors = {
    primary: "#B1D997",
    secondary: "#63A5E7",
    accent: "#CC6B49",
    background: "#04070D",
    text: "#FFFFFF",
  };

  const defaultFonts = {
    heading: "Instrument Serif",
    body: "Inter",
  };

  // Only take approved facts and cap at 30 items
  const approvedFacts = (facts || [])
    .filter((f) => f.approved)
    .slice(0, 30)
    .map((f) => ({
      statement: f.statement.trim(),
      source: f.source ? f.source.trim() : null,
    }));

  return {
    id: brand.id,
    orgId: brand.org_id,
    name: brand.name,
    tagline: profile?.tagline ? profile.tagline.slice(0, 300) : "",
    industry: profile?.industry ? profile.industry.slice(0, 120) : "Technology & Growth",
    description: profile?.description ? profile.description.slice(0, 3000) : "",
    productsServices: profile?.products_services ? profile.products_services.slice(0, 3000) : "",
    audience: profile?.target_audience ? profile.target_audience.slice(0, 3000) : "Growth-oriented leaders and operators",
    goals: profile?.goals ? profile.goals.slice(0, 3000) : "",
    websiteUrl: profile?.website_url ? profile.website_url.slice(0, 500) : "",
    voice: {
      tone: voice?.tone_words?.length ? voice.tone_words.slice(0, 15) : ["Authoritative", "Action-oriented", "Modern"],
      doExamples: voice?.do_examples ? voice.do_examples.slice(0, 2000) : "",
      dontExamples: voice?.dont_examples ? voice.dont_examples.slice(0, 2000) : "",
      bannedWords: voice?.banned_words?.length ? voice.banned_words.slice(0, 100) : [],
      approvedCtas: voice?.approved_ctas?.length ? voice.approved_ctas.slice(0, 20) : ["Book a demo", "Learn more", "Get started"],
      preferredHashtags: voice?.preferred_hashtags?.length ? voice.preferred_hashtags.slice(0, 20) : [],
    },
    facts: approvedFacts,
    pillars: (pillars || []).slice(0, 10).map((p) => ({
      name: p.name.slice(0, 100),
      description: p.description ? p.description.slice(0, 500) : null,
      targetSharePct: p.target_share_pct || 25,
    })),
    colors: { ...defaultColors, ...(kit?.colors || {}) },
    fonts: { ...defaultFonts, ...(kit?.fonts || {}) },
    logoUrl: kit?.logo_url || null,
    logoDarkUrl: kit?.logo_dark_url || null,
    handles: profile?.social_urls || {},
  };
}

/**
 * Standard system-prompt header injection block for LLM prompts.
 * Embeds the literal list of approved facts, tone rules, banned words, and
 * the non-negotiable rule: "If no approved fact fits, use NO number or statistic."
 */
export function renderPromptHeader(context: BrandContext): string {
  const parts: string[] = [];

  parts.push(`=== BRAND IDENTITY & VOICE FOR: ${context.name.toUpperCase()} ===`);
  if (context.tagline) parts.push(`Tagline: ${context.tagline}`);
  if (context.industry) parts.push(`Industry: ${context.industry}`);
  if (context.audience) parts.push(`Target Audience: ${context.audience}`);
  if (context.description) parts.push(`Business Description: ${context.description}`);
  if (context.productsServices) parts.push(`Products & Services: ${context.productsServices}`);

  parts.push(`\nTONE & WRITING STYLE:`);
  parts.push(`- Core Tone: ${context.voice.tone.join(", ")}`);
  if (context.voice.doExamples) {
    parts.push(`- DO:\n${context.voice.doExamples}`);
  }
  if (context.voice.dontExamples) {
    parts.push(`- DON'T:\n${context.voice.dontExamples}`);
  }

  if (context.voice.bannedWords.length > 0) {
    parts.push(`\nSTRICTLY BANNED WORDS & PHRASES (NEVER USE ANY OF THESE):`);
    parts.push(context.voice.bannedWords.map((w) => `"${w}"`).join(", "));
  }

  if (context.voice.approvedCtas.length > 0) {
    parts.push(`\nAPPROVED CALLS TO ACTION (CTAs):`);
    context.voice.approvedCtas.forEach((cta) => parts.push(`- ${cta}`));
  }

  parts.push(`\nAPPROVED FACTS & STATISTICS:`);
  if (context.facts.length > 0) {
    parts.push(`You may ONLY cite the following factual statements in copy or graphics:`);
    context.facts.forEach((fact, idx) => {
      const sourceStr = fact.source ? ` (Source: ${fact.source})` : "";
      parts.push(`${idx + 1}. "${fact.statement}"${sourceStr}`);
    });
  } else {
    parts.push(`(No verified statistics currently listed for this brand.)`);
  }

  parts.push(
    `\nCRITICAL METRIC SAFETY RULE: Under NO circumstances invent, extrapolate, or approximate statistics, percentages, or metrics. If no approved fact fits, cite NO number or statistic.`
  );

  if (context.pillars.length > 0) {
    parts.push(`\nCONTENT PILLARS:`);
    context.pillars.forEach((p) => {
      const descStr = p.description ? ` - ${p.description}` : "";
      parts.push(`- ${p.name} (Target Mix: ${p.targetSharePct}%)${descStr}`);
    });
  }

  parts.push(`=== END BRAND IDENTITY ===\n`);

  return parts.join("\n");
}
