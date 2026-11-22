import { z } from "zod";
import { AppError } from "@growth-os/shared";
import { newConnectState, hashConnectState } from "@growth-os/shared/src/connect-state";
import { SOCIAL_PLATFORMS } from "@growth-os/social";
import { withOrg } from "@/lib/api/with-org";
import { createAdminClient } from "@/lib/server-only/supabase-admin";
import { socialProvider } from "@/lib/server-only/social";

const input = z
  .object({
    brandId: z.string().uuid(),
    platform: z.enum(SOCIAL_PLATFORMS as unknown as [string, ...string[]]),
  })
  .strict();

const STATE_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Step 1 of connecting a channel (owners and admins only): create a single-use, 10-minute state tied to this
 * user, workspace and brand, then return the provider's connect link. Only the state's hash is stored.
 */
export const POST = withOrg({ feature: "publishing", level: "full", input }, async (ctx, i) => {
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new AppError("FORBIDDEN", "Only owners and admins can connect channels.", 403);
  }
  // RLS only returns brands of the caller's own workspace.
  const { data: brand } = await ctx.supabase.from("brands").select("id").eq("id", i.brandId).eq("org_id", ctx.orgId).maybeSingle();
  if (!brand) throw new AppError("NOT_FOUND", "That brand was not found in this workspace.", 404);

  const state = newConnectState();
  const { error } = await createAdminClient()
    .from("social_connect_states")
    .insert({
      org_id: ctx.orgId,
      brand_id: brand.id,
      user_id: ctx.user.id,
      state_hash: hashConnectState(state),
      expires_at: new Date(Date.now() + STATE_LIFETIME_MS).toISOString(),
    });
  if (error) {
    ctx.log.error("could not store connect state", { error: error.message });
    throw new AppError("INTERNAL_ERROR", "Could not start the connection. Please try again.", 500);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new AppError("INTERNAL_ERROR", "The app address is not configured.", 500);
  const url = await socialProvider().getConnectUrl({
    state,
    platform: i.platform as (typeof SOCIAL_PLATFORMS)[number],
    redirectUri: `${appUrl.replace(/\/$/, "")}/api/social/callback`,
  });
  return { url };
});
