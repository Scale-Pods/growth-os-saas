# Progress tracker

Update the **Status** column (`Not started` / `In progress` / `Blocked` / `Done`) and tick items as they finish. A phase is *Done* only when every item under "Acceptance" in its file is ticked.

| Phase | Name | Status | Started | Finished | Notes |
|---|---|---|---|---|---|
| P00 | Foundations | In progress | 2026-11-14 | | Done: monorepo, real ESLint (service-role/AI-SDK/console rules proven), fail-loud env validation, logger, health check, CI tests. Open: Sentry, git hooks, local supabase config, staging deploy, branch protection, zod 3.x audit advisory (fix needs zod 4 migration). Next upgraded to 15.5.29 / React 19 |
| P01 | Tenancy and auth | In progress | 2026-11-18 | | DB layer done: plan_limits, seat/brand limits, create_organization rate limit, access helpers, 353-check isolation suite (generated catalogue, mutation-tested) green locally and in CI job. Done: withOrg/withOrgAction (org from session, zod, rate limit, org_id-in-body rejected + lint rule), invitations (create/revoke/accept), Team page, audit helper, open-redirect fix; verified in browser against local Supabase. Auth: Turnstile on login/signup (enforced by Supabase Auth; no token = rejected, verified), MFA enrol/verify with owner/admin enforcement (verified in browser), Google button (needs provider creds). Migrations 1-5 applied to cloud project zkuhccuiofuloxemmuif (verified: RLS, 4 policies, no anon grants, search_path pinned). Cloud test passed 2026-11-22 (login, workspace, MFA, invite, 22 real-login RLS checks; test data removed). Found+fixed: org deletion blocked by audit trigger (migration 6, now in suite). Open: Turnstile on cloud, cloud Auth settings (captcha, MFA, redirect URLs, password length, email confirmation), Google credentials + live test, MFA guard on brand server actions (move to withOrgAction in P03), password-reset page + Turnstile, role-matrix test, apply to cloud |
| P02 | App shell | Mostly done | 2026-11-22 | | Shell, switchers, theme, nav filtered by access (Nibhi). Added: Modal (focus trap, Esc), ConfirmDialog with cost line, Toast, DataTable, StatusBadge, useCan + PermissionsProvider, error/loading/404/no-access pages, Esc closes mobile drawer, no sideways scroll at 360 px (fixed top bar), live credits pill. Open: brand-scoped routes /b/[brandSlug], light-theme polish, Lighthouse score, Sentry capture, dashboard "This week" strip |
| P03 | Brand kit and onboarding | Not started | | | |
| P04 | Job platform | In progress | 2026-11-22 | | Done and tested: migrations 7-8 (jobs, credit_ledger + balance view, ai_usage, ai_cost_table, media_assets, webhook_receipts, service-role-only credit functions, rescue, realtime); isolation suite 503 checks incl. credit rules + 20-parallel-reservation test (3 of 20 succeed, never negative); packages/ai gateway (reserve > call > moderate > settle/release, retries, JSON retry-once, injection delimiters, cost ceiling) with fake-provider tests; worker (pg-boss, runner, concurrency gate, rescue every minute, daily reconcile, health, graceful shutdown) with smoke test through the real queue; webhook signature/timestamp/replay framework; upload rules + presign/confirm routes + image normalize (12 MP > 2160 px, metadata stripped); useJob + JobProgress; /api/credits + credits pill; Platform page verified live in browser (queued/running/done/failed). Open: real R2 + provider keys (not yet supplied), one real generateText smoke test, deploy worker to Railway, apply migrations 7-8 to cloud, Realtime push not arriving on local stack (3 s polling covers it), Docker image build (failed on registry download in Docker Desktop, retry), per-org hourly caps + moderation hooks (P11), storage quota (P10) |
| P05 | Social connections and publishing | Not started | | | |
| P06 | Research and strategy | Not started | | | |
| P07 | Content creation | Not started | | | |
| P08 | Review and team | Not started | | | |
| P09 | Analytics, leads, automation | Not started | | | |
| P10 | Billing and entitlements | Not started | | | |
| P11 | Security and compliance | Not started | | | |
| P12 | Launch readiness | Not started | | | |
| P13 | After launch | Not started | | | |

## Gates (must be true before moving on)

- [ ] **After P01:** cross-tenant test suite passes on every table that exists.
- [ ] **After P04:** a job cannot run without a credit reservation; a failed job releases its credits.
- [ ] **After P05:** a test account connects a channel and publishes without any help from us.
- [ ] **After P10:** a test card upgrades a plan and limits change immediately; a webhook replay changes nothing.
- [ ] **After P11:** security scan clean, all findings in `05-risks-and-lessons.md` closed.
- [ ] **After P12:** load test passes its targets; backup restore drill done.

## Open decisions log

Add a line whenever a decision from `00-decisions-and-inputs.md` is confirmed or changed.

| Date | Decision | Answer | By |
|---|---|---|---|
| | | | |
