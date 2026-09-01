# MedVault Repair Tracker

This document is the source of truth for the three-phase MedVault repair. It records the verified starting architecture, phase ownership, implementation evidence, and risks that remain. Never add credentials, tokens, medical data, or secret URLs here.

## Original Architecture

- Frontend: Next.js
- API: Express
- Worker: BullMQ worker
- ORM: Prisma
- Current structured development DB: local PostgreSQL Docker database
- Authentication: Supabase Auth
- File storage: private Supabase Storage bucket `medical-documents`
- Queue: Railway Redis
- AI: Google Gemini

The starting development topology is hybrid: `.env.local` selects local PostgreSQL, while `.env` selects hosted Supabase Auth/Storage and Railway Redis. Docker also provides a local Redis service, but the effective `REDIS_URL` is remote.

## Phase Status

- [x] Phase 1 — Low Risk: COMPLETE
- [x] Phase 2 — Moderate Risk: COMPLETE
- [ ] Phase 3 — High Risk: BLOCKED AT SAFETY PREFLIGHT

## Original Problems

### 1. `.env.local` overrides hosted PostgreSQL with localhost

- Status: PARTIALLY FIXED — PHASE 3 CUTOVER BLOCKED
- Phase assigned: Phase 1 for explicit validation and diagnostics; Phase 3 for any hosted-database migration
- Files changed: `packages/shared/src/environment.ts`, `packages/database/prisma.config.ts`, `apps/api/src/config.ts`, `apps/worker/src/config.ts`, `.env.local` (ignored), `docs/ENVIRONMENTS.md`, `docs/DATABASE_MIGRATION_RUNBOOK.md`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Local allowed/pass; local forbidden/expected failure; remote forbidden/pass; Prisma integration checks passed in Phase 1. Phase 3 additionally confirmed that `.env.local` still selects local PostgreSQL, local TCP port 5432 is unavailable, and an explicit process variable selects the hosted target for Prisma without exposing credentials.
- Notes: Environment files still intentionally allow `.env.local` to win, but local use is explicit, enforced, and visible in safe diagnostics. The override must not be removed until migration verification passes; the runbook makes its removal a gated cutover step.
- Unresolved risks: Cross-device application data does not synchronize while structured data remains local, and the gated hosted cutover could not run.

### 2. `MEDVAULT_ALLOW_LOCAL_DATABASE=false` is not enforced

- Status: FIXED
- Phase assigned: Phase 1
- Files changed: `packages/shared/src/environment.ts`, `packages/database/prisma.config.ts`, `apps/api/src/config.ts`, `apps/worker/src/config.ts`, `.env.example`, `.env.local` (ignored)
- Tests performed: Unit and Prisma integration checks for allowed local, forbidden local, and allowed remote targets passed
- Notes: API, worker, and Prisma now share the same enforcement rule and safe error.
- Unresolved risks: Docker-local aliases outside the documented classifier require explicit review before being treated as local.

### 3. `.env.example` has malformed Supabase anonymous-key placeholders

- Status: FIXED
- Phase assigned: Phase 1
- Files changed: `.env.example`
- Tests performed: `docker compose --env-file .env.example config --quiet` passed; malformed-quote search passed
- Notes: The original four-quote anonymous-key examples were replaced with syntactically valid, non-secret placeholders.
- Unresolved risks: Placeholder credentials must still be replaced before external services can be used.

### 4. `NEXT_PUBLIC_API_URL` can accidentally use localhost in production

- Status: FIXED
- Phase assigned: Phase 1
- Files changed: `packages/shared/src/environment.ts`, `apps/web/lib/env.ts`, `apps/web/next.config.ts`, `apps/web/lib/env.test.ts`
- Tests performed: Development localhost/pass; production localhost/expected failure; full production build with temporary remote placeholder/pass
- Notes: The original unguarded localhost default was replaced by required public-variable validation and an explicit production loopback rejection.
- Unresolved risks: A real production API domain still needs to be chosen in deployment configuration.

### 5. Development package build/watch ordering can cause module-not-found errors

- Status: FIXED
- Phase assigned: Phase 1
- Files changed: `turbo.json`, `packages/shared/package.json`, `packages/medical/package.json`, `packages/ai/package.json`, `packages/database/package.json`
- Tests performed: Turbo dry-run graph confirmed dependency builds; shared watcher started with zero errors; lint/typecheck/test/build passed
- Notes: Internal packages still export `dist/index.js`; Turbo now builds dependency output before app startup and runs TypeScript watchers for subsequent source changes.
- Unresolved risks: Prisma schema changes still require the existing explicit client-generation command; TypeScript source changes are watched.

### 6. Environment naming and validation are insufficient

- Status: FIXED
- Phase assigned: Phase 1
- Files changed: `packages/shared/src/environment.ts`, `apps/api/src/config.ts`, `apps/worker/src/config.ts`, `apps/web/lib/env.ts`, `.env.example`, `docs/ENVIRONMENTS.md`
- Tests performed: Missing/invalid-variable tests passed for API, worker, and web; secret-redaction assertions passed
- Notes: API, worker, web, and Prisma now report safe variable-specific configuration errors and share URL/location policy helpers.
- Unresolved risks: Deployment-provider variable configuration remains outside the repository.

### 7. Local Redis exists while Railway Redis is selected

- Status: PARTIALLY FIXED
- Phase assigned: Phase 1 for diagnostics/documentation; Phase 2 for any queue reliability work
- Files changed: `packages/shared/src/environment.ts`, `apps/api/src/server.ts`, `apps/api/src/services/redis-connection.ts`, `apps/api/src/services/queue.ts`, `apps/api/src/services/rate-limit.ts`, `apps/worker/src/index.ts`, `apps/worker/src/redis-connection.ts`, `apps/web/next.config.ts`, `.env.example`, `docs/ENVIRONMENTS.md`
- Tests performed: Safe topology formatter tests passed; full production build logged the remote Redis host without credentials; queue/rate-limit client isolation and shutdown passed typecheck/tests
- Notes: Docker Compose starts Redis locally, but the effective development `REDIS_URL` still intentionally points to Railway. Queue producer, rate limiter, and worker now own separate clients with bounded reconnect diagnostics and independent shutdown.
- Unresolved risks: Both Redis options remain. API and worker must always select the same queue target for an environment, and the current remote-Redis/local-database topology is unsuitable for multiple computers running workers concurrently.

### 8. Production environment contract is undocumented

- Status: FIXED
- Phase assigned: Phase 1
- Files changed: `docs/ENVIRONMENTS.md`, `.env.example`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Documentation and placeholder review; dotenv parser passed
- Notes: No committed deployment configuration establishes production service targets.
- Unresolved risks: No production infrastructure or domain has been created, as required by Phase 1 scope.

### 9. API rate limiting is process-local

- Status: FIXED
- Phase assigned: Phase 2
- Files changed: `apps/api/src/config.ts`, `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/services/rate-limit.ts`, `apps/api/src/services/redis-connection.ts`, `.env.example`, `docs/ENVIRONMENTS.md`
- Tests performed: Single-process limit, shared Redis-counter behavior, hashed keys, fail-open/fail-closed outage behavior, development fallback, and health-check bypass passed
- Notes: Development defaults to the built-in memory store. Production defaults to a dedicated Redis-backed store with atomic increment/expiry, hashed client keys, and fail-closed behavior. Configuration can override both backend and outage policy.
- Unresolved risks: Production operators must confirm Redis capacity/latency and intentionally choose whether any environment may fail open.

### 10. Redis job loss can leave reports stuck

- Status: FIXED
- Phase assigned: Phase 2
- Files changed: `apps/api/src/config.ts`, `apps/api/src/server.ts`, `apps/api/src/services/queue.ts`, `apps/api/src/services/reconciliation.ts`, `apps/worker/src/processor.ts`, `apps/worker/src/prisma-repository.ts`, `.env.example`, `docs/DATA_LIFECYCLE.md`
- Tests performed: Missing/completed/failed/unknown job, active/waiting/delayed job, duplicate and concurrent reconciliation, stale QUEUED/PROCESSING, old document version, terminal states, requeue failure, and attempt-ceiling cases passed
- Notes: The API scans bounded stale batches, compares the deterministic document/version job against BullMQ, atomically claims stale database state, and requeues only when no live job exists. Repeatedly stale work becomes the recoverable failure `QUEUE_RECOVERY_EXHAUSTED`.
- Unresolved risks: Recovery is eventually consistent and depends on API uptime plus Redis availability. A durable database outbox remains a possible later hardening option.

### 11. No coordinated deletion workflow exists

- Status: FIXED FOR SINGLE DOCUMENTS
- Phase assigned: Phase 2
- Files changed: `apps/api/src/app.ts`, `apps/api/src/types.ts`, `apps/api/src/services/prisma-service.ts`, `apps/api/src/services/document-deletion.ts`, `docs/DATA_LIFECYCLE.md`
- Tests performed: Owned success, other-patient denial, queued and processed report deletion, active-job conflict, missing object, Storage failure compensation, and database failure marker passed
- Notes: `DELETE /v1/documents/:id` checks ownership through verified identity, handles the deterministic job, writes `DELETE_PENDING`, removes Storage through the API, and deletes cascading metadata. Storage failure restores state/job; database failure leaves a retryable marker.
- Unresolved risks: Direct/operator database deletes can still orphan objects. Account-wide deletion needs a durable outbox and remains intentionally unimplemented.

### 12. RLS and Supabase Data API exposure need review

- Status: PLAN COMPLETE; ENFORCEMENT BLOCKED IN PHASE 3
- Phase assigned: Phase 2
- Files changed: `docs/DATABASE_SECURITY_PLAN.md`, `docs/DATABASE_MIGRATION_RUNBOOK.md`, `docs/ENVIRONMENTS.md`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Source access-path review and current Supabase security/changelog review; hosted grants/RLS inspection was attempted but blocked before authentication by target connectivity
- Notes: Browser code uses the Express API, not Supabase Data API application tables. The Phase 3 recommendation is minimal Data API exposure, a dedicated Prisma backend role, restrictive grants, and RLS defense in depth if tables remain exposed.
- Unresolved risks: No hosted grants or RLS policies were changed. Hosted exposure, connection-role semantics, and Data API denial tests remain unverified.

### 13. Supabase Auth deletion can orphan application data

- Status: PARTIALLY FIXED
- Phase assigned: Phase 2
- Files changed: `apps/api/src/services/consistency.ts`, `apps/api/src/scripts/check-consistency.ts`, `apps/api/package.json`, `docs/AUTH_ACCOUNT_LIFECYCLE.md`
- Tests performed: Read-only Auth orphan detection, pagination/cap behavior, identifier fingerprinting, and live configured-project check passed; the one local patient maps to an existing Auth user
- Notes: The admin command checks each referenced Auth UUID through the server-only Admin API and never deletes data. Automatic hooks/webhooks were intentionally avoided.
- Unresolved risks: There is still no cross-service FK or automatic cleanup. Any account-wide deletion needs explicit product/legal intent, backups, durable progress, and tests.

### 14. No disaster-recovery or backup strategy exists

- Status: DOCUMENTED; OPERATIONAL BACKUP AND RESTORE BLOCKED IN PHASE 3
- Phase assigned: Phase 3
- Files changed: `.gitignore`, `docs/BACKUP_AND_RECOVERY.md`, `docs/DATABASE_MIGRATION_RUNBOOK.md`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Documentation review against current architecture and recovery behavior; Docker/source reachability and localhost PostgreSQL TCP probes failed safely; no dump or restore result is claimed
- Notes: PostgreSQL, Storage, Redis, Auth, and worker-crash scenarios have explicit backup/checkpoint/restore-test requirements, and `backups/` is ignored. No Phase 3 source backup could be created because the source PostgreSQL service was unavailable.
- Unresolved risks: The legacy source currently depends on recovery of its existing Docker service/volume; no current source dump or isolated restore has been verified, and hosted backup/Storage-backup posture remains unverified.

### 15. Gemini medical-data processing/privacy needs explicit documentation

- Status: DOCUMENTED; PROVIDER/LEGAL DECISIONS REMAIN
- Phase assigned: Phase 1 for documentation; later legal/provider decisions remain outside repository repair
- Files changed: `docs/ENVIRONMENTS.md`, `docs/AI_DATA_FLOW_AND_PRIVACY.md`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Documentation traced to source plus queue and worker prescription barriers, MIME checks, output validation, invalid-output failure, path namespace, and stale-version tests passed
- Notes: Full eligible-file bytes and MIME type are sent to Google Gemini. Records stored as `PRESCRIPTION` are blocked at queue and worker boundaries, but client-selected misclassification can let prescription content stored as `REPORT` reach Gemini. Persisted structured/raw output and the patient verification boundary are documented without compliance claims.
- Unresolved risks: Provider retention, region, legal basis, contractual controls, and organizational approval require non-code decisions before production.

### 16. Main structured database is local and does not synchronize across devices

- Status: BLOCKED IN PHASE 3 — CROSS-DEVICE PERSISTENCE UNRESOLVED
- Phase assigned: Phase 3
- Files changed: `docs/DATABASE_MIGRATION_RUNBOOK.md`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Docker/source reachability probe; localhost PostgreSQL TCP probe; target DNS and IPv6 TCP inspection; Prisma migration-status attempt; direct read-only PostgreSQL connection attempt
- Notes: The configured source could not be reached. The direct Supabase database endpoint is IPv6-only from this host and the current workstation has no working IPv6 route; no project-provided session-pooler connection is configured. Migration stopped at the mandatory safety gate.
- Unresolved risks: Another computer authenticating against the same Supabase project will not automatically see this computer's application records. Current source contents are not protected by a verified Phase 3 dump, hosted schema/data state is unknown, and cross-device persistence has not been tested.

### 17. Repository-wide formatting baseline is not clean

- Status: DEFERRED TO PHASE 2
- Phase assigned: Phase 2 cleanup or a separately approved formatting-only change
- Files changed: Phase 1 files were formatted; unrelated files were not rewritten
- Tests performed: `pnpm format:check` reported pre-existing style drift in 91 files; targeted Phase 1 formatting completed
- Notes: Phase 2 files were formatted with the pinned Prettier version. A whole-repository formatting rewrite would create broad unrelated churn and was not required by the Phase 2 acceptance suite.
- Unresolved risks: The optional repository-wide formatting check remains red until a dedicated cleanup is approved.

## Phase 1 Completion Record

- Overall status: COMPLETE
- Files changed: `.env.example`; `turbo.json`; internal package scripts; shared environment utilities/tests; API, worker, web, and Prisma environment integration/tests; `docs/ENVIRONMENTS.md`; this tracker; `.env.local` local-allow flag (ignored)
- Tests performed:
  - `pnpm lint` — passed, 11 Turbo tasks
  - `pnpm typecheck` — passed, 11 Turbo tasks
  - `pnpm test` — passed, 44 tests across 9 test files
  - `pnpm build` with a temporary remote `NEXT_PUBLIC_API_URL` — passed, 7 Turbo tasks
  - Production localhost web build — failed as expected with a safe variable-only error
  - Prisma local allowed — passed
  - Prisma local forbidden — failed as expected without printing the test URL/password
  - Prisma remote with local forbidden — passed
  - Docker Compose dotenv parsing — passed
  - Turbo development graph and package watcher smoke test — passed
- Notes: Phase 1 low-risk configuration, diagnostics, documentation, and developer orchestration are complete. No migration, schema, data, queue, RLS, deletion, provider, or production-infrastructure change was made.
- Unresolved risks: All Phase 2 and Phase 3 items above remain explicitly out of scope. The repository-wide formatting baseline remains separately deferred.

## Phase 2 Safety Checkpoint

- Captured: 2026-08-30 before any Phase 2 runtime change
- Git baseline: branch `main`, commit `efdf591`; the working tree contains only the uncommitted Phase 1 repair set already listed in this tracker (13 modified paths and 8 untracked paths). No unrelated user change was identified.
- Phase 1 status: COMPLETE. Shared environment validation, the explicit local-database guard, production loopback API rejection, corrected `.env.example`, Turbo dependency build/watch ordering, and `docs/ENVIRONMENTS.md` are present.
- Local database schema version: Prisma migration `20260807000000_initial`, read from local Docker PostgreSQL `_prisma_migrations` with a metadata-only query.
- Hosted database: not queried or altered.
- Queue: no job was inspected, removed, or changed while creating this checkpoint.
- Data handling: no table rows, medical content, storage paths, credentials, tokens, or signed URLs were printed.
- Baseline tests attempted:
  - `pnpm test` — blocked before test execution because the installed Prisma CLI could not resolve `@prisma/config`.
  - `pnpm typecheck` — blocked at the same `pnpm db:generate` prerequisite for the same missing installed module.
  - Phase 1 completion evidence immediately preceding this checkpoint remains 44 passing tests plus passing lint, typecheck, and build; the installed dependency state must be repaired and the full suite rerun before Phase 2 can be complete.
- Baseline tooling follow-up: the lockfile/package was intact. The initial failure was caused by restricted access to pnpm's external store junction; rerunning with the required filesystem permission resolved it without changing dependencies.
- Safety boundary: no migration, RLS change, hosted-data operation, storage deletion, or queue mutation was performed.

## Phase 2 Completion Record

- Overall status: COMPLETE
- Reliability changes:
  - bounded, configurable queue reconciliation for stale `QUEUED` and `PROCESSING` reports;
  - BullMQ state inspection for missing, waiting, active, delayed, completed, failed, and unknown jobs;
  - deterministic document/version job IDs reused for retries and recovery;
  - atomic database recovery claims and a configurable processing-attempt ceiling;
  - version/status-conditional worker claim, retry, failure, and persistence transitions;
  - transactional extraction/measurement replacement with no partial persistence;
  - dedicated Redis clients for queue producer, rate limiter, and worker, with safe diagnostics, reconnect behavior, and graceful shutdown.
- Security/data-lifecycle changes:
  - authenticated, ownership-scoped single-document deletion with active-job protection, Storage API deletion, cascade cleanup, compensation, and retryable partial-failure markers;
  - production Redis rate-limit store with atomic counters, hashed keys, explicit fail-open/fail-closed selection, and health-check bypass;
  - worker validation that the database-selected report path remains inside the Auth-user/document namespace;
  - bounded read-only PostgreSQL/Storage/Auth consistency command with fingerprinted output and no automatic deletion;
  - database security, backup/recovery, Auth lifecycle, document lifecycle, and Gemini privacy documents.
- Live read-only consistency result:
  - Supabase bucket reported private;
  - local database documents checked: 0;
  - hosted Storage objects checked: 6;
  - database-to-missing-object findings: 0;
  - Storage-to-local-database potential orphans: 6 path fingerprints;
  - local patients checked: 1;
  - missing Auth users: 0;
  - scans were not truncated and no object/user/row was changed.
- Tests performed:
  - `pnpm lint` — passed, 11 Turbo tasks
  - `pnpm typecheck` — passed, 11 Turbo tasks
  - `pnpm test` — passed, 80 tests across 13 test files (packages without tests passed explicitly)
  - `pnpm build` with temporary `NEXT_PUBLIC_API_URL=https://api.example.invalid` — passed, 7 Turbo tasks
  - API targeted suite — 47 tests passed
  - Worker targeted suite — 10 tests passed
  - `pnpm --filter @medvault/api check:consistency` — passed read-only checks
  - `pnpm --filter @medvault/database validate` — Prisma schema valid
  - `docker compose --env-file .env.example config --quiet` — passed
  - `git diff --check` — passed
- Phase 1 health: environment guards, `.env.example`, monorepo orchestration, and environment documentation remain in place; their regression tests are included in the 80-test suite.
- Database safety: no Prisma schema/migration file changed, no migration command ran, and local schema remains `20260807000000_initial`. Hosted PostgreSQL was not queried or altered.
- Cloud/data safety: no queue job, Storage object, Auth user, credential, database row, or hosted configuration was deleted or changed.
- Remaining Phase 2 risks:
  - the six hosted Storage objects have no matching metadata in the current local database; they were reported only and must not be deleted until Phase 3 establishes the authoritative database and backups;
  - queue recovery is eventually consistent and API-scheduled rather than a durable transactional outbox;
  - single-document deletion uses a recoverable status marker because the current schema has no deletion outbox; account-wide deletion is not implemented;
  - rate-limit fail-open configuration remains available for development and must not be selected accidentally in production;
  - no backup/restore has yet been proven, and hosted Data API grants/RLS remain unverified;
  - Gemini provider retention, residency, contractual, and compliance decisions remain external prerequisites;
  - repository-wide formatting drift outside the repair files remains deferred.

## Phase 3 Preconditions

Phase 3 must verify and record every item below before any database migration or cutover:

- Current local PostgreSQL is reachable and identified as the intended source.
- Hosted Supabase PostgreSQL is reachable and identified as the intended target.
- Restorable, encrypted backups are available for the local database and relevant Storage objects; restore tests have passed in isolation.
- Local and hosted schema versions/migration histories are identified and compared.
- Per-table local row counts are recorded without row contents.
- Per-table hosted row counts are recorded without row contents.
- Supabase Storage/Auth project identity is verified against the intended environment.
- The six current Storage-to-local-database mismatches are reconciled against the hosted database and backup inventory without automatic deletion.
- API and worker effective `DATABASE_URL` and `REDIS_URL` targets are understood and will change together.
- Hosted Data API exposure, grants, backend role, and RLS posture are reviewed and tested before tables become authoritative.
- A rehearsed rollback strategy defines the write-freeze point, source-of-truth decision, database restore/cutback, queue handling, and object reconciliation.
- Ownership/IDOR, queue recovery, signed URL, deletion, row-count, and integrity verification plans are ready for post-cutover execution.

Phase 2 does not perform any of these migration actions.

## Phase 3 Safety Checkpoint — Blocked

- Captured: 2026-08-30 during Phase 3 read-only preflight
- Overall status: BLOCKED. **CUTOVER NOT PERFORMED.**
- Safety decision: required source, target, backup, schema-history, row-count, connectivity, and rollback-rehearsal prerequisites could not all be established. No schema migration, data migration, RLS/grant change, environment cutover, database deletion, Storage mutation, Auth mutation, or queue mutation was performed.
- Repository change boundary: the migration/environment/security documentation was finalized for the blocked checkpoint and `backups/` was ignored. No credential-bearing environment file was changed.

### Safety Gate Results

| Safety prerequisite               | Evidence                                                                                                                                                                                                                                                              | Result     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Source database identity          | Configuration identifies Docker Compose PostgreSQL 17, database `medvault`, schema `public`, on localhost. Docker Desktop's Windows service was stopped and could not be started by this session; localhost TCP port 5432 was closed. Live identity was not verified. | FAILED     |
| Target database identity          | Safe environment metadata identifies Supabase PostgreSQL database `postgres`; its project reference matches the configured Supabase Auth/Storage URLs. Live identity could not be queried.                                                                            | INCOMPLETE |
| Source schema version             | The repository contains `20260807000000_initial`, and Phase 2 previously observed that migration locally. The source is now unreachable, so this is historical evidence rather than a current Phase 3 observation.                                                    | FAILED     |
| Target schema version             | `_prisma_migrations`, schema metadata, and target tables could not be queried.                                                                                                                                                                                        | FAILED     |
| Source backup                     | No Phase 3 backup was created because the source database was unavailable. A Docker volume or historical row count is not a verified backup.                                                                                                                          | FAILED     |
| Backup restore procedure          | `docs/DATABASE_MIGRATION_RUNBOOK.md` defines an isolated PostgreSQL 17 rehearsal, but no current backup exists to rehearse.                                                                                                                                           | FAILED     |
| Current row counts                | Current source counts and all target counts could not be collected. Phase 2 counts remain historical only.                                                                                                                                                            | FAILED     |
| Target connectivity               | The configured direct database endpoint resolved to IPv6 only. This workstation could not establish IPv6 TCP on port 5432; Prisma migration status and a read-only Node/PostgreSQL probe both failed before authentication.                                           | FAILED     |
| API and worker on the same target | Static inspection confirms API, worker, and Prisma consume `DATABASE_URL`; current `.env.local` still selects local PostgreSQL. Actual shared target connectivity could not be verified.                                                                              | INCOMPLETE |
| Rollback plan                     | The runbook now documents write freeze, pre-write cutback, post-write split-brain handling, queue safety, source restore, Storage preservation, and local retention. It cannot be rehearsed without live source access and a verified backup.                         | INCOMPLETE |

The target failure proves that this client path is unusable; it does not prove that the hosted database is down or that its credentials are invalid.

### Required Corrections Before Phase 3 Resumes

1. Start Docker Desktop with sufficient Windows privileges and verify the existing PostgreSQL container and `medvault` database without recreating or replacing its volume.
2. If the existing source cannot be recovered, identify and protect an authoritative replacement source before making a migration decision.
3. Obtain an exact reachable connection from the same Supabase project's Connect panel. On this IPv4-only client, use the project-provided Supavisor session-pooler details, or provide verified IPv6 connectivity for the direct endpoint. Do not guess pooler hostname, region, username, or credentials.
4. Repeat live, read-only identity, migration-history, table-list, row-count, and integrity queries against both databases.
5. Create a protected, non-empty logical source backup containing `_prisma_migrations`, application schema, and rows; validate its archive and rehearse an isolated PostgreSQL 17 restore.
6. Reconcile the six Phase 2 Storage mismatch candidates against hosted database metadata and the backup inventory without automatic download or deletion.
7. Inspect hosted grants, connection-role semantics, RLS, and Data API exposure. Commit and test the selected least-privilege design before the database becomes authoritative.
8. Only after every prerequisite passes may `prisma migrate deploy`, application-row transfer, verification, cutover, and cross-device tests be considered.

### Actions Explicitly Not Performed

- No hosted or local migration was applied.
- No application row was copied, updated, or deleted.
- No credential-bearing environment file or running service was switched from local to hosted PostgreSQL; the hosted URL was injected only into transient read-only CLI probes.
- No hosted grant, RLS policy, role, or Data API setting was changed.
- No Supabase Storage object or Auth account was changed.
- No Redis/BullMQ job was added, replayed, or removed.
- The local database and Docker volume remain the intended legacy migration source and were not retired.

## Final Architecture

The intended architecture remains:

- Browser and Next.js use Supabase Auth and the Express API; they receive no database credentials.
- Express API uses Prisma against the hosted PostgreSQL system of record and private Supabase Storage for medical-file operations.
- API and BullMQ worker share the exact same hosted PostgreSQL database and hosted Redis queue environment.
- The worker retrieves private report objects, sends report facts to Gemini for extraction, validates output, and persists results through Prisma.
- Redis/BullMQ is temporary processing infrastructure, not the source of record.

This architecture is documented but not yet the verified running architecture because Phase 3 cutover is blocked.

## Final System of Record

- Intended final system of record: hosted PostgreSQL.
- Current verified final system of record: **not established**.
- Legacy migration source: configured local Docker PostgreSQL, currently unreachable and retained without deletion.
- Authentication authority: Supabase Auth.
- Medical-file authority: private Supabase Storage bucket `medical-documents`.

## Remaining Non-Code Risks

- A Windows administrator or interactive user must restore Docker Desktop/Linux-engine availability without replacing the existing volume.
- The Supabase project must provide a reachable, exact database connection for the deployment network; this workstation currently lacks direct-endpoint IPv6 connectivity.
- Current source/target contents, migration history, grants/RLS, target backups, and restore behavior are unverified.
- The six hosted Storage objects previously unmatched by the local database remain unresolved and must not be deleted.
- A controlled write-freeze, migration review, isolated restore rehearsal, two-session cross-device test, failure tests, and IDOR validation still require live infrastructure and test identities.
- Production domain, hosting, secret distribution, monitoring, and incident ownership remain operational decisions.
- Gemini retention, processing region, contractual protections, legal basis, and organizational approval remain external privacy/compliance prerequisites.

## Phase 3 Completion Record

- Overall status: BLOCKED AT SAFETY PREFLIGHT
- Files changed in this attempt: `.gitignore`, `docs/DATABASE_MIGRATION_RUNBOOK.md`, `docs/ENVIRONMENTS.md`, `docs/DATABASE_SECURITY_PLAN.md`, `docs/BACKUP_AND_RECOVERY.md`, `docs/MEDVAULT_REPAIR_TRACKER.md`
- Tests performed: Docker engine/status probes; localhost PostgreSQL TCP probe; target A/AAAA resolution; target IPv6 TCP probe; Prisma migration-status attempt with an explicit hosted process variable; direct read-only Node/PostgreSQL connection attempt; `pnpm lint`, `pnpm typecheck`, `pnpm test` (80 tests), `pnpm build` with a temporary non-local public API placeholder, `pnpm db:validate`, and `docker compose --env-file .env.example config --quiet` all passed where connectivity was not required; Phase 3 documentation passed pinned Prettier and `git diff --check`
- Database/Storage/queue mutations: none
- Live-test boundary: API health, Auth, CRUD, upload, signed URL, queue, worker extraction, verification, dashboard, cross-device persistence, IDOR, deletion, reconciliation, failure injection, hosted security, and rollback rehearsal were not runnable against the intended databases and are not claimed.
- Phase completion: Phase 1 and Phase 2 remain complete. Phase 3 remains unchecked until every runbook gate and live verification passes.
