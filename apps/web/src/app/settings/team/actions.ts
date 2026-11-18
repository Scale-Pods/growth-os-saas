"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError } from "@growth-os/shared";
import { withOrgAction } from "@/lib/api/with-org";

const roleSchema = z.enum(["admin", "editor", "reviewer", "viewer", "owner"]);

// Default feature level per role (mirrors accept_invitation in the database).
const ROLE_LEVEL: Record<string, "full" | "edit" | "view"> = {
  owner: "full",
  admin: "full",
  editor: "edit",
  reviewer: "view",
  viewer: "view",
};

const TEAM_FEATURES = [
  "brand", "intelligence", "competitors", "trends", "trend_alerts", "strategy", "content_factory",
  "studio", "carousel_studio", "video_studio", "review", "board", "calendar", "publishing",
  "analytics", "leads", "team",
];

/** Create an invitation. Only a hash of the token is stored; the link is returned once. */
export const createInvitationAction = withOrgAction(
  {
    feature: "team",
    level: "edit",
    input: z.object({ email: z.string().trim().toLowerCase().email().max(254), role: roleSchema }),
  },
  async (ctx, input) => {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    // RLS + can_invite_role decide whether this caller may invite this role.
    const { error } = await ctx.supabase.from("invitations").insert({
      org_id: ctx.orgId,
      email: input.email,
      role: input.role,
      token_hash: tokenHash,
      invited_by: ctx.user.id,
    });
    if (error) {
      if (error.code === "42501") throw new AppError("FORBIDDEN", "You are not allowed to invite that role.", 403);
      if (error.code === "23505") throw new AppError("VALIDATION_ERROR", "An invitation is already pending for that email.", 409);
      throw new AppError("INTERNAL_ERROR", "Could not create the invitation.", 500, error.message);
    }

    revalidatePath("/settings/team");
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return { link: `${base}/invite/${token}`, email: input.email };
  },
);

export const revokeInvitationAction = withOrgAction(
  { feature: "team", level: "edit", input: z.object({ invitationId: z.string().uuid() }) },
  async (ctx, input) => {
    const { data, error } = await ctx.supabase
      .from("invitations")
      .delete()
      .eq("id", input.invitationId)
      .eq("org_id", ctx.orgId)
      .select("id");
    if (error) throw new AppError("INTERNAL_ERROR", "Could not revoke the invitation.", 500, error.message);
    if (!data?.length) throw new AppError("FORBIDDEN", "You cannot revoke that invitation.", 403);
    revalidatePath("/settings/team");
    return { revoked: true };
  },
);

export const changeMemberRoleAction = withOrgAction(
  { feature: "team", level: "edit", input: z.object({ userId: z.string().uuid(), role: roleSchema }) },
  async (ctx, input) => {
    // can_modify_membership / can_create_membership in the database enforce who may do this.
    const { data, error } = await ctx.supabase
      .from("memberships")
      .update({ role: input.role })
      .eq("org_id", ctx.orgId)
      .eq("user_id", input.userId)
      .select("user_id");
    if (error) {
      if (error.code === "23514") throw new AppError("FORBIDDEN", "An organization must keep at least one owner.", 403);
      throw new AppError("FORBIDDEN", "You are not allowed to change that member's role.", 403, error.message);
    }
    if (!data?.length) throw new AppError("FORBIDDEN", "You are not allowed to change that member's role.", 403);

    // Re-base the member's explicit feature levels on the new role.
    const level = ROLE_LEVEL[input.role] ?? "view";
    const { error: faErr } = await ctx.supabase
      .from("feature_access")
      .upsert(
        TEAM_FEATURES.map((feature) => ({ org_id: ctx.orgId, user_id: input.userId, feature, level })),
        { onConflict: "org_id,user_id,feature" },
      );
    if (faErr) throw new AppError("INTERNAL_ERROR", "Role changed but feature access could not be updated.", 500, faErr.message);

    revalidatePath("/settings/team");
    return { updated: true };
  },
);

export const removeMemberAction = withOrgAction(
  { feature: "team", level: "edit", input: z.object({ userId: z.string().uuid() }) },
  async (ctx, input) => {
    const { data, error } = await ctx.supabase
      .from("memberships")
      .delete()
      .eq("org_id", ctx.orgId)
      .eq("user_id", input.userId)
      .select("user_id");
    if (error) {
      if (error.code === "23514") throw new AppError("FORBIDDEN", "The last owner cannot be removed.", 403);
      throw new AppError("FORBIDDEN", "You are not allowed to remove that member.", 403, error.message);
    }
    if (!data?.length) throw new AppError("FORBIDDEN", "You are not allowed to remove that member.", 403);
    revalidatePath("/settings/team");
    return { removed: true };
  },
);
