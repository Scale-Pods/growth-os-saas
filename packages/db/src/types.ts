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
          email_notifications?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
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
    };
    Enums: {
      org_role: OrgRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
