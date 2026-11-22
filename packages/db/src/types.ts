export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole = "owner" | "admin" | "editor" | "reviewer" | "viewer";
export type FeatureLevel = "none" | "view" | "edit" | "full";
export type OrgStatus = "active" | "suspended" | "deleted";
export type MembershipStatus = "invited" | "active" | "suspended";

export type OnboardingState = {
  step: number;
  completed: boolean;
  workspace_name?: string;
  role?: string;
  industry?: string;
  brand_id?: string;
  brand_name?: string;
  website_url?: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  plan_id: string;
  status: OrgStatus;
  trial_ends_at: string | null;
  created_by: string;
  onboarding_state: OnboardingState | Json;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  org_id: string;
  user_id: string;
  role: OrgRole;
  status: MembershipStatus;
  monthly_credit_cap: number | null;
  created_at: string;
  updated_at: string;
};

export type FeatureAccess = {
  org_id: string;
  user_id: string;
  feature: string;
  level: FeatureLevel;
  created_at: string;
  updated_at: string;
};

export type Brand = {
  id: string;
  org_id: string;
  name: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

export type BrandProfile = {
  id: string;
  org_id: string;
  brand_id: string;
  tagline: string | null;
  industry: string | null;
  description: string | null;
  products_services: string | null;
  target_audience: string | null;
  goals: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_urls: Record<string, string>;
  service_areas: string[];
  only_cite_approved_facts: boolean;
  created_at: string;
  updated_at: string;
};

export type BrandKit = {
  id: string;
  org_id: string;
  brand_id: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  cover_url: string | null;
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
  image_style_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandVoice = {
  id: string;
  org_id: string;
  brand_id: string;
  tone_words: string[];
  do_examples: string | null;
  dont_examples: string | null;
  banned_words: string[];
  approved_ctas: string[];
  preferred_hashtags: string[];
  created_at: string;
  updated_at: string;
};

export type BrandFact = {
  id: string;
  org_id: string;
  brand_id: string;
  statement: string;
  source: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
};

export type BrandPillar = {
  id: string;
  org_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  target_share_pct: number;
  created_at: string;
  updated_at: string;
};

export type Competitor = {
  id: string;
  org_id: string;
  brand_id: string;
  name: string;
  website_url: string | null;
  social_handles: Record<string, string>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Invitation = {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  token_hash: string;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  org_id: string | null;
  org_slug: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Json;
  ip: string | null;
  created_at: string;
};

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";
export type Job = {
  id: string;
  org_id: string;
  brand_id: string | null;
  kind: string;
  status: JobStatus;
  progress: { percent?: number; label?: string } & Record<string, Json | undefined>;
  input_ref: Json | null;
  output_ref: Json | null;
  error_code: string | null;
  error_message: string | null;
  cost_credits: number;
  created_by: string | null;
  heartbeat_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type CreditLedgerEntry = {
  id: string;
  org_id: string;
  user_id: string | null;
  job_id: string | null;
  kind: "grant" | "reserve" | "adjust" | "release" | "expire";
  amount: number;
  ref: string | null;
  created_at: string;
};

export type AiUsage = {
  id: string;
  org_id: string;
  user_id: string | null;
  job_id: string | null;
  model: string;
  units: number;
  cost_usd: number;
  credits: number;
  created_at: string;
};

export type MediaKind = "logo" | "post-image" | "post-video" | "pdf" | "reference-image";
export type MediaAsset = {
  id: string;
  org_id: string;
  brand_id: string | null;
  path: string;
  kind: MediaKind;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  created_by: string | null;
  created_at: string;
};

export type SocialPlatform = "instagram" | "facebook" | "linkedin" | "linkedin_page" | "youtube" | "x" | "tiktok" | "threads" | "pinterest";
export type SocialAccountStatus = "active" | "needs_reconnect" | "disconnected";
export type SocialAccount = {
  id: string;
  org_id: string;
  brand_id: string;
  provider: string;
  provider_account_id: string;
  platform: SocialPlatform;
  display_name: string;
  avatar_url: string | null;
  status: SocialAccountStatus;
  last_checked_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "canceled";
export type ScheduledPost = {
  id: string;
  org_id: string;
  brand_id: string;
  social_account_id: string;
  caption: string;
  media: Json[];
  platform_options: Record<string, Json | undefined>;
  status: PostStatus;
  scheduled_for: string | null;
  locked_at: string | null;
  attempts: number;
  provider_post_id: string | null;
  post_url: string | null;
  published_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PublishAttempt = {
  id: string;
  org_id: string;
  post_id: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  outcome: "success" | "retryable_error" | "failed";
  error_code: string | null;
  error_message: string | null;
  provider_response: Json | null;
  created_at: string;
};

export type PostEdit = {
  id: string;
  org_id: string;
  post_id: string;
  edited_by: string | null;
  old_caption: string;
  new_caption: string;
  status: "applied" | "failed";
  created_at: string;
};

export type IntelligenceSectionKey = "website" | "instagram" | "facebook" | "linkedin" | "competitors" | "seo" | "audience";
export type IntelligenceReport = {
  id: string;
  org_id: string;
  brand_id: string;
  job_id: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  sections: Partial<Record<IntelligenceSectionKey, string>>;
  full_report: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TrendRun = {
  id: string;
  org_id: string;
  brand_id: string;
  job_id: string | null;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  sources_requested: string[];
  sources_completed: string[];
  source_status: Record<string, { ok: boolean; items?: number; reason?: string }>;
  ai_summary: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
};

export type TrendSignal = {
  id: string;
  org_id: string;
  brand_id: string;
  run_id: string;
  source: string;
  topic: string;
  relevance_score: number;
  relevance_reason: string | null;
  url: string | null;
  meta: Record<string, Json | undefined>;
  created_at: string;
};

export type StrategyScope = "day" | "week" | "month";
export type StrategySectionKey =
  | "campaign_planning"
  | "weekly_content_strategy"
  | "content_pillars"
  | "platform_strategy"
  | "lead_generation_strategy"
  | "cta_strategy";
export type CalendarItem = {
  scheduled_date: string | null;
  platform: string;
  content_type: string;
  title: string;
  hook?: string;
  pillar?: string;
};
export type Strategy = {
  id: string;
  org_id: string;
  brand_id: string;
  job_id: string | null;
  status: "processing" | "completed" | "approved" | "failed";
  scope: StrategyScope;
  platform: string;
  content_type: string;
  source_signal_ids: string[];
  source_signals_snapshot: { id: string; source: string; topic: string }[];
  ai_summary: string | null;
  sections: Partial<Record<StrategySectionKey, Json>>;
  content_calendar: CalendarItem[];
  header_insights: Json | null;
  pillar_balance: Json | null;
  error_detail: string | null;
  created_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CompetitorCandidate = {
  id: string;
  org_id: string;
  brand_id: string;
  job_id: string | null;
  name: string;
  website_url: string | null;
  reason: string | null;
  evidence_url: string | null;
  status: "suggested" | "accepted" | "rejected";
  decided_at: string | null;
  created_at: string;
};

export type TrendWatchStatus = "active" | "paused" | "budget_paused";
export type TrendWatch = {
  id: string;
  org_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  keywords: string[];
  excludes: string[];
  sources: string[];
  rss_feeds: string[];
  region: string;
  lookback_hours: number;
  relevance_threshold: number;
  frequency_minutes: 30 | 60 | 120 | 240 | 720 | 1440;
  monthly_budget_credits: number;
  status: TrendWatchStatus;
  spent_credits_month: number;
  month_key: string;
  next_run_at: string;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TrendWatchRun = {
  id: string;
  org_id: string;
  watch_id: string;
  job_id: string | null;
  status: "running" | "done" | "failed" | "skipped";
  trigger: "schedule" | "manual";
  source_status: Record<string, { ok: boolean; items?: number; reason?: string }>;
  found: number;
  new_items: number;
  kept: number;
  alerts: number;
  credits_spent: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

export type TrendEvent = {
  id: string;
  org_id: string;
  brand_id: string;
  watch_id: string;
  kind: "story" | "spike";
  title: string;
  summary: string | null;
  primary_url: string | null;
  source_count: number;
  relevance_score: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  positive_aspects: string | null;
  negative_aspects: string | null;
  importance: "low" | "medium" | "high";
  topic: string | null;
  why_it_matters: string | null;
  is_alert: boolean;
  embedding: number[];
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
};

export type TrendRule = {
  id: string;
  org_id: string;
  watch_id: string | null;
  name: string;
  min_relevance: number;
  min_importance: "low" | "medium" | "high";
  sentiments: string[];
  channel: "in_app" | "slack" | "webhook";
  target: string | null;
  digest: "immediate" | "daily" | "weekly";
  enabled: boolean;
  created_by: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  org_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan_id?: string;
          status?: OrgStatus;
          trial_ends_at?: string | null;
          created_by: string;
          onboarding_state?: Json | OnboardingState;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan_id?: string;
          status?: OrgStatus;
          trial_ends_at?: string | null;
          created_by?: string;
          onboarding_state?: Json | OnboardingState;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          email_notifications?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          email_notifications?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: Membership;
        Insert: {
          org_id: string;
          user_id: string;
          role: OrgRole;
          status?: MembershipStatus;
          monthly_credit_cap?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          user_id?: string;
          role?: OrgRole;
          status?: MembershipStatus;
          monthly_credit_cap?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      feature_access: {
        Row: FeatureAccess;
        Insert: {
          org_id: string;
          user_id: string;
          feature: string;
          level: FeatureLevel;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          org_id?: string;
          user_id?: string;
          feature?: string;
          level?: FeatureLevel;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brands: {
        Row: Brand;
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          status?: "active" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          status?: "active" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: Invitation;
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role: OrgRole;
          token_hash: string;
          invited_by: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: OrgRole;
          token_hash?: string;
          invited_by?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: AuditLog;
        Insert: {
          id?: string;
          org_id?: string | null;
          org_slug: string;
          actor_id?: string | null;
          action: string;
          target_type?: string | null;
          target_id?: string | null;
          metadata?: Json;
          ip?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      brand_profiles: {
        Row: BrandProfile;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          tagline?: string | null;
          industry?: string | null;
          description?: string | null;
          products_services?: string | null;
          target_audience?: string | null;
          goals?: string | null;
          website_url?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          social_urls?: Record<string, string>;
          service_areas?: string[];
          only_cite_approved_facts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          brand_id?: string;
          tagline?: string | null;
          industry?: string | null;
          description?: string | null;
          products_services?: string | null;
          target_audience?: string | null;
          goals?: string | null;
          website_url?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          social_urls?: Record<string, string>;
          service_areas?: string[];
          only_cite_approved_facts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_kits: {
        Row: BrandKit;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          logo_url?: string | null;
          logo_dark_url?: string | null;
          cover_url?: string | null;
          colors?: {
            primary: string;
            secondary: string;
            accent: string;
            background: string;
            text: string;
            [key: string]: string;
          };
          fonts?: {
            heading: string;
            body: string;
            [key: string]: string;
          };
          image_style_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          brand_id?: string;
          logo_url?: string | null;
          logo_dark_url?: string | null;
          cover_url?: string | null;
          colors?: {
            primary: string;
            secondary: string;
            accent: string;
            background: string;
            text: string;
            [key: string]: string;
          };
          fonts?: {
            heading: string;
            body: string;
            [key: string]: string;
          };
          image_style_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_voice: {
        Row: BrandVoice;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          tone_words?: string[];
          do_examples?: string | null;
          dont_examples?: string | null;
          banned_words?: string[];
          approved_ctas?: string[];
          preferred_hashtags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          brand_id?: string;
          tone_words?: string[];
          do_examples?: string | null;
          dont_examples?: string | null;
          banned_words?: string[];
          approved_ctas?: string[];
          preferred_hashtags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_facts: {
        Row: BrandFact;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          statement: string;
          source?: string | null;
          approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          brand_id?: string;
          statement?: string;
          source?: string | null;
          approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_pillars: {
        Row: BrandPillar;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          target_share_pct?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          brand_id?: string;
          name?: string;
          description?: string | null;
          target_share_pct?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      competitors: {
        Row: Competitor;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          name: string;
          website_url?: string | null;
          social_handles?: Record<string, string>;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          brand_id?: string;
          name?: string;
          website_url?: string | null;
          social_handles?: Record<string, string>;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: {
          id?: string;
          org_id: string;
          brand_id?: string | null;
          kind: string;
          status?: JobStatus;
          progress?: Job["progress"];
          input_ref?: Json | null;
          output_ref?: Json | null;
          error_code?: string | null;
          error_message?: string | null;
          cost_credits?: number;
          created_by?: string | null;
          heartbeat_at?: string | null;
          created_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: Partial<Job>;
        Relationships: [];
      };
      credit_ledger: {
        Row: CreditLedgerEntry;
        Insert: Omit<CreditLedgerEntry, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<CreditLedgerEntry>;
        Relationships: [];
      };
      ai_usage: {
        Row: AiUsage;
        Insert: Omit<AiUsage, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<AiUsage>;
        Relationships: [];
      };
      media_assets: {
        Row: MediaAsset;
        Insert: Omit<MediaAsset, "id" | "created_at" | "brand_id" | "width" | "height" | "sha256" | "created_by"> & {
          id?: string;
          created_at?: string;
          brand_id?: string | null;
          width?: number | null;
          height?: number | null;
          sha256?: string | null;
          created_by?: string | null;
        };
        Update: Partial<MediaAsset>;
        Relationships: [];
      };
      ai_cost_table: {
        Row: { model: string; provider: string; capability: string; unit: string; usd_per_unit: number; active: boolean; updated_at: string };
        Insert: { model: string; provider: string; capability: string; unit: string; usd_per_unit: number; active?: boolean };
        Update: { usd_per_unit?: number; active?: boolean };
        Relationships: [];
      };
      webhook_receipts: {
        Row: { id: string; provider: string; event_id: string; received_at: string };
        Insert: { provider: string; event_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      social_accounts: {
        Row: SocialAccount;
        Insert: Omit<SocialAccount, "id" | "created_at" | "updated_at" | "avatar_url" | "status" | "last_checked_at" | "connected_by"> & {
          id?: string;
          avatar_url?: string | null;
          status?: SocialAccountStatus;
          last_checked_at?: string | null;
          connected_by?: string | null;
        };
        Update: Partial<SocialAccount>;
        Relationships: [];
      };
      scheduled_posts: {
        Row: ScheduledPost;
        Insert: {
          id?: string;
          org_id: string;
          brand_id: string;
          social_account_id: string;
          caption?: string;
          media?: Json[];
          platform_options?: Record<string, Json | undefined>;
          status?: "draft" | "scheduled";
          scheduled_for?: string | null;
          created_by?: string | null;
        };
        // Wide on purpose: the service role (server code) also writes locks, attempts and provider fields.
        // A signed-in user is limited by the database guard trigger, not by this type.
        Update: Partial<ScheduledPost>;
        Relationships: [];
      };
      publish_attempts: {
        Row: PublishAttempt;
        Insert: Omit<PublishAttempt, "id" | "created_at" | "started_at" | "finished_at" | "error_code" | "error_message" | "provider_response"> & {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          provider_response?: Json | null;
        };
        Update: Partial<PublishAttempt>;
        Relationships: [];
      };
      post_edits: {
        Row: PostEdit;
        Insert: Omit<PostEdit, "id" | "created_at" | "status" | "edited_by"> & { id?: string; status?: "applied" | "failed"; edited_by?: string | null };
        Update: Partial<PostEdit>;
        Relationships: [];
      };
      social_connect_states: {
        Row: { id: string; org_id: string; brand_id: string; user_id: string; state_hash: string; expires_at: string; used_at: string | null; created_at: string };
        Insert: { org_id: string; brand_id: string; user_id: string; state_hash: string; expires_at: string };
        Update: { used_at?: string | null };
        Relationships: [];
      };
      intelligence_reports: {
        Row: IntelligenceReport;
        Insert: { org_id: string; brand_id: string; job_id?: string | null; status?: IntelligenceReport["status"]; sections?: IntelligenceReport["sections"]; created_by?: string | null };
        Update: Partial<IntelligenceReport>;
        Relationships: [];
      };
      trend_runs: {
        Row: TrendRun;
        Insert: { org_id: string; brand_id: string; job_id?: string | null; status?: TrendRun["status"]; sources_requested?: string[]; created_by?: string | null };
        Update: Partial<TrendRun>;
        Relationships: [];
      };
      trend_signals: {
        Row: TrendSignal;
        Insert: {
          org_id: string;
          brand_id: string;
          run_id: string;
          source: string;
          topic: string;
          relevance_score: number;
          relevance_reason?: string | null;
          url?: string | null;
          meta?: TrendSignal["meta"];
        };
        Update: Partial<TrendSignal>;
        Relationships: [];
      };
      strategies: {
        Row: Strategy;
        Insert: { org_id: string; brand_id: string; scope?: StrategyScope; status?: Strategy["status"]; ai_summary?: string | null };
        Update: Partial<Strategy>;
        Relationships: [];
      };
      strategy_signals: {
        Row: { id: string; org_id: string; strategy_id: string; signal_id: string; created_at: string };
        Insert: { org_id: string; strategy_id: string; signal_id: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      competitor_candidates: {
        Row: CompetitorCandidate;
        Insert: { org_id: string; brand_id: string; name: string; job_id?: string | null; website_url?: string | null; reason?: string | null; evidence_url?: string | null };
        Update: Partial<CompetitorCandidate>;
        Relationships: [];
      };
      trend_watches: {
        Row: TrendWatch;
        Insert: {
          org_id: string;
          brand_id: string;
          name: string;
          keywords: string[];
          description?: string | null;
          excludes?: string[];
          sources?: string[];
          rss_feeds?: string[];
          region?: string;
          lookback_hours?: number;
          relevance_threshold?: number;
          frequency_minutes?: TrendWatch["frequency_minutes"];
          monthly_budget_credits?: number;
          status?: "active" | "paused";
        };
        Update: Partial<TrendWatch>;
        Relationships: [];
      };
      trend_watch_runs: {
        Row: TrendWatchRun;
        Insert: { org_id: string; watch_id: string; job_id?: string | null; status?: TrendWatchRun["status"]; trigger?: TrendWatchRun["trigger"] };
        Update: Partial<TrendWatchRun>;
        Relationships: [];
      };
      trend_events: {
        Row: TrendEvent;
        Insert: Partial<TrendEvent> & { org_id: string; brand_id: string; watch_id: string; title: string; relevance_score: number };
        Update: Partial<TrendEvent>;
        Relationships: [];
      };
      trend_mentions: {
        Row: { id: string; org_id: string; watch_id: string; run_id: string; event_id: string | null; source: string; title: string; snippet: string | null; url: string | null; url_hash: string; published_at: string | null; created_at: string };
        Insert: { org_id: string; watch_id: string; run_id: string; event_id?: string | null; source: string; title: string; snippet?: string | null; url?: string | null; url_hash: string; published_at?: string | null };
        Update: { event_id?: string | null };
        Relationships: [];
      };
      trend_stats_daily: {
        Row: { org_id: string; watch_id: string; day: string; mention_count: number; mean_7d: number | null; stddev_7d: number | null; created_at: string };
        Insert: { org_id: string; watch_id: string; day: string; mention_count?: number; mean_7d?: number | null; stddev_7d?: number | null };
        Update: { mention_count?: number; mean_7d?: number | null; stddev_7d?: number | null };
        Relationships: [];
      };
      trend_rules: {
        Row: TrendRule;
        Insert: {
          org_id: string;
          name: string;
          channel: TrendRule["channel"];
          watch_id?: string | null;
          min_relevance?: number;
          min_importance?: TrendRule["min_importance"];
          sentiments?: string[];
          target?: string | null;
          digest?: TrendRule["digest"];
          enabled?: boolean;
        };
        Update: Partial<TrendRule>;
        Relationships: [];
      };
      trend_deliveries: {
        Row: { id: string; org_id: string; event_id: string; rule_id: string; channel: string; status: "sent" | "failed" | "queued_digest"; error: string | null; sent_at: string | null; created_at: string };
        Insert: { org_id: string; event_id: string; rule_id: string; channel: string; status: "sent" | "failed" | "queued_digest"; error?: string | null; sent_at?: string | null };
        Update: { status?: "sent" | "failed" | "queued_digest"; error?: string | null; sent_at?: string | null };
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: { org_id: string; user_id: string; type: string; title: string; body?: string | null; link?: string | null };
        Update: { read_at?: string | null };
        Relationships: [];
      };
    };
    Views: {
      credit_balance: {
        Row: { org_id: string; balance: number };
        Relationships: [];
      };
    };
    Functions: {
      start_watch_run: {
        Args: { p_watch: string; p_trigger: string; p_user?: string | null };
        Returns: { job_id: string | null; run_id: string | null; org_id: string | null; refused: string | null }[];
      };
      claim_due_watches: {
        Args: { p_limit?: number };
        Returns: { job_id: string; run_id: string; watch_id: string; org_id: string }[];
      };
      record_watch_spend: { Args: { p_watch: string; p_credits: number }; Returns: string };
      start_content_job: {
        Args: { p_kind: string; p_org: string; p_brand: string; p_user: string | null; p_input?: Json };
        Returns: { job_id: string; row_id: string }[];
      };
      approve_strategy: { Args: { p_strategy: string }; Returns: undefined };
      accept_competitor_candidate: { Args: { p_candidate: string }; Returns: string };
      reject_competitor_candidate: { Args: { p_candidate: string }; Returns: undefined };
      claim_due_posts: { Args: { p_limit?: number }; Returns: { id: string; org_id: string; brand_id: string }[] };
      rescue_stuck_posts: { Args: { p_minutes?: number }; Returns: number };
      consume_connect_state: { Args: { p_hash: string }; Returns: { org_id: string; brand_id: string; user_id: string }[] };
      credits_reserve: {
        Args: { p_org: string; p_user: string | null; p_job: string; p_amount: number; p_ref?: string };
        Returns: string;
      };
      credits_settle: { Args: { p_org: string; p_job: string; p_actual: number }; Returns: undefined };
      credits_release: { Args: { p_org: string; p_job: string }; Returns: undefined };
      credits_grant: { Args: { p_org: string; p_amount: number; p_ref: string; p_user?: string | null }; Returns: undefined };
      rescue_stuck_jobs: { Args: { p_minutes?: number }; Returns: number };
      credits_reconcile: { Args: Record<string, never>; Returns: { org_id: string; balance: number }[] };
      create_organization: {
        Args: {
          p_name: string;
          p_slug: string;
        };
        Returns: string;
      };
      accept_invitation: {
        Args: {
          p_token: string;
        };
        Returns: string;
      };
      my_role: {
        Args: { p_org: string };
        Returns: OrgRole | null;
      };
      my_feature_level: {
        Args: { p_org: string; p_feature: string };
        Returns: number;
      };
      my_feature_levels: {
        Args: { p_org: string };
        Returns: { feature: string; level: number }[];
      };
    };
    Enums: {
      org_role: OrgRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
