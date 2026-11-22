-- ==============================================================================
-- Migration: 20261123000013_rescue_marks_placeholders.sql
-- Phase:     P06
-- Purpose:   When a worker dies mid-job, the rescue job already fails the job and returns its
--            credits. The report / trend run / strategy created for that job (the "placeholder
--            row") must not stay "processing" forever either: mark it failed with a reason.
--            Finished rows are never touched. Partial content already saved is kept.
-- ==============================================================================
create or replace function public.rescue_stuck_jobs(p_minutes int default 10)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
  v_msg constant text := 'The worker stopped responding before this finished. Anything already completed was kept and any reserved credits were returned. Please try again.';
begin
  for r in
    select id, org_id from public.jobs
    where status = 'running'
      and coalesce(heartbeat_at, started_at, created_at) < now() - make_interval(mins => p_minutes)
    for update skip locked
  loop
    update public.jobs
      set status = 'failed',
          error_code = 'WORKER_LOST',
          error_message = 'The worker stopped responding while running this job. Any reserved credits were returned. Please try again.',
          finished_at = now()
      where id = r.id and status = 'running';
    perform public.credits_release(r.org_id, r.id);

    update public.intelligence_reports set status = 'failed', error_message = v_msg
      where job_id = r.id and status in ('pending', 'processing');
    update public.trend_runs set status = 'failed', error_message = v_msg, finished_at = now()
      where job_id = r.id and status in ('pending', 'running');
    update public.strategies set status = 'failed', error_detail = v_msg
      where job_id = r.id and status = 'processing';

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
