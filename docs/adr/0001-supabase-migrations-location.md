# ADR 0001 — Migrations live in packages/db/supabase/migrations

- **Status:** Accepted
- **Date:** 2026-11-18
- **Related:** CLAUDE.md rule 8, P00 step 3

## Context
The build plan says migrations live in `packages/db/migrations`. The Supabase CLI only reads `<workdir>/supabase/migrations` with timestamp-prefixed names, and `supabase start`, `db reset` and CI all depend on that layout.

## Decision
Use `packages/db` as the Supabase workdir: `packages/db/supabase/config.toml` and `packages/db/supabase/migrations/<timestamp>_name.sql`. Run the CLI with `--workdir packages/db` (see `pnpm --filter @growth-os/db db:start`).

## Consequences
- One source of truth, applied identically locally, in CI and on staging/production.
- Docs that mention `packages/db/migrations` mean this folder.
- Migrations 1 to 3 were edited in place because they had never been applied to any shared database. From now on, migrations are append-only.
