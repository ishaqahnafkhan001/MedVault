# MedVault

MedVault is a patient-owned medical record platform. Phase 1 lets a patient authenticate, maintain a profile, privately upload reports and prescriptions, review structured report data extracted by Gemini, and browse a searchable verified history. Prescriptions are never sent to AI.

## Stack

- Next.js App Router, React, Tailwind CSS, TanStack Query
- Express, Zod, Supabase Auth and private Supabase Storage
- PostgreSQL/Supabase with Prisma
- BullMQ and Redis worker
- Gemini structured extraction behind a mockable adapter
- Vitest and Supertest

## Prerequisites

Node.js 22+, pnpm 11+, a Supabase project, PostgreSQL, and Redis. Gemini and Sentry are optional for deterministic local tests; Gemini is required for real report processing.

## Setup

```bash
pnpm install
cp .env.example .env
```

The root `.env.local` and `.env` files are loaded automatically by Prisma, the API, the worker, and Next.js. Values in the ignored `.env.local` take priority, which is useful for local database overrides.

### PostgreSQL and Redis

Choose one local-infrastructure option:

**Docker:**

```bash
docker compose up -d postgres redis
```

**Homebrew on macOS:**

```bash
brew install postgresql@17 redis
brew services start postgresql@17
brew services start redis
createdb medvault
```

When using Homebrew, update `DATABASE_URL` in `.env` for your local PostgreSQL username. You can instead use your Supabase PostgreSQL connection string for `DATABASE_URL` and a hosted Redis provider for `REDIS_URL`; Docker is not required.

Supabase direct database hosts can be IPv6-only. On an IPv4-only network, use the Supavisor **session pooler** connection string from the Supabase dashboard, or place a local PostgreSQL override in `.env.local`.

Database URLs are canonicalized before use, but passwords copied into URLs should still percent-encode reserved characters such as `@`, `#`, `/`, and `?`.

After PostgreSQL is available and `DATABASE_URL` is correct:

```bash
pnpm db:generate
pnpm db:migrate
```

In Supabase, run [`docs/supabase-storage.sql`](docs/supabase-storage.sql) to create the private Storage bucket matching `SUPABASE_STORAGE_BUCKET`. Configure the variables in `.env`; the service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix.

## Run

```bash
pnpm dev              # web :3000, API :4000, and worker
pnpm --filter @medvault/web dev
pnpm --filter @medvault/api dev
pnpm --filter @medvault/worker dev
```

The worker requires PostgreSQL, Redis, Supabase Storage, and `GEMINI_API_KEY` for live extraction. The web and API surface useful configuration errors when external services are unavailable.

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
docs           Architecture and Phase 1 delivery notes
```

See [architecture](docs/architecture.md) and the [Phase 1 plan](docs/phase-1-plan.md).
