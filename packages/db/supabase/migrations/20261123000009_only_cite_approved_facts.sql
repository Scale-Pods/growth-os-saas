-- ==============================================================================
-- Migration: 20261123000009_only_cite_approved_facts.sql
-- Phase:     P03
-- Purpose:   Per-brand switch "Only cite approved facts" (default ON). When on, prompts
--            may cite only the approved facts list. When off, the AI may use well-known
--            public facts with a named source, but must still never invent figures.
-- ==============================================================================
alter table public.brand_profiles
  add column if not exists only_cite_approved_facts boolean not null default true;
