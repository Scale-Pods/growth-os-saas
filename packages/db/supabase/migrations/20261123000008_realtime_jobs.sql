-- ==============================================================================
-- Migration: 20261123000008_realtime_jobs.sql
-- Phase:     P04
-- Purpose:   Let the browser watch job progress live. Realtime only sends rows the
--            subscriber may read under RLS (jobs_select = members of the org).
-- ==============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
     ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end;
$$;
