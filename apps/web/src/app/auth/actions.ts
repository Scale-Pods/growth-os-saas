"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthActionResult {
  error?: string;
  success?: string;
}

export async function login(prevState: AuthActionResult | null, formData: FormData): Promise<AuthActionResult> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/dashboard";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signup(prevState: AuthActionResult | null, formData: FormData): Promise<AuthActionResult> {
  const supabase = await createClient();

  const fullName = (formData.get("fullName") as string) || "";
  const email = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (password.length < 10) {
    return { error: "Password must be at least 10 characters long." };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName.trim(),
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // If Supabase has email confirmation enabled and session is not yet active:
  if (data.user && !data.session) {
    return {
      success: "Account created! Please check your email to verify your account before logging in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function createOrganizationAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const supabase = await createClient();

  const name = ((formData.get("name") as string) || "").trim();
  const slug = ((formData.get("slug") as string) || "").trim().toLowerCase();

  if (!name) {
    return { error: "Organization name is required." };
  }

  if (!slug) {
    return { error: "Organization URL slug is required." };
  }

  const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug) || slug.length < 3 || slug.length > 48) {
    return {
      error: "Slug must be 3-48 characters, lowercase alphanumeric with single hyphens (e.g. 'acme-corp').",
    };
  }

  const { error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slug,
  });

  if (error) {
    if (error.message.includes("unique") || error.code === "23505") {
      return { error: "This slug is already taken. Please choose another one." };
    }
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
