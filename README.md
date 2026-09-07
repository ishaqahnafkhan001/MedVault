# MedVault

MedVault is a patient-controlled personal medical-record platform. The MVP lets a patient authenticate, maintain a profile, privately upload reports and prescriptions, review structured report facts extracted by Gemini, and browse a searchable verified history. Documents classified as prescriptions are excluded from AI; the current classification is patient-selected metadata and does not independently detect mislabeled content.

## Stack

- Next.js App Router, React, Tailwind CSS, TanStack Query
- Express, Zod, Supabase Auth and private Supabase Storage
- Hosted Supabase PostgreSQL with Prisma
- BullMQ and Redis worker
- Gemini structured extraction behind a mockable adapter
- Vitest and Supertest

## Prerequisites

Node.js 22+, pnpm 11+, access to the shared Supabase project, a hosted Redis Cloud database, and a Gemini key for real report processing. PostgreSQL and Redis do not run locally in the standard development setup. Sentry is optional.

## Setup

```bash
pnpm install
cp .env.example .env
```

Fill the ignored root `.env` with private values from the shared providers. Prisma, the API, the worker, and Next.js load it automatically; no `source .env` step is needed. Root `.env.local` has higher precedence, so remove stale local `DATABASE_URL`, `REDIS_URL`, and local-allow flags from that file before starting.

Use the same hosted values on the Mac and Windows PC for `DATABASE_URL`, `REDIS_URL`, Supabase server/public settings, Storage bucket, and Gemini. Keep these application URLs local on both machines:

```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_ALLOW_LOCAL_API="true"
WEB_ORIGIN="http://localhost:3000"
```

Only `NEXT_PUBLIC_*` values are browser-visible. Never give `DATABASE_URL`, `REDIS_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `GEMINI_API_KEY` a `NEXT_PUBLIC_` prefix.

Next.js uses `NODE_ENV=production` while building even for a local start. `NEXT_PUBLIC_ALLOW_LOCAL_API=true` records that localhost is intentional for this architecture. Set it to `false` before any future deployed build.

### Hosted PostgreSQL and Redis

Copy the exact Supabase PostgreSQL connection string from the intended project's **Connect** panel. The long-running local API and worker can use a valid direct port-5432 connection when the network supports it. On an IPv4-only network, use the Supavisor **Session pooler** on port `5432`. Do not guess its host or username, and do not use the transaction pooler on port `6543` for Prisma migrations.

Database URLs are canonicalized before use, but passwords copied into URLs should still percent-encode reserved characters such as `@`, `#`, `/`, and `?`.

Copy the complete Redis Cloud URL, including credentials, port, and database path. API and worker must use the identical value. Development accepts either `redis://` or TLS-enabled `rediss://`; production requires canonical lowercase `rediss://` without a `tls` query override. Local PostgreSQL and Redis URLs are rejected by default; the `MEDVAULT_ALLOW_LOCAL_*` flags exist only for intentional optional tooling.

After the hosted values are correct:

```bash
pnpm db:generate
pnpm db:deploy
```

`db:deploy` applies only committed migrations and never resets the hosted database. Do not run `prisma migrate reset` or `prisma db push` against the shared project.

The shared Supabase project must contain a private bucket matching `SUPABASE_STORAGE_BUCKET`. [`docs/supabase-storage.sql`](docs/supabase-storage.sql) is a one-time, authorization-gated project operation; do not run it on every computer when the bucket already exists.

## Run

```bash
pnpm dev              # web :3000, API :4000, and worker
pnpm --filter @medvault/web dev
pnpm --filter @medvault/api dev
pnpm --filter @medvault/worker dev
```

The worker requires PostgreSQL, Redis, Supabase Storage, and `GEMINI_API_KEY` for live extraction. The web and API surface useful configuration errors when external services are unavailable.

Run one local worker at a time during normal development. If both computers run a worker, BullMQ distributes jobs between them and the database claim prevents duplicate extraction. With no worker running, report jobs remain queued until one starts.

Docker Compose remains in the repository only as optional legacy/test tooling. It is not part of the standard shared-data workflow and is not required to run MedVault.

## Verify

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm db:validate
pnpm build
```

Tests use fake authentication, storage, queues, and AI adapters and do not upload real medical files or call Gemini.

## Project structure

```text
apps/web       Patient-facing Next.js application
apps/api       Authenticated REST API
apps/worker    BullMQ report extraction worker
packages/ai    Gemini adapter and extraction contract
packages/database  Prisma schema and client
packages/medical   Deterministic normalization and categorization
packages/shared    Shared validation schemas and DTOs
docs           Architecture and MVP delivery notes
```

See [architecture](docs/architecture.md) and the [MVP implementation plan](docs/phase-1-plan.md).
