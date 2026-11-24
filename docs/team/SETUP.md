# Developer Setup Guide

This guide walks you through setting up **Marketing Growth OS SaaS** locally for development.

---

## 1. Prerequisites

Make sure you have the following installed on your machine:

- **Git**
- **Node.js** (v20+ or v22+)
- **pnpm** (v10+ or v12+): Install via `npm install -g pnpm`
- **Docker Desktop** (must be running for local Supabase database services)

---

## 2. Clone and Install Dependencies

```powershell
git clone https://github.com/Scale-Pods/growth-os-saas.git
cd growth-os-saas
pnpm install
```

> **Note on Windows**: If installing packages across the monorepo, ensure PowerShell has execution permissions or run terminal commands with appropriate permissions.

---

## 3. Start Local Supabase Database

From the root directory:

```powershell
cd packages/db/supabase
copy .env.example .env
cd ..
pnpm db:start
```

When initialization completes, Supabase will output the connection credentials:
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- API URL: `http://127.0.0.1:54321`
- Database URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

*(To view these keys again later, run `pnpm exec supabase status -o env --workdir .` inside `packages/db`)*

---

## 4. Configure Web Application Environment

Create your local environment file at `apps/web/.env.local`:

```ini
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

> **Security Reminder**: `.env.local` is in `.gitignore`. Never commit keys or secrets to Git.

---

## 5. Seed Sample Development Data

Load the default development workspace, mock channels, and test posts:

```powershell
cd packages/db
pnpm seed:dev
```

This creates:
- 1 test user: `dev@scalepods-test.dev`
- 1 organization workspace
- 1 brand profile with brand kit
- 2 social channels (Instagram, LinkedIn)
- 6 sample posts across all workflow statuses (2 scheduled, 2 published, 1 failed, 1 draft)

---

## 6. Run the Application

Return to the repository root and start Next.js:

```powershell
cd ../..
pnpm --filter @growth-os/web dev
```

Open [http://localhost:3000/login](http://localhost:3000/login) in your browser:
- **Email:** `dev@scalepods-test.dev`
- **Password:** `DevPass-12345`

---

## 7. Troubleshooting

- **Verification Check Message on Sign-In**: Wait a few seconds for the local Turnstile stub to register and click sign in again.
- **Reset Sample Data**: You can re-run `pnpm seed:dev` anytime from `packages/db` to reset sample posts and channels.
- **Windows Webpack EPERM during build**: Run the production build command directly outside isolated subprocesses if Windows file lock triggers on `.next/server`.
- **Database Status**: Check container status anytime with `docker ps`.
