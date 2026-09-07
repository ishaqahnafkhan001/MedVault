# MedVault Environment Contract

MedVault loads the repository-root `.env.local` first and `.env` second. Existing process variables take priority over both files, and values loaded from `.env.local` take priority over the same names in `.env`. Both files are ignored by Git; `.env.example` is the safe template.

The API, worker, Prisma commands, and Next.js configuration follow this precedence. Never commit real credentials.

## Local Development

The normal development topology keeps application processes local and data services shared:

- PostgreSQL: the intended hosted Supabase project
- Redis/BullMQ: one hosted Redis Cloud database
- API: `http://localhost:4000`
- Web: `http://localhost:3000`
- Auth and private Storage: the same hosted Supabase project on both computers
- Gemini: the same approved hosted service configuration; without a key the development worker stays idle

On both Mac and Windows, `DATABASE_URL`, `REDIS_URL`, all Supabase settings, the Storage bucket, and the Gemini configuration must identify the same shared services. `NEXT_PUBLIC_API_URL` and `WEB_ORIGIN` remain localhost because each browser calls the API running on its own computer. Set `NEXT_PUBLIC_ALLOW_LOCAL_API=true`; Next.js uses production mode during a build even when that build will run only on the local computer.

`MEDVAULT_ALLOW_LOCAL_DATABASE` and `MEDVAULT_ALLOW_LOCAL_REDIS` default to `false`. The API, worker, and Prisma reject loopback/Docker service targets unless the applicable setting is deliberately changed to `true`. Those overrides support optional legacy/test tooling only and are not part of the standard workflow.

The effective value comes from the first source that defines a variable: an existing process variable, then root `.env.local`, then root `.env`. Remove stale local database/Redis overrides and allow flags from `.env.local`; otherwise they take priority over the hosted values in `.env`. Safe startup diagnostics show only local/remote classification and the Redis hostname, never credentials or full URLs.

## Two-computer shared development

Each computer runs:

- Next.js on `http://localhost:3000`
- Express on `http://localhost:4000`
- optionally one local BullMQ worker

The two machines must use byte-for-byte equivalent logical targets for PostgreSQL and Redis, including the Redis database path. Run only one worker for normal development. If both run, BullMQ distributes work and the versioned database claim protects against duplicate extraction. If neither runs, documents remain queued and recover when a worker starts.

Never mix a shared Redis queue with a local or different PostgreSQL database: a worker could consume a document ID that does not exist in its database.

## Production

Production is expected to use:

- Remote, backed-up PostgreSQL
- Remote Redis reachable by both API and worker
- Production Supabase Auth and private Storage
- A deployed HTTPS API URL (loopback and localhost are rejected)
- A configured Gemini key; the worker refuses to start without it
- Explicit monitoring, backup, restore, retention, and incident-response procedures

Set `NODE_ENV=production`, `MEDVAULT_ALLOW_LOCAL_DATABASE=false`, and `MEDVAULT_ALLOW_LOCAL_REDIS=false`. This repository does not define a production domain or provision production infrastructure. Production deployment is outside the current task.

## Hosted PostgreSQL Connection Contract

The current Prisma 7 configuration and `@prisma/adapter-pg` runtime consume one server-only `DATABASE_URL`. API, worker, and Prisma deployment commands must therefore be given connection strings for the same logical database. A second migration-only URL is not currently implemented; setting an arbitrary `DIRECT_URL` or similarly named variable has no effect.

For Supabase PostgreSQL:

- Use the direct port-5432 endpoint for long-running API/worker processes and migration tooling when the execution network supports IPv6 or the project has an IPv4 add-on.
- On IPv4-only infrastructure, obtain the exact Supavisor session-pooler port-5432 connection string from the intended project's Connect panel. Never infer its region, hostname, username, or password.
- Do not select the transaction pooler on port 6543 for migration commands. It is intended for short-lived/serverless connections and has different prepared-statement semantics.
- Require TLS using the provider-approved connection parameters and validate server SSL enforcement before production.
- Size total PostgreSQL connections across every API/worker replica against the hosted database limit. The current adapter uses the `pg` pool defaults and has no MedVault-specific pool-size setting.

Use a dedicated least-privilege runtime PostgreSQL role rather than a provider owner/admin role when the target supports it. Migration ownership and runtime access should be separate. Exact role/grant/RLS SQL remains blocked until the target's live owners, grants, default ACLs, Data API exposure, and RLS posture are inspected.

The explicit 2026-09-02 development decision discards old local application records. Do not import or merge local database rows and do not delete the old databases. Treat them as unused legacy artifacts. Inspect hosted migration history first, then use `pnpm db:deploy` to apply only committed migrations when needed. Never use `prisma migrate reset`, a destructive reset, or blind `prisma db push` against the shared project.

The hosted project currently contains the five application tables and the committed `20260807000000_initial` migration with a matching checksum. That read-only schema verification does not prove that a local process can connect through its private `DATABASE_URL`.

## Production Deployment Manifest

Review these groups as one release artifact; never commit their values.

- Frontend: `NODE_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_ALLOW_LOCAL_API=false`, and an HTTPS `NEXT_PUBLIC_API_URL`.
- API: `NODE_ENV=production`, hosted `DATABASE_URL`, both local-service allow flags false, a TLS-enabled hosted `REDIS_URL` using `rediss://`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, HTTPS `WEB_ORIGIN`, Redis-backed/fail-closed rate limiting, and the documented API/reconciliation settings.
- Worker: `NODE_ENV=production`, the exact same logical `DATABASE_URL` and TLS-enabled `REDIS_URL` as the API, both local-service allow flags false, the matching `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket, `GEMINI_API_KEY`, model, concurrency, and monitoring settings.
- Migration operator/job: an explicitly injected hosted `DATABASE_URL` for the same target, `MEDVAULT_ALLOW_LOCAL_DATABASE=false`, and no browser exposure.

The server and public Supabase URLs must identify the intended Auth/Storage project. The database connection must be independently verified as that project's intended PostgreSQL target; matching text in local configuration is not live identity proof.

## Environment Variables

Examples below are placeholders, not working credentials.

| Variable                            | Used by                     | Visibility                | Requirement                                     | Purpose                                                          | Safe example                                                                           |
| ----------------------------------- | --------------------------- | ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | API, worker, web            | Server/build              | Optional; defaults to development               | Selects development, test, or production validation              | `development`                                                                          |
| `DATABASE_URL`                      | API, worker, Prisma         | Secret/server             | Required                                        | Exact hosted PostgreSQL direct/session-pooler connection         | `postgresql://user.project:password@pooler.example.test:5432/postgres?sslmode=require` |
| `MEDVAULT_ALLOW_LOCAL_DATABASE`     | API, worker, Prisma         | Server                    | Optional; defaults false                        | Explicitly permits optional local PostgreSQL tooling             | `false`                                                                                |
| `REDIS_URL`                         | API, worker                 | Secret/server             | Required                                        | Complete hosted BullMQ Redis connection, including DB path       | `rediss://default:password@redis.example.test:6380/0`                                  |
| `MEDVAULT_ALLOW_LOCAL_REDIS`        | API, worker                 | Server                    | Optional; defaults false                        | Explicitly permits optional local Redis tooling                  | `false`                                                                                |
| `SUPABASE_URL`                      | API, worker                 | Server                    | Required                                        | Supabase project API URL for Auth verification and Storage       | `https://project-ref.supabase.co`                                                      |
| `SUPABASE_ANON_KEY`                 | API                         | Public-grade server value | Required                                        | Verifies bearer sessions through Supabase Auth                   | `your-public-anon-or-publishable-key`                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`         | API, worker                 | **Secret/server only**    | Required                                        | Private Storage upload, download, removal, and signed URLs       | `your-server-only-service-role-key`                                                    |
| `SUPABASE_STORAGE_BUCKET`           | API, worker                 | Server                    | Optional; defaults to `medical-documents`       | Private medical-file bucket                                      | `medical-documents`                                                                    |
| `NEXT_PUBLIC_SUPABASE_URL`          | Browser, Next.js server     | Public                    | Required                                        | Browser Supabase Auth endpoint                                   | `https://project-ref.supabase.co`                                                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Browser, Next.js server     | Public                    | Required                                        | Browser Supabase public key                                      | `your-public-anon-or-publishable-key`                                                  |
| `NEXT_PUBLIC_API_URL`               | Browser, build              | Public                    | Required                                        | REST API base URL                                                | `http://localhost:4000`                                                                |
| `NEXT_PUBLIC_ALLOW_LOCAL_API`       | Browser, build              | Public                    | Optional; defaults false                        | Explicitly permits localhost during a Next production-mode build | `true`                                                                                 |
| `API_PORT`                          | API                         | Server                    | Optional; defaults 4000                         | API listen port                                                  | `4000`                                                                                 |
| `WEB_ORIGIN`                        | API                         | Server                    | Optional; defaults localhost web                | Allowed CORS origin                                              | `http://localhost:3000`                                                                |
| `MAX_UPLOAD_BYTES`                  | API                         | Server                    | Optional                                        | Maximum request file size                                        | `15728640`                                                                             |
| `SIGNED_URL_TTL_SECONDS`            | API                         | Server                    | Optional                                        | Supabase signed-file URL lifetime                                | `300`                                                                                  |
| `RATE_LIMIT_WINDOW_MS`              | API                         | Server                    | Optional                                        | Rate-limit window                                                | `60000`                                                                                |
| `RATE_LIMIT_MAX`                    | API                         | Server                    | Optional                                        | Requests per rate-limit window                                   | `120`                                                                                  |
| `RATE_LIMIT_BACKEND`                | API                         | Server                    | Optional; memory in dev, Redis in production    | Shared or process-local limiter selection                        | `memory`                                                                               |
| `RATE_LIMIT_FAIL_OPEN`              | API                         | Server                    | Optional; true in dev, false in production      | Explicit request behavior during limiter-store outage            | `true`                                                                                 |
| `REPORT_STALE_AFTER_SECONDS`        | API                         | Server                    | Optional; defaults 900                          | Minimum age before queue reconciliation                          | `900`                                                                                  |
| `REPORT_RECONCILE_INTERVAL_SECONDS` | API                         | Server                    | Optional; defaults 60                           | Reconciliation scan interval                                     | `60`                                                                                   |
| `REPORT_RECONCILE_BATCH_SIZE`       | API                         | Server                    | Optional; defaults 100                          | Maximum stale reports per reconciliation pass                    | `100`                                                                                  |
| `REPORT_MAX_PROCESSING_ATTEMPTS`    | API                         | Server                    | Optional; defaults 8                            | Worker-processing-claim threshold checked by reconciliation      | `8`                                                                                    |
| `GEMINI_API_KEY`                    | Worker                      | **Secret/server only**    | Optional in development; required in production | Authorizes report fact extraction                                | `your-server-only-gemini-api-key`                                                      |
| `GEMINI_MODEL`                      | Worker                      | Server                    | Optional                                        | Gemini model identifier                                          | `gemini-2.5-flash`                                                                     |
| `REPORT_QUEUE_CONCURRENCY`          | Worker                      | Server                    | Optional                                        | Concurrent BullMQ jobs, limited to 1–10                          | `2`                                                                                    |
| `SENTRY_DSN`                        | API, worker, Next.js server | Secret/server             | Optional                                        | Server error reporting                                           | blank                                                                                  |
| `NEXT_PUBLIC_SENTRY_DSN`            | Browser                     | Public                    | Optional                                        | Browser error reporting                                          | blank                                                                                  |
| `SENTRY_ENVIRONMENT`                | API, worker                 | Server                    | Optional                                        | Monitoring environment label                                     | `development`                                                                          |

## Safe Diagnostics

API, worker, and Next.js startup output may identify:

- Database: local, remote, or not configured
- Redis: local, remote, or not configured
- Redis hostname without credentials, path, or query values
- Supabase: configured or not configured
- Gemini: configured or not configured
- Public API URL: local, remote, or not configured

Diagnostics must never print database passwords, Redis passwords, API keys, bearer tokens, JWTs, service-role keys, signed URLs, or complete secret connection strings. No public diagnostics endpoint is provided.

## Gemini Medical-Data Boundary

Only documents stored with the client-selected classification `REPORT` enter the BullMQ extraction queue. The worker downloads the complete file from private Supabase Storage and sends its bytes to Google Gemini with a fact-extraction prompt. Records stored as `PRESCRIPTION` are blocked by both the queue producer and worker, but the API does not independently detect prescription content mislabeled as `REPORT`.

The repository validates structured Gemini output and prohibits diagnosis, interpretation, and treatment advice. Source code cannot establish Google's retention, processing region, legal basis, contractual protections, or organizational access policy. Those items require an explicit product/legal/provider decision before production use.

## Production Safety Rules

- Never put `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, database credentials, or Redis credentials in a `NEXT_PUBLIC_*` variable.
- Never use a local or loopback `DATABASE_URL` when `MEDVAULT_ALLOW_LOCAL_DATABASE=false`.
- Never use a local or loopback `REDIS_URL` when `MEDVAULT_ALLOW_LOCAL_REDIS=false`.
- Production requires a canonical lowercase `rediss://` Redis URL without a `tls` query override; plaintext `redis://` remains a development-only option.
- For any future deployment, set `NEXT_PUBLIC_ALLOW_LOCAL_API=false` and use a non-local HTTPS `NEXT_PUBLIC_API_URL`.
- Keep API and worker database/Redis targets aligned within each environment.
- Keep database, Redis, service-role, Gemini, and migration credentials out of every `NEXT_PUBLIC_*` variable.
- Do not copy development `.env` files into production.

## Live acceptance checklist

Use synthetic data only. These checks are operational and must not be marked passed from unit tests:

1. Stop local PostgreSQL and Redis, set the exact hosted URLs, and run `pnpm db:generate`, `pnpm db:deploy`, then `pnpm dev`.
2. Confirm API and worker diagnostics both say `database=remote` and `redis=remote` with the expected safe hostname.
3. Save a synthetic profile, refresh, sign out, clear browser application data, sign in, and confirm the same profile returns.
4. Upload a synthetic report; confirm its database row, private object, BullMQ job, worker processing, extraction, and `NEEDS_REVIEW` state.
5. Sign in to the same account from the other computer with the same hosted settings and confirm the same profile, document, signed preview, and extraction.
