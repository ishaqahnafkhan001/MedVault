# MedVault Environment Contract

MedVault loads the repository-root `.env.local` first and `.env` second. Existing process variables take priority over both files, and values loaded from `.env.local` take priority over the same names in `.env`. Both files are ignored by Git; `.env.example` is the safe template.

The API, worker, Prisma commands, and Next.js configuration follow this precedence. Never commit real credentials.

## Local Development

The normal local-development option is a hybrid topology:

- PostgreSQL: `localhost:5432` from `docker-compose.yml`
- Redis: `localhost:6379` from `docker-compose.yml`
- API: `http://localhost:4000`
- Web: `http://localhost:3000`
- Supabase Auth and private Storage: hosted Supabase project
- Gemini: hosted Google service when a key is configured; otherwise the development worker stays idle

Set `MEDVAULT_ALLOW_LOCAL_DATABASE=true` whenever `DATABASE_URL` intentionally targets localhost, loopback, the Docker host gateway, or the Compose `postgres` service. With the setting false or omitted, local PostgreSQL is rejected.

Redis is selected only by the effective `REDIS_URL`. Starting the Docker Redis container does not select it. If `.env` contains a Railway Redis URL and `.env.local` does not override `REDIS_URL`, the API and worker use Railway. Safe startup diagnostics report `redis=local` or `redis=remote` and the hostname only; credentials and full URLs are never logged.

## Shared Development / Staging

A shared environment should use isolated non-production resources:

- A shared remote PostgreSQL database
- A shared remote Redis instance
- A dedicated Supabase project for Auth and private Storage
- A deployed HTTPS API URL
- A separate Gemini key with appropriate quotas and access controls
- Optional Sentry projects dedicated to that environment

Set `MEDVAULT_ALLOW_LOCAL_DATABASE=false`. Use the same PostgreSQL and Redis targets for the API and worker. Do not mix a shared queue with per-developer databases because a worker can consume a job whose document does not exist in its database.

## Production

Production is expected to use:

- Remote, backed-up PostgreSQL
- Remote Redis reachable by both API and worker
- Production Supabase Auth and private Storage
- A deployed HTTPS API URL (loopback and localhost are rejected)
- A configured Gemini key; the worker refuses to start without it
- Explicit monitoring, backup, restore, retention, and incident-response procedures

Set `NODE_ENV=production` and `MEDVAULT_ALLOW_LOCAL_DATABASE=false`. This repository does not define a production domain or provision production infrastructure.

## Hosted PostgreSQL Connection Contract

The current Prisma 7 configuration and `@prisma/adapter-pg` runtime consume one server-only `DATABASE_URL`. API, worker, and Prisma deployment commands must therefore be given connection strings for the same logical database. A second migration-only URL is not currently implemented; setting an arbitrary `DIRECT_URL` or similarly named variable has no effect.

For Supabase PostgreSQL:

- Use the direct port-5432 endpoint for long-running API/worker processes and migration tooling when the execution network supports IPv6 or the project has an IPv4 add-on.
- On IPv4-only infrastructure, obtain the exact Supavisor session-pooler port-5432 connection string from the intended project's Connect panel. Never infer its region, hostname, username, or password.
- Do not select the transaction pooler on port 6543 for migration commands. It is intended for short-lived/serverless connections and has different prepared-statement semantics.
- Require TLS using the provider-approved connection parameters and validate server SSL enforcement before production.
- Size total PostgreSQL connections across every API/worker replica against the hosted database limit. The current adapter uses the `pg` pool defaults and has no MedVault-specific pool-size setting.

Use a dedicated least-privilege runtime PostgreSQL role rather than a provider owner/admin role when the target supports it. Migration ownership and runtime access should be separate. Exact role/grant/RLS SQL remains blocked until the target's live owners, grants, default ACLs, Data API exposure, and RLS posture are inspected.

During Phase 3 discovery, inject the candidate hosted URL as a process variable. Existing process variables win over `.env.local` and `.env`, so this permits a read-only target check without changing development configuration. Only after backup, migration, row-count, relationship, Storage, Auth, and rollback gates pass should the local `DATABASE_URL`/allow flag be removed from `.env.local` and both API and worker be switched together.

## Production Deployment Manifest

Review these groups as one release artifact; never commit their values.

- Frontend: `NODE_ENV=production`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and an HTTPS `NEXT_PUBLIC_API_URL`.
- API: `NODE_ENV=production`, hosted `DATABASE_URL`, `MEDVAULT_ALLOW_LOCAL_DATABASE=false`, hosted `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, HTTPS `WEB_ORIGIN`, Redis-backed/fail-closed rate limiting, and the documented API/reconciliation settings.
- Worker: `NODE_ENV=production`, the exact same logical `DATABASE_URL` and `REDIS_URL` as the API, `MEDVAULT_ALLOW_LOCAL_DATABASE=false`, the matching `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, bucket, `GEMINI_API_KEY`, model, concurrency, and monitoring settings.
- Migration operator/job: an explicitly injected hosted `DATABASE_URL` for the same target, `MEDVAULT_ALLOW_LOCAL_DATABASE=false`, and no browser exposure.

The server and public Supabase URLs must identify the intended Auth/Storage project. The database connection must be independently verified as that project's intended PostgreSQL target; matching text in local configuration is not live identity proof.

## Environment Variables

Examples below are placeholders, not working credentials.

| Variable                            | Used by                     | Visibility                | Requirement                                     | Purpose                                                     | Safe example                                         |
| ----------------------------------- | --------------------------- | ------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| `NODE_ENV`                          | API, worker, web            | Server/build              | Optional; defaults to development               | Selects development, test, or production validation         | `development`                                        |
| `DATABASE_URL`                      | API, worker, Prisma         | Secret/server             | Required                                        | PostgreSQL connection                                       | `postgresql://user:password@localhost:5432/medvault` |
| `MEDVAULT_ALLOW_LOCAL_DATABASE`     | API, worker, Prisma         | Server                    | Optional; defaults false                        | Explicitly permits an intentional local PostgreSQL target   | `true`                                               |
| `REDIS_URL`                         | API, worker                 | Secret/server             | Required                                        | BullMQ Redis connection                                     | `redis://localhost:6379`                             |
| `SUPABASE_URL`                      | API, worker                 | Server                    | Required                                        | Supabase project API URL for Auth verification and Storage  | `https://project-ref.supabase.co`                    |
| `SUPABASE_ANON_KEY`                 | API                         | Public-grade server value | Required                                        | Verifies bearer sessions through Supabase Auth              | `your-public-anon-or-publishable-key`                |
| `SUPABASE_SERVICE_ROLE_KEY`         | API, worker                 | **Secret/server only**    | Required                                        | Private Storage upload, download, removal, and signed URLs  | `your-server-only-service-role-key`                  |
| `SUPABASE_STORAGE_BUCKET`           | API, worker                 | Server                    | Optional; defaults to `medical-documents`       | Private medical-file bucket                                 | `medical-documents`                                  |
| `NEXT_PUBLIC_SUPABASE_URL`          | Browser, Next.js server     | Public                    | Required                                        | Browser Supabase Auth endpoint                              | `https://project-ref.supabase.co`                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`     | Browser, Next.js server     | Public                    | Required                                        | Browser Supabase public key                                 | `your-public-anon-or-publishable-key`                |
| `NEXT_PUBLIC_API_URL`               | Browser, build              | Public                    | Required                                        | REST API base URL; local allowed only outside production    | `http://localhost:4000`                              |
| `API_PORT`                          | API                         | Server                    | Optional; defaults 4000                         | API listen port                                             | `4000`                                               |
| `WEB_ORIGIN`                        | API                         | Server                    | Optional; defaults localhost web                | Allowed CORS origin                                         | `http://localhost:3000`                              |
| `MAX_UPLOAD_BYTES`                  | API                         | Server                    | Optional                                        | Maximum request file size                                   | `15728640`                                           |
| `SIGNED_URL_TTL_SECONDS`            | API                         | Server                    | Optional                                        | Supabase signed-file URL lifetime                           | `300`                                                |
| `RATE_LIMIT_WINDOW_MS`              | API                         | Server                    | Optional                                        | Rate-limit window                                           | `60000`                                              |
| `RATE_LIMIT_MAX`                    | API                         | Server                    | Optional                                        | Requests per rate-limit window                              | `120`                                                |
| `RATE_LIMIT_BACKEND`                | API                         | Server                    | Optional; memory in dev, Redis in production    | Shared or process-local limiter selection                   | `memory`                                             |
| `RATE_LIMIT_FAIL_OPEN`              | API                         | Server                    | Optional; true in dev, false in production      | Explicit request behavior during limiter-store outage       | `true`                                               |
| `REPORT_STALE_AFTER_SECONDS`        | API                         | Server                    | Optional; defaults 900                          | Minimum age before queue reconciliation                     | `900`                                                |
| `REPORT_RECONCILE_INTERVAL_SECONDS` | API                         | Server                    | Optional; defaults 60                           | Reconciliation scan interval                                | `60`                                                 |
| `REPORT_RECONCILE_BATCH_SIZE`       | API                         | Server                    | Optional; defaults 100                          | Maximum stale reports per reconciliation pass               | `100`                                                |
| `REPORT_MAX_PROCESSING_ATTEMPTS`    | API                         | Server                    | Optional; defaults 8                            | Worker-processing-claim threshold checked by reconciliation | `8`                                                  |
| `GEMINI_API_KEY`                    | Worker                      | **Secret/server only**    | Optional in development; required in production | Authorizes report fact extraction                           | `your-server-only-gemini-api-key`                    |
| `GEMINI_MODEL`                      | Worker                      | Server                    | Optional                                        | Gemini model identifier                                     | `gemini-2.5-flash`                                   |
| `REPORT_QUEUE_CONCURRENCY`          | Worker                      | Server                    | Optional                                        | Concurrent BullMQ jobs, limited to 1–10                     | `2`                                                  |
| `SENTRY_DSN`                        | API, worker, Next.js server | Secret/server             | Optional                                        | Server error reporting                                      | blank                                                |
| `NEXT_PUBLIC_SENTRY_DSN`            | Browser                     | Public                    | Optional                                        | Browser error reporting                                     | blank                                                |
| `SENTRY_ENVIRONMENT`                | API, worker                 | Server                    | Optional                                        | Monitoring environment label                                | `development`                                        |

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
- Never build production web assets with a local or loopback `NEXT_PUBLIC_API_URL`.
- Keep API and worker database/Redis targets aligned within each environment.
- Keep database, Redis, service-role, Gemini, and migration credentials out of every `NEXT_PUBLIC_*` variable.
- Do not copy development `.env` files into production.
