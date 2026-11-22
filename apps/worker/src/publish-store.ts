import type { SupabaseClient } from "@supabase/supabase-js";
import { socialError, type MediaItem } from "@growth-os/social";
import type { HealthStore } from "./health-check";
import type { ObjectStore } from "./r2";
import type { AccountRecord, PostRecord, PublishStore } from "./publish";

function must(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const mediaType = (kind: string): MediaItem["type"] => (kind === "pdf" ? "pdf" : kind === "post-video" ? "video" : "image");

/** Publishing storage using the service role. Every write is scoped to one post id and requires it to still be `publishing`. */
export function supabasePublishStore(db: SupabaseClient, objects: ObjectStore): PublishStore {
  return {
    async loadPost(postId) {
      const { data: post, error } = await db
        .from("scheduled_posts")
        .select("id, org_id, brand_id, social_account_id, caption, media, platform_options, status, attempts, provider_post_id")
        .eq("id", postId)
        .maybeSingle();
      must(error, "load post");
      if (!post) return null;
      const [{ data: account, error: aErr }, { data: org, error: oErr }] = await Promise.all([
        db
          .from("social_accounts")
          .select("id, org_id, provider, provider_account_id, platform, status")
          .eq("id", post.social_account_id)
          .eq("org_id", post.org_id)
          .maybeSingle(),
        db.from("organizations").select("status").eq("id", post.org_id).maybeSingle(),
      ]);
      must(aErr, "load account");
      must(oErr, "load organization");
      return { post: post as PostRecord, account: (account as AccountRecord | null) ?? null, orgActive: org?.status === "active" };
    },

    async mediaFor(post) {
      const refs = (post.media ?? []).map((m) => (typeof m === "string" ? m : (m as { asset_id?: string }).asset_id)).filter((x): x is string => !!x);
      if (refs.length === 0) return [];
      const { data, error } = await db.from("media_assets").select("id, path, kind").in("id", refs).eq("org_id", post.org_id);
      must(error, "load media");
      const byId = new Map((data ?? []).map((a) => [a.id as string, a]));
      const items: MediaItem[] = [];
      for (const id of refs) {
        const a = byId.get(id);
        if (!a) throw socialError("MEDIA_INVALID", "One of the files for this post could not be found. Re-attach it and try again.");
        items.push({ url: await objects.signedGet(a.path as string, 3600), type: mediaType(a.kind as string) });
      }
      return items;
    },

    async recordAttempt(a) {
      const { error } = await db.from("publish_attempts").upsert(
        {
          org_id: a.orgId,
          post_id: a.postId,
          attempt_no: a.attemptNo,
          outcome: a.outcome,
          error_code: a.errorCode ?? null,
          error_message: a.errorMessage?.slice(0, 1000) ?? null,
          finished_at: new Date().toISOString(),
        },
        { onConflict: "post_id,attempt_no" },
      );
      must(error, "record attempt");
    },

    async setProviderPostId(postId, providerPostId, url) {
      const { error } = await db.from("scheduled_posts").update({ provider_post_id: providerPostId, post_url: url }).eq("id", postId);
      must(error, "store provider post id");
    },

    async markPublished(postId) {
      const now = new Date().toISOString();
      const { error } = await db
        .from("scheduled_posts")
        .update({ status: "published", published_at: now, locked_at: null, last_error_code: null, last_error_message: null })
        .eq("id", postId)
        .eq("status", "publishing");
      must(error, "mark published");
    },

    async reschedule(postId, at, code, message) {
      const { error } = await db
        .from("scheduled_posts")
        .update({ status: "scheduled", scheduled_for: at.toISOString(), locked_at: null, last_error_code: code, last_error_message: message.slice(0, 1000) })
        .eq("id", postId)
        .eq("status", "publishing");
      must(error, "reschedule");
    },

    async markFailed(postId, code, message) {
      const { error } = await db
        .from("scheduled_posts")
        .update({ status: "failed", locked_at: null, last_error_code: code, last_error_message: message.slice(0, 1000) })
        .eq("id", postId)
        .eq("status", "publishing");
      must(error, "mark failed");
    },

    async setAccountStatus(accountId, status) {
      const { error } = await db.from("social_accounts").update({ status }).eq("id", accountId);
      must(error, "set account status");
    },
  };
}

export function supabaseHealthStore(db: SupabaseClient): HealthStore {
  return {
    async listActive(limit) {
      const { data, error } = await db
        .from("social_accounts")
        .select("id, org_id, provider_account_id, platform")
        .eq("status", "active")
        .order("last_checked_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      must(error, "list accounts");
      return data ?? [];
    },
    async markChecked(accountId, newStatus) {
      const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
      if (newStatus) patch.status = newStatus;
      const { error } = await db.from("social_accounts").update(patch).eq("id", accountId);
      must(error, "mark checked");
    },
  };
}
