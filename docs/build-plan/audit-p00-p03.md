# Audit of the existing scaffold against P00–P03 (2026-11-18)

Method: read every acceptance item in `phases/P00`–`P03`, then checked the repo at `1ff14a6` (Nibhi's commits).
**Not run:** `pnpm install`, lint, typecheck and tests. `pnpm` is not installed on this machine, and `package.json` pins `pnpm@12.18.0`, which needs verifying. Nothing below is "tests pass"; it is "code exists / does not exist".
**Not checked (needs the dashboards):** GitHub branch protection, Vercel and Supabase settings, whether migrations 0001–0002 are applied to a database.

Legend: ✅ done · 🟡 partial · ❌ missing · ❓ cannot tell from the repo

## P00 Foundations

| Acceptance item | Status | Evidence / gap |
|---|---|---|
| New dev can clone, copy `.env.example`, `pnpm dev` | 🟡 | `.env.example` files and `turbo dev` exist. No `supabase/` dir (no local Supabase config), no README setup steps verified, no combined web+worker+db dev. |
| PR cannot merge without CI + review | ❓/🟡 | `.github/workflows/ci.yml` runs lint/typecheck/build only. No test job, no database/RLS job, no dependency audit. Every package's `lint` script is an `echo` stub, so lint checks nothing. Branch protection unknown. |
| Staging auto-deploys from `main`; prod only from tag with approval | ❌ | No deploy workflow, no tag flow. |
| Env validation fails loudly | 🟡 | `packages/shared/src/env.ts` has zod schemas, but nearly every variable is `.optional()`, the worker only `console.warn`s on failure, and `validateWebEnv` is never called by the web app. |
| Sentry receives test error (web, worker) | ❌ | No Sentry anywhere. |
| Backups on production DB | ❓ | Supabase setting. |
| ESLint blocks service-role import in client code | ❌ | No ESLint config in the repo at all. |
| Other P00 items | | Monorepo, turbo, workspaces, packages: ✅. `/api/health` exists but returns no DB check (`apps/web/src/app/api/health/route.ts`) 🟡. Request-id in middleware ✅ (`lib/supabase/middleware.ts`). Git hooks ❌. `docs/adr/` ❌. shadcn/ui ❌ (hand-written primitives in `apps/web/src/components/ui`, not in `packages/ui`) 🟡. Worker uses `console.log` (breaks CLAUDE.md rule) ❌. `CLAUDE.md` ✅. |

## P01 Tenancy and auth

| Acceptance item | Status | Evidence / gap |
|---|---|---|
| Signup email + Google; unverified email blocked | 🟡 | Email signup/login in `app/auth/actions.ts`. No Google. Email confirmation depends on a Supabase setting (❓). |
| Turnstile blocks scripted signup | ❌ | No Turnstile code. |
| Owners/admins forced through MFA | ❌ | No MFA code. |
| B cannot touch A on every table (suite green) | 🟡 | Strong policies in `0001_tenancy.sql` (per-command, `(select auth.uid())`, `set search_path = ''`, last-owner trigger, immutable org_id). But `packages/db/tests/isolation.test.ts` tests **anonymous access only**: no `b_owner`/`a_viewer` users, no cross-org attempts, a hard-coded table list (not generated from `information_schema`), not in CI. `cross-tenant-rls.sql` is a richer manual SQL-editor script, also not in CI. |
| Admin can't demote last owner; viewer can't invite | 🟡 | Implemented in SQL (`prevent_last_owner_removal`, `can_invite_role`); not proven by an automated test. |
| Brand limit refused by DB | 🟡 | Trigger in `0002_brand_kit.sql` works but limits are **hard-coded in the function**, not read from a `plan_limits` table (breaks "limits are data", 03 §5). |
| Table with RLS disabled fails CI | ❌ | |
| No API route reads `org_id` from body | 🟡 | Server actions derive `org_id` from the brand row, good. No lint/CI check, and no `withOrg`. |
| Other P01 items | | Tables `organizations/profiles/memberships/feature_access/brands/invitations/audit_log` ✅. `create_organization` ✅ but **no per-user rate limit** 🟡. Plan/trial defaults ✅. `accept_invitation` RPC ✅ (hash, expiry, verified email). Invitation **API route, email sending, and UI** ❌. `withOrg` helper ❌ (actions use ad-hoc `createClient()` with no zod and no rate limit). Team settings page ❌ (`/settings` is referenced by middleware but has no page). Server `audit()` helper ❌ (DB triggers cover role/invite changes only; sign-ins not logged). Account pending/suspended wall ❌. `brands_*` policies key on feature `'strategy'` rather than `'brand'` 🟡 (looks like a mistake). `private.*` trigger functions are granted to `authenticated` in 0002 (not needed; tighten). |

## P02 App shell

| Acceptance item | Status | Evidence / gap |
|---|---|---|
| Works at 360/768/1440, mobile drawer + Esc/backdrop | ❓ | `AppShell`, `Sidebar`, `TopBar` exist; drawer/Escape handling appears present but unverified in a browser. |
| Theme persists, no flash | ✅ (likely) | Cookie `sp-theme` read in `app/layout.tsx`, written in `ThemeToggle.tsx`. |
| Viewer sees no write actions; no-access page | ❌ | No `useCan`, no feature-based nav filtering, no "No access" page. |
| Brand switch changes data without reload | ❓ | `BrandSwitcher` exists. Routes are flat (`/dashboard`, `/clients`), not `/(app)/b/[brandSlug]/…`. |
| Lighthouse a11y ≥ 95 | ❓ | Not measured. |
| Sentry captures client error with request id | ❌ | No Sentry; no `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere. |
| Other | | Org switcher ✅ (`WorkspaceSwitcher`), dashboard v0 ✅ (`dashboard/page.tsx`, 472 lines, not checked for empty states). Shared components partly present; Modal, ConfirmDialog, Toast, DataTable, StatusBadge, PostTile ❌. Credits pill ❌. |

## P03 Brand kit and onboarding

| Acceptance item | Status | Evidence / gap |
|---|---|---|
| Onboarding steps 1–3 and 5 in < 10 min | 🟡 | `OnboardingWizard.tsx` (758 lines) exists, state in `organizations.onboarding_state`. Step 5 needs the invitation flow, which is missing. |
| `brandContext` has literal facts + banned words (snapshot tests) | 🟡 | `packages/shared/src/brandContext.ts` and tests exist. Not run. Check for `renderPromptHeader` and the "no approved fact → no number" rule. |
| Second brand's data never under the first | 🟡 | Tables scoped by `brand_id`; isolation test doesn't cover it; no `/b/[slug]` routing. |
| Logo uploads reject scripts/wrong types/oversize | ❌ | Logo is a plain URL text field (`logo_url`). No upload route, no SVG sanitizing, no R2. (Depends on P04 presign.) |
| Starter can't create a second brand (DB refusal) | 🟡 | Trigger exists; hard-coded; untested. |
| Onboarding resume at the right step | 🟡 | `onboarding_state.step` exists; untested. |
| Other | | Migration `0002_brand_kit.sql` ✅: 6 tables, RLS per command, org_id indexes, immutability triggers. **Not in a generated isolation catalogue** (hard-coded list). Profile/kit/voice/facts/pillars/competitors UI ✅ (`clients/BrandManagementView.tsx`, 1,309 lines: split up). Preview card present (unverified). Facts "only cite approved facts" toggle: no column in `brand_voice`/`brand_facts` 🟡. |

## What I propose to do first (not started)

1. Get tooling running (pnpm, install), then run the real lint/typecheck/test baseline and record it here.
2. Finish **P00** gaps: real ESLint (incl. service-role, AI-SDK and `console.log` rules), env validation that fails, health check with DB, CI with test + DB jobs, `supabase/` local config, ADR folder.
3. Then **P01 gate**: rewrite the isolation suite (generated catalogue, `a_owner`/`a_viewer`/`b_owner`, every command, every function), move limits to `plan_limits`, add `create_organization` rate limit, then `withOrg`, invitations API/UI, Team page, audit helper, Turnstile, Google, MFA.
