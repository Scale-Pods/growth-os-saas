-- ==============================================================================
-- Migration: 20261123000010_google_text_models.sql
-- Phase:     P04
-- Purpose:   Google retired gemini-2.5-flash for new API keys. Add the current text models
--            to the price table and switch the old one off. Prices are PLACEHOLDERS to be
--            checked against Google's price page; they live in data so they can change
--            without a deploy.
-- ==============================================================================
insert into public.ai_cost_table (model, provider, capability, unit, usd_per_unit) values
  ('gemini-3.1-flash-lite', 'google', 'text', 'per_1k_tokens', 0.0006),
  ('gemini-3.8-flash', 'google', 'text', 'per_1k_tokens', 0.0012)
on conflict (model) do nothing;

update public.ai_cost_table set active = false, updated_at = now() where model = 'gemini-2.5-flash';
