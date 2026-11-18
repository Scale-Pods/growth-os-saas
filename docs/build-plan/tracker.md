# Progress tracker

Update the **Status** column (`Not started` / `In progress` / `Blocked` / `Done`) and tick items as they finish. A phase is *Done* only when every item under "Acceptance" in its file is ticked.

| Phase | Name | Status | Started | Finished | Notes |
|---|---|---|---|---|---|
| P00 | Foundations | In progress | 2026-11-14 | | Done: monorepo, real ESLint (service-role/AI-SDK/console rules proven), fail-loud env validation, logger, health check, CI tests. Open: Sentry, git hooks, local supabase config, staging deploy, branch protection, zod 3.x audit advisory (fix needs zod 4 migration). Next upgraded to 15.5.29 / React 19 |
| P01 | Tenancy and auth | In progress | 2026-11-18 | | DB layer done: plan_limits, seat/brand limits, create_organization rate limit, access helpers, 353-check isolation suite (generated catalogue, mutation-tested) green locally and in CI job. Done: withOrg/withOrgAction (org from session, zod, rate limit, org_id-in-body rejected + lint rule), invitations (create/revoke/accept), Team page, audit helper, open-redirect fix; verified in browser against local Supabase. Auth: Turnstile on login/signup (enforced by Supabase Auth; no token = rejected, verified), MFA enrol/verify with owner/admin enforcement (verified in browser), Google button (needs provider creds). Open: Google credentials + live test, MFA guard on brand server actions (move to withOrgAction in P03), password-reset page + Turnstile, role-matrix test, apply to cloud |
| P02 | App shell | Not started | | | |
| P03 | Brand kit and onboarding | Not started | | | |
| P04 | Job platform | Not started | | | |
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
