# Job Manager — Overview

## Product Summary

Job Manager is a personal job-search tracker web app. It lets a user sign in, browse/search job listings on a main dashboard, and keep track of the jobs they've applied to in a dedicated applications table.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Styling | Tailwind CSS v4 |
| UI components | shadcn/ui |
| Auth | Supabase Auth |
| Database | Supabase (Postgres) |
| Deployment | VPS / Docker behind a reverse proxy (nginx/Caddy/Traefik) |

## Scope For Now

In scope:
- Auth flows: sign in, sign up, forgot password
- Dashboard page for searching/browsing job listings
- Applications tab showing a table of jobs applied to

## Explicit Non-Goals (Deferred)

- **Job source**: how job listings are collected/ingested is not decided yet. The dashboard will ship as an explicit empty placeholder until this is defined.
- **Application tracking source**: how "jobs applied to" entries get created (manual entry vs. automated) is not decided yet. The applications table schema is draft only until this is defined.

See [architecture.md](./architecture.md) for route/data structure, [roadmap.md](./roadmap.md) for phased implementation order, and [security.md](./security.md) for the security baseline and hosting requirements. Per-feature specs live in [features/](../features/).
