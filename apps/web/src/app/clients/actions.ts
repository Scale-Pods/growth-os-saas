"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
 * 1. Save or update Business Profile (tagline, industry, audience, products, etc.)
 */
export async function saveBusinessProfileAction(
  brandId: string,
  formData: FormData
): Promise<ActionResult<BrandProfile>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  // Get brand to ensure org_id
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, org_id")
    .eq("id", brandId)
    .single();

  if (brandErr || !brand) {
    return { error: "Brand not found or access denied" };
  }

  const tagline = (formData.get("tagline") as string)?.trim() || null;
  const industry = (formData.get("industry") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const products_services = (formData.get("products_services") as string)?.trim() || null;
  const target_audience = (formData.get("target_audience") as string)?.trim() || null;
  const goals = (formData.get("goals") as string)?.trim() || null;
  const website_url = (formData.get("website_url") as string)?.trim() || null;
  const contact_email = (formData.get("contact_email") as string)?.trim() || null;
  const contact_phone = (formData.get("contact_phone") as string)?.trim() || null;

  // Social URLs
  const social_urls: Record<string, string> = {};
  const linkedin = (formData.get("social_linkedin") as string)?.trim();
  const twitter = (formData.get("social_twitter") as string)?.trim();
  const instagram = (formData.get("social_instagram") as string)?.trim();
  const youtube = (formData.get("social_youtube") as string)?.trim();
  const facebook = (formData.get("social_facebook") as string)?.trim();

  if (linkedin) social_urls.linkedin = linkedin;
  if (twitter) social_urls.twitter = twitter;
  if (instagram) social_urls.instagram = instagram;
  if (youtube) social_urls.youtube = youtube;
  if (facebook) social_urls.facebook = facebook;

  // Service areas
  const serviceAreasRaw = (formData.get("service_areas") as string) || "";
  const service_areas = serviceAreasRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    org_id: brand.org_id,
    brand_id: brand.id,
    tagline,
    industry,
    description,
    products_services,
    target_audience,
    goals,
    website_url,
    contact_email,
    contact_phone,
    social_urls,
    service_areas,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("brand_profiles")
    .upsert(payload, { onConflict: "brand_id" })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { success: true, data: data as BrandProfile };
}

/**
 * 2. Save or update Brand Kit (logos, colors, typography, style notes)
 */
export async function saveBrandKitAction(
  brandId: string,
  formData: FormData
): Promise<ActionResult<BrandKit>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, org_id")
    .eq("id", brandId)
    .single();

  if (brandErr || !brand) {
    return { error: "Brand not found or access denied" };
  }

  const logo_url = (formData.get("logo_url") as string)?.trim() || null;
  const logo_dark_url = (formData.get("logo_dark_url") as string)?.trim() || null;
  const cover_url = (formData.get("cover_url") as string)?.trim() || null;
  const image_style_notes = (formData.get("image_style_notes") as string)?.trim() || null;

  // Colors
  const colors = {
    primary: (formData.get("color_primary") as string) || "#B1D997",
    secondary: (formData.get("color_secondary") as string) || "#63A5E7",
    accent: (formData.get("color_accent") as string) || "#CC6B49",
    background: (formData.get("color_background") as string) || "#04070D",
    text: (formData.get("color_text") as string) || "#FFFFFF",
  };

  // Fonts
  const fonts = {
    heading: (formData.get("font_heading") as string) || "Instrument Serif",
    body: (formData.get("font_body") as string) || "Inter",
  };

  const payload = {
    org_id: brand.org_id,
    brand_id: brand.id,
    logo_url,
    logo_dark_url,
    cover_url,
    colors,
    fonts,
    image_style_notes,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("brand_kits")
    .upsert(payload, { onConflict: "brand_id" })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { success: true, data: data as BrandKit };
}

/**
 * 3. Save or update Brand Voice (tone, banned words, approved CTAs, etc.)
 */
export async function saveBrandVoiceAction(
  brandId: string,
  formData: FormData
): Promise<ActionResult<BrandVoice>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("id, org_id")
    .eq("id", brandId)
    .single();

  if (brandErr || !brand) {
    return { error: "Brand not found or access denied" };
  }

  const toneRaw = (formData.get("tone_words") as string) || "";
  const tone_words = toneRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const do_examples = (formData.get("do_examples") as string)?.trim() || null;
  const dont_examples = (formData.get("dont_examples") as string)?.trim() || null;

  const bannedRaw = (formData.get("banned_words") as string) || "";
  const banned_words = bannedRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const ctasRaw = (formData.get("approved_ctas") as string) || "";
  const approved_ctas = ctasRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const hashtagsRaw = (formData.get("preferred_hashtags") as string) || "";
  const preferred_hashtags = hashtagsRaw
    .split(",")
    .map((s) => (s.trim().startsWith("#") ? s.trim() : `#${s.trim()}`))
    .filter((s) => s.length > 1);

  const payload = {
    org_id: brand.org_id,
    brand_id: brand.id,
    tone_words,
    do_examples,
    dont_examples,
    banned_words,
    approved_ctas,
    preferred_hashtags,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("brand_voice")
    .upsert(payload, { onConflict: "brand_id" })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { success: true, data: data as BrandVoice };
}

/**
 * 4. Add or update an approved Brand Fact
 */
export async function saveBrandFactAction(
  brandId: string,
  factId: string | null,
  statement: string,
  source?: string | null,
  approved = true
): Promise<ActionResult<BrandFact>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Authentication required" };

  const { data: brand } = await supabase
    .from("brands")
    .select("id, org_id")
    .eq("id", brandId)
    .single();

  if (!brand) return { error: "Brand not found" };

  if (!statement || statement.trim().length < 3) {
    return { error: "Statement must be at least 3 characters" };
  }

  if (factId) {
    const { data, error } = await supabase
      .from("brand_facts")
      .update({
        statement: statement.trim(),
        source: source?.trim() || null,
        approved,
        updated_at: new Date().toISOString(),
      })
      .eq("id", factId)
      .eq("brand_id", brandId)
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as BrandFact };
  } else {
    const { data, error } = await supabase
      .from("brand_facts")
      .insert({
        org_id: brand.org_id,
        brand_id: brand.id,
        statement: statement.trim(),
        source: source?.trim() || null,
        approved,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as BrandFact };
  }
}

/**
 * Delete a Brand Fact
 */
export async function deleteBrandFactAction(
  brandId: string,
  factId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("brand_facts")
    .delete()
    .eq("id", factId)
    .eq("brand_id", brandId);

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

/**
 * 5. Add or update a Brand Pillar
 */
export async function saveBrandPillarAction(
  brandId: string,
  pillarId: string | null,
  name: string,
  description?: string | null,
  target_share_pct = 25
): Promise<ActionResult<BrandPillar>> {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, org_id")
    .eq("id", brandId)
    .single();

  if (!brand) return { error: "Brand not found" };

  if (!name || name.trim().length < 2) {
    return { error: "Pillar name must be at least 2 characters" };
  }

  if (pillarId) {
    const { data, error } = await supabase
      .from("brand_pillars")
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        target_share_pct,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pillarId)
      .eq("brand_id", brandId)
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as BrandPillar };
  } else {
    const { data, error } = await supabase
      .from("brand_pillars")
      .insert({
        org_id: brand.org_id,
        brand_id: brand.id,
        name: name.trim(),
        description: description?.trim() || null,
        target_share_pct,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as BrandPillar };
  }
}

/**
 * Delete a Brand Pillar
 */
export async function deleteBrandPillarAction(
  brandId: string,
  pillarId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("brand_pillars")
    .delete()
    .eq("id", pillarId)
    .eq("brand_id", brandId);

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

/**
 * 6. Add or update a Competitor
 */
export async function saveCompetitorAction(
  brandId: string,
  competitorId: string | null,
  name: string,
  website_url?: string | null,
  notes?: string | null,
  social_handles: Record<string, string> = {}
): Promise<ActionResult<Competitor>> {
  const supabase = createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, org_id")
    .eq("id", brandId)
    .single();

  if (!brand) return { error: "Brand not found" };

  if (!name || name.trim().length < 2) {
    return { error: "Competitor name must be at least 2 characters" };
  }

  if (competitorId) {
    const { data, error } = await supabase
      .from("competitors")
      .update({
        name: name.trim(),
        website_url: website_url?.trim() || null,
        notes: notes?.trim() || null,
        social_handles,
        updated_at: new Date().toISOString(),
      })
      .eq("id", competitorId)
      .eq("brand_id", brandId)
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as Competitor };
  } else {
    const { data, error } = await supabase
      .from("competitors")
      .insert({
        org_id: brand.org_id,
        brand_id: brand.id,
        name: name.trim(),
        website_url: website_url?.trim() || null,
        notes: notes?.trim() || null,
        social_handles,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath("/clients");
    return { success: true, data: data as Competitor };
  }
}

/**
 * Delete a Competitor
 */
export async function deleteCompetitorAction(
  brandId: string,
  competitorId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from("competitors")
    .delete()
    .eq("id", competitorId)
    .eq("brand_id", brandId);

  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { success: true };
}

/**
 * 7. Create a new Brand (enforces plan limit in DB trigger)
 */
export async function createBrandAction(
  orgId: string,
  name: string
): Promise<ActionResult<{ id: string; name: string }>> {
  const supabase = createClient();
  const trimmedName = name?.trim();

  if (!trimmedName || trimmedName.length < 2) {
    return { error: "Brand name must be at least 2 characters" };
  }

  const { data, error } = await supabase
    .from("brands")
    .insert({
      org_id: orgId,
      name: trimmedName,
      status: "active",
    })
    .select("id, name")
    .single();

  if (error) {
    return { error: error.message };
  }

  // Set as active brand cookie
  cookies().set("active_brand_id", data.id, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { success: true, data };
}

/**
 * Switch active brand cookie
 */
export async function switchBrandAction(brandId: string) {
  cookies().set("active_brand_id", brandId, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  revalidatePath("/clients");
  revalidatePath("/dashboard");
}

/**
 * 8. Update Onboarding Progress State
 */
export async function updateOnboardingStateAction(
  orgId: string,
  state: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = createClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      onboarding_state: state as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  return { success: true };
}
