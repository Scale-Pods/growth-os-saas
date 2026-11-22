# Nibhi's task list: UI building with Antigravity

You are building the **screens** of Growth OS SaaS. Hrishikesh and Claude Code build the **engine** (database, server code, AI, background worker). The two meet at a clear line, so you can work in parallel without breaking each other's work.

If you are new to the project, read **Part 1 and 2 only** (10 minutes), then do **Task T0**. Then pick tasks in order.

---

## Part 1. Who does what

| Person | Owns | Never touches |
|---|---|---|
| **Hrishikesh** | All keys and accounts (OpenAI, Gemini, Cloudflare, Railway, Supabase). Decisions. Merging to `main`. | |
| **Claude Code** | `packages/db` (database), `packages/ai`, `packages/shared`, `apps/worker`, `apps/web/src/app/api/**`, `apps/web/src/lib/api/**`, every `actions.ts` file, middleware | UI polish |
| **Nibhi (you)** | `apps/web/src/components/**` and new pages (`page.tsx`) and their styling | The folders in the previous row |

**The golden rule:** you build how it *looks and feels*. When a button needs to *do* something real (save, publish, connect), you leave a clearly marked stub and Claude wires it up:

```tsx
// TODO(claude): wire to server action
onSchedule={() => notify("Not connected yet", "error")}
```

You never need a password or API key. You work against a **local database with fake sample data** (Task T0 sets this up).

## Part 2. Rules (the short version)

These come from `CLAUDE.md` in the repo root. Antigravity must follow them:

1. **No secrets in code, chat, screenshots or commits.** Never open or paste any `.env` file's contents.
2. **No `console.log`.** The checks fail on it.
3. **Never call OpenAI, Gemini or any social platform from the browser.** UI components only show data and call the stubs.
4. **Never put a workspace id (`org_id`) in a request.** The server knows the workspace from the login.
5. **Every list needs an empty state** (use `EmptyState`), and every page needs loading and error states.
6. **Reuse what exists** in `apps/web/src/components/ui/` (`Modal`, `ConfirmDialog`, `Toast`, `DataTable`, `StatusBadge`, `PageHeader`, `MetricTile`, `EmptyState`, `Card`, `Badge`, `PlatformBadge`). Do not create a second version of any of them.
7. **Dark and light themes both must look right.** Use the colour tokens (`bg-background`, `text-foreground`, `border-border`, `text-primary` ...), never hard-coded colours.
8. **Works at 360 px, 768 px and 1440 px.** No sideways scrolling on a phone.
9. **Keyboard friendly:** visible focus ring, buttons are real `<button>`, images have `alt`.
10. Names: files are `kebab-case` or the existing `PascalCase.tsx` for components, variables `camelCase`.

## Part 3. How to work (every task)

```powershell
git checkout main
git pull
git checkout -b nibhi/<task-name>        # e.g. nibhi/calendar-screen
# ... build with Antigravity ...
pnpm lint
pnpm typecheck
pnpm test
git add -A
git commit -m "feat(ui): calendar screen"
git push -u origin nibhi/<task-name>
```

Then open a **Pull Request** into `main` on GitHub and tell Hrishikesh. Do not push straight to `main`. Keep each PR small: one task = one PR.

A PR description needs 4 lines: **What** you built, **Why**, **How you checked it** (a screenshot at phone and desktop size), **What could break**.

If `pnpm lint` or `typecheck` fails, fix it before pushing. Warnings are fine, errors are not.

### Start every Antigravity session with this

> Read `CLAUDE.md` and `docs/team/NIBHI-TASKS.md` first. I am working on task **<ID>** from that file. Only create or edit files in the places that task allows. Follow the rules in Part 2. Use the existing components in `apps/web/src/components/ui`. Before you finish, run `pnpm lint && pnpm typecheck` and fix every error.

---

## Task T0. Set up your computer (do this first, about 45 minutes)

You need: **Git**, **Node 22+**, **pnpm** (`npm install -g pnpm`), **Docker Desktop** (must be running).

```powershell
git clone https://github.com/Scale-Pods/growth-os-saas.git
cd growth-os-saas
pnpm install
```

**1. Start the local database** (first time downloads a few GB):

```powershell
cd packages/db/supabase
copy .env.example .env
cd ..
pnpm db:start
```

When it finishes it prints several values. You need `ANON_KEY` and `SERVICE_ROLE_KEY`. To print them again later: `pnpm exec supabase status -o env --workdir .`

**2. Create your web settings file** `apps/web/.env.development.local` (it is ignored by git, so it never gets committed). Paste the two keys in where shown:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

**3. Load the sample data** (one login, one brand, two fake channels, six posts in every status):

```powershell
cd packages/db
pnpm seed:dev
```

**4. Run the app:**

```powershell
cd ../..
pnpm --filter @growth-os/web dev
```

Open http://localhost:3000/login and sign in with **dev@scalepods-test.dev** / **DevPass-12345**. This test account needs no two-factor step. If the sign-in button complains about a "verification check", wait a few seconds and press it again.

**Done when:** you can see the dashboard with the sidebar. You can re-run `pnpm seed:dev` any time to reset the sample data.

> Sample data is **local only**. The seed script refuses to run against anything but your own computer.

---

## The tasks

Difficulty: 🟢 easy · 🟡 medium · 🔴 harder. Do them in order. Each says exactly which files you may touch.

### T1 🟢 Placeholder pages for every sidebar link
**Why:** 16 sidebar links lead to a "Page not found" today.
**Do:** Create one page for each missing route: `/trends`, `/trend-alerts`, `/strategy`, `/studio`, `/carousel-studio`, `/video-studio`, `/content`, `/review`, `/calendar`, `/publishing`, `/blog`, `/board`, `/analytics`, `/intelligence`, `/settings`, `/manual`. Make one shared `ComingSoon` component (title, one-sentence description, icon, link back to the dashboard) and use it everywhere. Copy the page structure of `apps/web/src/app/settings/team/page.tsx` (it loads the shell with `getAppContext` and wraps the page in `AppShell`).
**You may touch:** new `apps/web/src/app/<route>/page.tsx` files, new `apps/web/src/components/ComingSoon.tsx`.
**Done when:** every sidebar link opens a page that matches the app's look, in both themes.

> Prompt: *"Task T1. Using the structure of `apps/web/src/app/settings/team/page.tsx`, create a page for each missing sidebar route listed in the task, all using one new shared `ComingSoon` component with an icon, title and a one-line description per area. Match the existing design."*

### T2 🟢 Landing page (`/`)
**Why:** The home page still says "P01 Tenancy & Authentication Initialized".
**Do:** A real product landing page: hero, the 7-step loop (research, plan, create, review, publish, measure, learn) as an illustrated row, three feature cards, "Sign in" and "Create workspace" buttons. No fake customer logos or fake statistics.
**You may touch:** `apps/web/src/app/page.tsx`, new files in `apps/web/src/components/landing/`.
**Done when:** it looks good on phone and desktop in both themes.

### T3 🟢 User Manual (`/manual`)
**Do:** A readable help page: what each section of the sidebar is for, how a post goes from idea to published, and a short glossary (brand, workspace, credits, channel). Plain language, short paragraphs, collapsible sections. Do not hide it from anyone (everyone can open it).
**You may touch:** `apps/web/src/app/manual/page.tsx` (replace the T1 placeholder), `apps/web/src/components/manual/`.

### T4 🟢 Notification bell dropdown
**Do:** Build `NotificationBell` (client component, props only): bell icon with a red dot when `unreadCount > 0`, a dropdown listing notifications (icon, title, one line, relative time using `date-fns`), "Mark all read" button, and a nice empty state "You're all caught up". Props: `notifications: { id, title, body, createdAt, readAt, href? }[]`, `onMarkAllRead: () => void`. Replace the static bell in `TopBar.tsx` with it, passing an empty list and a stub for now.
**You may touch:** new `apps/web/src/components/NotificationBell.tsx`, and **only the bell part** of `TopBar.tsx`.
**Done when:** it opens and closes with click, Esc and clicking outside; works with the keyboard.

### T5 🟢 Sign-in, sign-up and password reset screens (look only)
**Do:** Polish `login`, `signup` pages, and add the screens `forgot-password` and `reset-password` (email field, success message, new password + confirm with a strength hint). Keep the Turnstile widget and the Google button exactly where they are.
**You may touch:** page and component files under `apps/web/src/app/login`, `signup`, new `forgot-password`, `reset-password`, and `apps/web/src/components`. **Do not edit** `apps/web/src/app/auth/actions.ts`. For the reset forms, leave `// TODO(claude): server action` stubs.

### T6 🟡 Dashboard: remove the fake numbers
**Why:** The dashboard shows made-up numbers (12 ready, 28 published, 14.8k engagement). A customer must never see invented data.
**Do:** Split the dashboard into small components (`MetricTile` row, "This week" strip, "Recent activity", "Connected platforms"). Feed them real data from the database through the user's session: counts of `scheduled_posts` by status, the next 7 days of scheduled posts, the latest 5 posts, and the `social_accounts` list. Anything with no data shows an `EmptyState` with a helpful next step ("Connect your first channel"). No engagement number until analytics exist: show "Available after you publish".
**You may touch:** `apps/web/src/app/dashboard/page.tsx` and new components in `apps/web/src/components/dashboard/`. Read data the way `settings/team/page.tsx` does (server component, `ctx.supabase`).
**Done when:** with the sample data you see 2 scheduled, 2 published, 1 failed, 1 draft; on a brand new workspace everything shows an empty state.

### T7 🟡 Calendar screen (`/calendar`)
**Do:** A month grid. Each day shows post chips (platform icon, short caption, time) coloured by status (green published, blue scheduled, orange failed, grey draft) using `StatusBadge` colours. Month navigation with `?month=2026-12` in the address. Clicking a chip opens a `Modal` with the full caption, status, channel and (if failed) the error message. A "New post" button on each day is **disabled** with the hover text "Coming soon" for now. Load posts from `scheduled_posts` for the visible month. Show times in the browser's time zone and print the zone name somewhere visible.
**You may touch:** `apps/web/src/app/calendar/page.tsx`, new `apps/web/src/components/calendar/*`.
**Types:** import `ScheduledPost`, `SocialAccount` from `@growth-os/db`.
**Done when:** the six sample posts appear on the right days, the empty month shows an empty state, and it is usable on a phone (switch to a list view under 640 px).

### T8 🟡 Publishing screen (`/publishing`)
**Do:** Filter tabs **All / Published / Scheduled / Failed / Drafts** with live counts. A grid of post tiles (image placeholder, caption, channel badge, status badge, time). Clicking a tile opens a preview `Modal` with the caption and a link to the live post when `post_url` exists. For failed posts show the reason and a **Retry** button (stub). Scheduled posts get **Reschedule** and **Cancel** buttons (stubs). Everything is read from `scheduled_posts` and `publish_attempts`.
**You may touch:** `apps/web/src/app/publishing/page.tsx`, new `apps/web/src/components/publishing/*`.
**Done when:** each filter shows the right sample posts, and every state has an empty state.

### T9 🟡 Channels settings (`/settings/channels`)
**Do:** A page listing connected channels grouped by brand: avatar, name, platform badge (`PlatformBadge`), status (green Active, orange **Needs reconnect**, grey Disconnected) and "last checked". Under it, a grid of "Connect Instagram / Facebook / LinkedIn / YouTube / X" buttons: all disabled with "Coming soon" for now. A **Reconnect** button on `needs_reconnect` rows and a **Disconnect** button (confirm with `ConfirmDialog`), both stubs. Add a sidebar link under Settings.
**The Connect buttons are wired by Claude (ready now):** `POST /api/social/connect` returns a link; the provider sends the user back and the server redirects to `/settings/channels?connected=1` or `/settings/channels?error=<reason>`. Your page must read those and show a friendly message at the top: `connected` (success toast "Channel connected"), `expired` ("That connection link expired. Please try again."), `invalid_state` ("That connection link was not valid."), `forbidden` ("Only owners and admins can connect channels."), `mfa` ("Finish two-factor sign-in first."), `plan_limit` ("Your plan's channel limit is reached."), `connect_failed` and `server` ("Something went wrong. Please try again.").
**You may touch:** `apps/web/src/app/settings/channels/page.tsx`, new `apps/web/src/components/channels/*`, and one line in `Sidebar.tsx`.

### T10 🔴 Post composer (`/publishing/new`)
**Do:** A two-column screen. **Left:** pick one or more channels (from `social_accounts`), write the caption with a **live character counter per platform** (Instagram 2,200 · LinkedIn 3,000 · Facebook 63,206 · X 280 · YouTube title 100), add hashtags, add media (stub uploader area), choose **Save draft** or **Schedule**. The scheduler date and time picker must **disable past dates, require at least 5 minutes from now, and show the time zone**. **Right:** a live preview card per selected platform with the right shape (Instagram square, LinkedIn wide, Facebook wide). Over-limit captions turn the counter red and block Schedule. All save actions are stubs that show a toast "Not connected yet".
**Do not copy the limits.** Import them: `import { PLATFORM_LIMITS, validatePostContent } from "@growth-os/shared"`. `PLATFORM_LIMITS.instagram.captionMax` gives the character limit, and `validatePostContent(platform, caption, mediaKinds)` returns `{ ok: true }` or `{ ok: false, message }`. Show that `message` to the user as is.
**You may touch:** `apps/web/src/app/publishing/new/page.tsx`, new `apps/web/src/components/composer/*`. Keep the composer a client component driven by props so Claude can wire the real save later.
**Done when:** every rule above works with the keyboard, in both themes, at 360 px.

### T11 🟡 Light theme and contrast pass
**Do:** Switch to the light theme and walk every page. Fix low contrast text, invisible borders and hard-coded colours (WCAG AA). Check that the focus ring is visible everywhere.
**You may touch:** `apps/web/src/app/globals.css` (colour tokens only) and component classes.

### T12 🟡 Accessibility and phone audit
**Do:** On every page at 360 / 768 / 1440 px: no sideways scrolling, tap targets at least 40 px, labels on all inputs, `alt` on images, headings in order. Run the browser's Lighthouse accessibility check on the dashboard; the target is **95 or more**. Write what you changed in the PR.

### T13 🟢 Docs
**Do:** Turn Task T0 into a short `docs/team/SETUP.md` after you have done it yourself (fix any step that did not work for you). Link it from `README.md`.

---

## Part 4. What happens next (so you know the plan)

| Phase | What it is | Who | Your part |
|---|---|---|---|
| **P05** (now) | Social accounts, posts, calendar, publishing | Claude: database (done), connect flow, scheduler, publish worker, wiring | T7, T8, T9, T10 |
| **P06** | Research and strategy (business report, trends, strategy) | Claude: AI jobs | The report/trend/strategy screens (we will give you task cards) |
| **P07** | Content creation (copy, images, carousels, video) | Claude: AI and render jobs | Studio screens, job progress UI |
| **P08** | Review and team (approvals) | Claude | Review board, comments UI |
| **P09** | Analytics and leads | Claude | Charts (`recharts`), leads table |
| **P10** | Billing | Hrishikesh + Claude | Pricing and plan screens (design only for now) |

You can use the typed data shapes straight away: `import type { ScheduledPost, SocialAccount, PublishAttempt, Job } from "@growth-os/db"`.

## Part 4b. What Claude has already built that your screens will call

You do not wire these, but you should know their names, so your stubs match. All are in `apps/web/src/app/publishing/actions.ts` (server actions) and return `{ ok: true, data }` or `{ ok: false, error: { message } }`. Always show `error.message` to the user.

| Action | What it does | Input |
|---|---|---|
| `savePostsAction` | Creates a draft or a scheduled post for each selected channel | `brandId`, `accountIds[]`, `caption`, `media[]`, `mode` (`draft` or `schedule`), `scheduledFor` (ISO time) |
| `updatePostAction` | Edits a post that is not publishing or published | `id`, any of `caption`, `media`, `mode`, `scheduledFor` |
| `reschedulePostAction` | Moves a scheduled post | `id`, `scheduledFor` |
| `cancelPostAction` | Cancels a post | `id` |
| `postNowAction` | Publishes right away (usually within seconds) | `id` |
| `retryPostAction` | Retries a failed post | `id` |

Rules the server already enforces (so your UI just reflects them): a scheduled time must be at least 5 minutes ahead; a post cannot be edited once it is publishing or published; a channel that "needs reconnect" cannot post; Instagram needs an image or video; X allows 280 characters.

Until real social providers are connected, everything runs on a **fake provider**. In local development you can test failures by typing a marker into the caption: `[fail:AUTH_EXPIRED]`, `[fail:RATE_LIMITED]`, `[fail-once:RATE_LIMITED]` or `[fail:MEDIA_INVALID]`. A post with `[fail:AUTH_EXPIRED]` ends as **Failed** with the reconnect message and flags the channel "Needs reconnect": use it to check your failed and reconnect states.

## Part 5. If you get stuck

- **"Page not found" or login loop:** check Docker is running, then `pnpm db:start` again.
- **Sign-in says verification check:** wait a few seconds and press again.
- **Data looks wrong:** `cd packages/db && pnpm seed:dev` resets it.
- **A check fails and you do not understand why:** paste the error to Antigravity with *"Fix this without changing files outside the allowed folders for my task"*, or ask Hrishikesh.
- **You need a new server action, database column or API:** do not build it. Leave a stub, and write what you need in the PR description. Claude builds it.
- **Never** run `pnpm db:reset` on a database you did not create yourself, and never edit files in `packages/db/supabase/migrations`.
