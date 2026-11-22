"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { AppError } from "@growth-os/shared";
import { requireOrgContext, type OrgContext } from "@/lib/api/with-org";
import type {
  BrandProfile,
  BrandKit,
  BrandVoice,
  BrandFact,
  BrandPillar,
  Competitor,
  Json,
} from "@growth-os/db";

export interface ActionResult<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

/**
 * Every action here goes through the same server-side guard as the API routes: signed in, active
 * workspace taken from the session (never from the browser), two-factor for owners/admins, rate limit,
 * and at least Edit access to the `strategy` feature. The database enforces the same rules again via RLS.
 */
async function guarded<T>(fn: (ctx: OrgContext) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const ctx = await requireOrgContext("strategy", "edit", true);
    return await fn(ctx);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    return { error: "Something went wrong. Please try again." };
  }
}

/** The brand must belong to the caller's active workspace. */
async function ownBrand(ctx: OrgContext, brandId: string) {
  const { data } = await ctx.supabase.from("brands").select("id, org_id").eq("id", brandId).eq("org_id", ctx.orgId).maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "Brand not found in this workspace.", 404);
  return data;
}

/** Trim and cap length so prompts built from this data stay bounded. */
function text(v: FormDataEntryValue | null, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

function list(v: FormDataEntryValue | null, sep: RegExp, maxItems: number, maxLen: number, lower = false): string[] {
  const raw = typeof v === "string" ? v : "";
  return raw
    .split(sep)
    .map((s) => (lower ? s.trim().toLowerCase() : s.trim()).slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

/** 1. Save or update Business Profile */
export async function saveBusinessProfileAction(brandId: string, formData: FormData): Promise<ActionResult<BrandProfile>> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);

    const social_urls: Record<string, string> = {};
    for (const k of ["linkedin", "twitter", "instagram", "youtube", "facebook"]) {
      const v = text(formData.get(`social_${k}`), 300);
      if (v) social_urls[k] = v;
    }

    const payload = {
      org_id: brand.org_id,
      brand_id: brand.id,
      tagline: text(formData.get("tagline"), 300),
      industry: text(formData.get("industry"), 120),
      description: text(formData.get("description"), 3000),
      products_services: text(formData.get("products_services"), 3000),
      target_audience: text(formData.get("target_audience"), 3000),
      goals: text(formData.get("goals"), 3000),
      website_url: text(formData.get("website_url"), 500),
      contact_email: text(formData.get("contact_email"), 200),
      contact_phone: text(formData.get("contact_phone"), 50),
      social_urls,
      service_areas: list(formData.get("service_areas"), /,/, 30, 80),
      // Only touched when the form sends it, so saving the profile never flips the facts switch by accident.
      ...(formData.has("only_cite_approved_facts") ? { only_cite_approved_facts: formData.get("only_cite_approved_facts") !== "false" } : {}),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await ctx.supabase.from("brand_profiles").upsert(payload, { onConflict: "brand_id" }).select().single();
    if (error) return { error: error.message };
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: data as BrandProfile };
  });
}

/** The "Only cite approved facts" switch. Changes only that one column. */
export async function setOnlyCiteApprovedFactsAction(brandId: string, value: boolean): Promise<ActionResult> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const { error } = await ctx.supabase
      .from("brand_profiles")
      .upsert({ org_id: brand.org_id, brand_id: brand.id, only_cite_approved_facts: value === true, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true };
  });
}

/** 2. Save or update Brand Kit (logos, colors, typography, style notes) */
export async function saveBrandKitAction(brandId: string, formData: FormData): Promise<ActionResult<BrandKit>> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const hex = (v: FormDataEntryValue | null, fallback: string) =>
      typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;

    const payload = {
      org_id: brand.org_id,
      brand_id: brand.id,
      logo_url: text(formData.get("logo_url"), 1000),
      logo_dark_url: text(formData.get("logo_dark_url"), 1000),
      cover_url: text(formData.get("cover_url"), 1000),
      colors: {
        primary: hex(formData.get("color_primary"), "#B1D997"),
        secondary: hex(formData.get("color_secondary"), "#63A5E7"),
        accent: hex(formData.get("color_accent"), "#CC6B49"),
        background: hex(formData.get("color_background"), "#04070D"),
        text: hex(formData.get("color_text"), "#FFFFFF"),
      },
      fonts: {
        heading: text(formData.get("font_heading"), 60) ?? "Instrument Serif",
        body: text(formData.get("font_body"), 60) ?? "Inter",
      },
      image_style_notes: text(formData.get("image_style_notes"), 2000),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await ctx.supabase.from("brand_kits").upsert(payload, { onConflict: "brand_id" }).select().single();
    if (error) return { error: error.message };
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: data as BrandKit };
  });
}

/** 3. Save or update Brand Voice */
export async function saveBrandVoiceAction(brandId: string, formData: FormData): Promise<ActionResult<BrandVoice>> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);

    const payload = {
      org_id: brand.org_id,
      brand_id: brand.id,
      tone_words: list(formData.get("tone_words"), /,/, 15, 40),
      do_examples: text(formData.get("do_examples"), 2000),
      dont_examples: text(formData.get("dont_examples"), 2000),
      banned_words: list(formData.get("banned_words"), /,/, 100, 60, true),
      approved_ctas: list(formData.get("approved_ctas"), /\n/, 20, 120),
      preferred_hashtags: list(formData.get("preferred_hashtags"), /,/, 20, 60)
        .map((s) => (s.startsWith("#") ? s : `#${s}`))
        .filter((s) => s.length > 1),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await ctx.supabase.from("brand_voice").upsert(payload, { onConflict: "brand_id" }).select().single();
    if (error) return { error: error.message };
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data: data as BrandVoice };
  });
}

/** 4. Add or update a Brand Fact */
export async function saveBrandFactAction(
  brandId: string,
  factId: string | null,
  statement: string,
  source?: string | null,
  approved = true,
): Promise<ActionResult<BrandFact>> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const clean = (statement ?? "").trim().slice(0, 500);
    if (clean.length < 3) return { error: "Statement must be at least 3 characters" };
    const src = source?.trim().slice(0, 300) || null;

    const q = factId
      ? ctx.supabase
          .from("brand_facts")
          .update({ statement: clean, source: src, approved, updated_at: new Date().toISOString() })
          .eq("id", factId)
          .eq("brand_id", brand.id)
          .eq("org_id", ctx.orgId)
      : ctx.supabase.from("brand_facts").insert({ org_id: brand.org_id, brand_id: brand.id, statement: clean, source: src, approved });
    const { data, error } = await q.select().single();
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as BrandFact };
  });
}

export async function deleteBrandFactAction(brandId: string, factId: string): Promise<ActionResult> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const { error } = await ctx.supabase.from("brand_facts").delete().eq("id", factId).eq("brand_id", brand.id).eq("org_id", ctx.orgId);
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true };
  });
}

/** 5. Add or update a Brand Pillar */
export async function saveBrandPillarAction(
  brandId: string,
  pillarId: string | null,
  name: string,
  description?: string | null,
  target_share_pct = 25,
): Promise<ActionResult<BrandPillar>> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const clean = (name ?? "").trim().slice(0, 100);
    if (clean.length < 2) return { error: "Pillar name must be at least 2 characters" };
    const share = Math.min(100, Math.max(0, Math.round(Number(target_share_pct) || 0)));
    const desc = description?.trim().slice(0, 500) || null;

    const q = pillarId
      ? ctx.supabase
          .from("brand_pillars")
          .update({ name: clean, description: desc, target_share_pct: share, updated_at: new Date().toISOString() })
          .eq("id", pillarId)
          .eq("brand_id", brand.id)
          .eq("org_id", ctx.orgId)
      : ctx.supabase
          .from("brand_pillars")
          .insert({ org_id: brand.org_id, brand_id: brand.id, name: clean, description: desc, target_share_pct: share });
    const { data, error } = await q.select().single();
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as BrandPillar };
  });
}

export async function deleteBrandPillarAction(brandId: string, pillarId: string): Promise<ActionResult> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const { error } = await ctx.supabase.from("brand_pillars").delete().eq("id", pillarId).eq("brand_id", brand.id).eq("org_id", ctx.orgId);
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true };
  });
}

/** 6. Add or update a Competitor */
export async function saveCompetitorAction(
  brandId: string,
  competitorId: string | null,
  name: string,
  website_url?: string | null,
  notes?: string | null,
  social_handles: Record<string, string> = {},
): Promise<ActionResult<Competitor>> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const clean = (name ?? "").trim().slice(0, 120);
    if (clean.length < 2) return { error: "Competitor name must be at least 2 characters" };
    const handles: Record<string, string> = {};
    for (const [k, v] of Object.entries(social_handles ?? {}).slice(0, 10)) {
      if (typeof v === "string" && v.trim()) handles[k.slice(0, 30)] = v.trim().slice(0, 200);
    }
    const fields = {
      name: clean,
      website_url: website_url?.trim().slice(0, 500) || null,
      notes: notes?.trim().slice(0, 2000) || null,
      social_handles: handles,
    };

    const q = competitorId
      ? ctx.supabase
          .from("competitors")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", competitorId)
          .eq("brand_id", brand.id)
          .eq("org_id", ctx.orgId)
      : ctx.supabase.from("competitors").insert({ org_id: brand.org_id, brand_id: brand.id, ...fields });
    const { data, error } = await q.select().single();
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as Competitor };
  });
}

export async function deleteCompetitorAction(brandId: string, competitorId: string): Promise<ActionResult> {
  return guarded(async (ctx) => {
    const brand = await ownBrand(ctx, brandId);
    const { error } = await ctx.supabase.from("competitors").delete().eq("id", competitorId).eq("brand_id", brand.id).eq("org_id", ctx.orgId);
    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true };
  });
}

/**
 * 7. Create a new Brand. The workspace comes from the session, not from the caller: the first argument is
 * kept only so existing screens compile, and is ignored. Plan limits are enforced by a database trigger.
 */
export async function createBrandAction(_ignoredOrgId: string, name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return guarded(async (ctx) => {
    const trimmed = name?.trim().slice(0, 120);
    if (!trimmed || trimmed.length < 2) return { error: "Brand name must be at least 2 characters" };

    const { data, error } = await ctx.supabase
      .from("brands")
      .insert({ org_id: ctx.orgId, name: trimmed, status: "active" })
      .select("id, name")
      .single();
    if (error) return { error: error.message };

    (await cookies()).set("active_brand_id", data.id, { path: "/", maxAge: 31536000, sameSite: "lax" });
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { success: true, data };
  });
}

/** Switch the active brand. The brand must belong to the caller's workspace. */
export async function switchBrandAction(brandId: string) {
  try {
    const ctx = await requireOrgContext("strategy", "view", false);
    await ownBrand(ctx, brandId);
  } catch {
    return;
  }
  (await cookies()).set("active_brand_id", brandId, { path: "/", maxAge: 31536000, sameSite: "lax" });
  revalidatePath("/clients");
  revalidatePath("/dashboard");
}

/** 8. Update onboarding progress for the caller's workspace (taken from the session). */
export async function updateOnboardingStateAction(_ignoredOrgId: string, state: Record<string, unknown>): Promise<ActionResult> {
  return guarded(async (ctx) => {
    const { error } = await ctx.supabase
      .from("organizations")
      .update({ onboarding_state: state as unknown as Json, updated_at: new Date().toISOString() })
      .eq("id", ctx.orgId);
    if (error) return { error: error.message };
    revalidatePath("/dashboard");
    revalidatePath("/onboarding");
    return { success: true };
  });
}
