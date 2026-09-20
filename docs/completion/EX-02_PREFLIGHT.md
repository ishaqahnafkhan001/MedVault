# EX-02: hosted reconciliation preflight and gated recovery plan

Plan `MV-COMPLETE-2026-09-10-v1`. Discovery evidence: 2026-09-10 UTC; protected backup: 2026-09-12 UTC; isolated restore/reconciliation/post-stop verification: 2026-09-18 UTC; maintenance-window hosted read-only refresh: 2026-09-19 UTC. Checkout: dirty `antigravity`, HEAD `b078f39aa90e45a9d2b71dc8bbb3c6320113beb0`. Preserve EX-01 and all inherited changes.

**HOSTED MIGRATION / CUTOVER NOT PERFORMED. EX-02 is blocked.** A protected application-only logical backup, isolated restore and local history/additive/security/runtime rehearsal were completed historically, followed by a current maintenance-window read-only hosted refresh. The operator declined local recovery-key custody and then declined all backup. The existing local evidence remains intact but is not an approved rollback gate. No hosted DDL, migration resolution, deployment, environment edit, account change, Storage mutation or queue operation was issued. Exact definitions, verified TLS, recoverable protection and database/API authorization evidence remain mandatory; the backup stop condition cannot be waived by a read-only snapshot.

This runbook applies to the already-centralized hosted database. The September 2 owner decision discards old Mac/Windows local records. Do not use the superseded local-to-hosted transfer procedure in `docs/DATABASE_MIGRATION_RUNBOOK.md`; do not import, delete or use legacy local databases as rollback targets. The capture migration's comment references a nonexistent `docs/PHASE2_MIGRATION_RUNBOOK.md`; this document is the current EX-02 plan. Its historical SQL was not edited to repair that comment.

## 1. Evidence and scope

- [Definition snapshot](ex02/hosted-schema.json): metadata only, captured 19:30:42 UTC; 159 columns, 28 constraints, 35 indexes and 50 enum labels. No application row values.
- [Aggregate and security snapshot](ex02/hosted-preflight.json): one read-only statement at 19:35:01 UTC. Includes exact counts, relationship checks, migration metadata, table owners/RLS, effective grants and default ACLs.
- [Repeatable preflight query](ex02/verification.sql): SELECT-only; requires the existing hosted `auth` and `storage` metadata, so do not run unchanged on an application-only restore.
- [Supplementary definition metadata](ex02/hosted-definition-supplement.json): 19:41:18 UTC; all public tables are permanent heap tables without custom options, no nondefault column collations, no public sequences/domains. Database encoding is UTF8 and locale is `en_US.UTF-8`; preserve/review collation behavior when choosing an isolated restore platform.
- [Offline definition comparator](ex02/compare-schema.mjs) and its tests compare the initial + capture migrations with the saved definitions. See the generated [comparison result](ex02/comparison-result.json) for actual differences, migration hashes and limitations. This is not a restore or permission test, and a snapshot is not evidence that the live database has stayed unchanged.
- Additional read-only observations in this session: same active Supabase project; no public views, user routines, user triggers or policies; no `medvault_private` schema; anonymous and service-role Data API HEAD probes returned 200 for `patients` without requesting response bodies. An actual authenticated user's JWT was not used.
- Maintenance-window read-only refresh: after the operator reported both computers stopped and local ports 3000/4000/55441 were confirmed closed, a new repeatable-read SELECT-only session over verified TLS still reported the same 14 public relations, exact initial migration history and protected schema inventory. All application and non-orphan external integrity aggregates are zero; missing Storage metadata and missing Auth mappings are zero; three existing Storage orphan candidates remain. The encrypted outside-Git evidence is `hosted-readonly-maintenance-20260919t150629z.json`, SHA-256 `0a141bad07cb0184c106d7be41b663a6b66f7e034e3d3ff8d3d07e6084d9a8e1`. This was a bounded snapshot, not a database-level lock, and does not authorize mutation without recovery.

Do not rerun a broad audit after interruption. Check root `track.md`, pending outcomes and current files, then refresh only time-sensitive evidence before mutation. Current observations are not a maintenance-window backup baseline.

## 2. Database identity and connection gate

| Item                      | Observed value / limitation                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider / project        | Supabase, `ginzrzcgjmkrpkdywfds`, MedVault, `ACTIVE_HEALTHY`, region `ap-south-1`                                                                                                                                                       |
| Direct hostname           | `db.ginzrzcgjmkrpkdywfds.supabase.co`                                                                                                                                                                                                   |
| Configured connection     | Session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, database `postgres`, schema `public`                                                                                                                                        |
| Server                    | PostgreSQL 17.6; provider version observed as 17.6.1.155                                                                                                                                                                                |
| Auth / Storage alignment  | Root server and public Supabase URLs resolve to the same project reference as the database username suffix                                                                                                                              |
| API / worker / Prisma CLI | Load the same root configuration; `.env.local` is absent. Existing running-process equivalence is not certified by inspecting files                                                                                                     |
| Runtime role              | Configured owner-style `postgres` account; catalog role can log in, create roles/databases and bypass RLS. No dedicated `medvault%` role found                                                                                          |
| TLS                       | The public Supabase production CA was obtained from the first-party Dashboard source; a process-only source probe and both dump sessions passed certificate and hostname verification. Application runtime handling remains unverified. |

The earlier default/system-CA probes failed `SELF_SIGNED_CERT_IN_CHAIN` before SQL. That historical result is superseded for the recovery workflow: Supabase's first-party Dashboard source identified the production CA download, its expected certificate was pinned outside Git, and a fresh node-postgres identity probe plus PostgreSQL 17 dump connections passed `verify-full`/hostname validation. No TLS bypass or provider SSL-setting change was used. The pooler's backend `pg_stat_ssl` observation was false; that describes the pooler-to-database leg, not the independently verified client-to-pooler TLS session. Runtime Prisma/API/worker trust behavior still needs a separate test. See [Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement).

Keep long-running API/worker connections on the verified session endpoint unless direct IPv6 connectivity is deliberately selected. Use a verified direct connection for maintenance when reachable, or the provider's session-pooler alternative for IPv4; do not switch to transaction mode for dump/restore or migration sessions. Obtain actual endpoints from Connect, not a constructed guess. See [connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 3. History and exact intended changes

| Migration                                                   | SHA-256 of local SQL                                               | Live history                                                            | Intended handling after gates                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `20260807000000_initial`                                    | `b7bf19338333b70fdba8ecaf3906b362824bc0389124964c7cf69d687f19cf32` | Recorded, finished, one applied step, not rolled back; checksum matches | Retain unchanged; never replay or resolve again                                                                               |
| `20260908000000_capture_existing_episode_medication_schema` | `23f8ed918d6f1eb815ec480a32fc2885acfa74e3d5a002c30e349fc631416290` | Absent                                                                  | Resolve as applied ONLY if every captured definition matches and the backup/restore gate passes; creates no application data  |
| `20260908010000_reviewed_medical_summaries`                 | `cba57bfb92ec1f5781ad4c43a6c12b87c96eb2ad847cacfae741c82f4d37b329` | Absent; `medical_summaries` absent                                      | Apply the existing reviewed additive SQL only after isolated rehearsal, fresh comparison and security readiness               |
| `20260919000000_harden_application_database_access`         | `fca1962c08f6cbfea01f645cf55398eb4cfbb844255097a50c7d82140b673051` | Absent; current broad hosted grants/RLS-off posture remains             | Apply with the summary migration only after all hosted gates; creates a NOLOGIN runtime role and denies Data API table access |

The initial SQL represents five tables, 78 columns, five enums, nine explicit indexes and four foreign keys. Capture adds eight tables, 81 columns, five enums, 13 explicit indexes and 11 foreign keys. Including primary-key indexes, the current baseline is 13 application tables, 159 columns, 10 enums / 50 labels, 35 indexes and 28 constraints. Compare types/lengths, nullability, defaults, column positions, enum order, key columns, FK actions/validation, uniqueness, sort direction and index readiness, not these totals alone.

Observed offline comparison: **MATCH_WITHIN_CAPTURED_SCOPE**, zero differences across those definitions. 25 regression tests passed in the implementer, parent and independent review runs. This completes the bounded 02.1 comparison, not 02.2 restoration or 02.5 security acceptance. Supplementary metadata checks above narrow some comparator limitations; freshly recapture both before any history mutation.

Preserve intentional physical semantics: UUIDs and `updated_at` have no database defaults; the ORM supplies them. Timestamps are `timestamp(3) without time zone`. Profile array columns remain nullable in the initial SQL. All existing FKs update-cascade; medication prescription deletion sets the reference to null, while other declared FKs delete-cascade. Auth mappings and several child patient-ownership relationships are application-enforced, not newly invented composite FKs. Do not change those contracts inside a capture reconciliation.

The additive summary migration's exact SQL remains in `packages/database/prisma/migrations/20260908010000_reviewed_medical_summaries/migration.sql`. It adds:

- `medical_summaries`: 21 columns; primary key; unique scope key; patient/status index; three FKs; scope, status and bounded-attempt/generation checks.
- `medvault_private.invalidate_medical_summaries()`: invoker-security function with a fixed search path and patient-row fence. It marks existing summaries stale and clears claims/leases on source changes. It performs no AI call.
- Five source-invalidation triggers on documents, extractions, measurements, episodes and memberships. Rehearse insert/update/delete, cascades, stale publication and lock ordering, not just successful table creation.
- RLS plus browser-role revocation on only four tables: summaries, episodes, memberships and analyses. This does **not** secure the entire application, migration metadata, HTTP service-role access or future table defaults.

All three pending migrations are now fixed at the checksums above. The two executable migrations use explicit transactions and 5-second lock timeouts; the capture is resolved only after exact comparison. Do not edit their SQL after rehearsal or turn a failed application into a fake successful history record. An unexpected partially created summary/security object, checksum change, failed history record or difference beyond the reviewed scope is a STOP condition.

## 4. Counts, relationships and Storage

| Table                | Current hosted rows |
| -------------------- | ------------------: |
| patients             |                   6 |
| patient_profiles     |                   5 |
| medical_documents    |                   7 |
| report_extractions   |                   2 |
| report_measurements  |                   0 |
| episodes             |                   1 |
| episode_memberships  |                   0 |
| episode_analyses     |                   0 |
| medications          |                   0 |
| medication_schedules |                   0 |
| schedule_occurrences |                   0 |
| intake_logs          |                   0 |
| reminder_deliveries  |                   0 |
| _prisma_migrations   |                   1 |

All 24 non-orphan-candidate integrity aggregates in the saved query returned zero: declared-parent existence, Auth mapping existence/uniqueness, prescription owner/type, episode/medication-child ownership, storage-path emptiness, extraction-version mismatch and missing Storage metadata. UUID format is enforced by the existing PostgreSQL UUID column; no UUIDs, names, emails or medical values were printed.

All seven documents matched `storage.objects` metadata in private bucket `medical-documents`. Three metadata objects have no matching application document and are **orphan candidates**, not authorized deletions. SQL metadata presence does not prove object bytes, signed download, completeness of an export or restore. No files were downloaded or deleted. Actual Auth-user and Storage-object recovery remain separately unverified.

After reconciliation, existing 13 application-table counts should be unchanged from the **maintenance-window** baseline, not necessarily today's snapshot. `medical_summaries` starts at zero before synthetic acceptance. History normally rises from one to three records, plus any separately reviewed security migration; do not compare history counts as application data. Keep synthetic acceptance deltas separate, use uniquely scoped fixtures and account for their authorized cleanup without touching real rows.

## 5. Application backup / restore: PASS; wider recovery gate remains open

The user approved a new encrypted local recovery tree and separate PostgreSQL 17 destination. Official PostgreSQL 17.11 portable tooling was downloaded from the vendor URL and used without changing package manifests. The source connection used the pinned Supabase CA and `verify-full`. A schema export and custom-format archive were produced from the same exported repeatable-read snapshot. The custom archive is 52,870 bytes, has SHA-256 `2d849b5202255c66b49b27b3e421cd05c597e782840d70f63f2ec7d132a76fa5`, and contains exactly 14 `TABLE DATA` entries: 13 application tables plus `_prisma_migrations`.

The archive was restored once into a new allowlisted database in the approved loopback-only PostgreSQL 17.11 cluster. The restore used `--exit-on-error --single-transaction --no-owner`, retained ACL/default-ACL commands through five local NOLOGIN aliases, and accepted only 112 reviewed TOC records. Source and restore match the verification contract, all 14 row counts, 22 application integrity aggregates, semantic Prisma history and schema inventory. The cluster was stopped; repeated offline checks scanned 1,618 files / 6,632 blocks with zero bad checksums. The corrective protection rescan records zero unencrypted files/directories, zero reparse points and no listener. The first post-stop JSON's stale count is retained and must never be cited without the corrective rescan.

The prior PostgreSQL 18 synthetic fixture was not reused. Protected artifacts, restored rows and credentials are outside Git. EFS confirms the expected user certificate on critical dump/credential files. Current user and SYSTEM retain FullControl; the fixed Codex sandbox group has ReadAndExecute only and is not an EFS decryptor. The password-protected PFX export and off-device custody are still pending operator action; therefore the backup is locally usable but not yet a durable hosted-mutation recovery gate.

### Coverage must be recorded separately

| Scope                  | Required artifact and validation                                                                                                                                                                                           | Current state                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Application PostgreSQL | Schema-only export plus custom-format logical dump of reviewed `public` scope, including all 13 application tables, enums, indexes, constraints and `_prisma_migrations`; preserve IDs, JSON, timestamps and status values | PASS for scoped logical dump/restore and stopped-cluster physical checks; value-by-value equality is not claimed |
| Security/roles         | Safe ownership/RLS/grant/default-ACL manifest, protected role provisioning/recovery instructions; no role passwords in Git or reports                                                                                      | Source ACLs restored only through local NOLOGIN aliases; production least-privilege/security rehearsal pending   |
| Auth                   | Provider-supported account/configuration recovery checkpoint; application dump does not contain `auth.users`, identities, sessions or Auth settings. Never create replacement UUIDs or import Auth via Prisma              | NOT_VERIFIED                                                                                                     |
| Storage                | Authorized protected object export with original keys, bytes, content type, size and checksum; isolated private-bucket restore and object verification; keep raw manifest private                                          | Metadata only; export/restore NOT_RUN                                                                            |
| Redis                  | Preserve current queue and deterministic/versioned jobs; no flush or clone into a worker-connected restore. Redis is not the record backup                                                                                 | Unchanged; no recovery test claimed                                                                              |

The application-only PostgreSQL restore can validate application schema/data without restoring managed Supabase schemas. It cannot certify Auth/Storage disaster recovery or full application integration. Do not label an application dump a complete Supabase backup. Database backups omit Storage bytes; see [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).

### Recovery sequence — steps 1 through 5 executed; step 6 pending

The repository helpers under `docs/completion/ex02` implement the guarded sequence below with fixed source/destination identities, hash-pinned artifacts, process-only credentials, verified TLS, fail-closed archive checks and no verbose row output. Hosted backup/refresh helpers require `MEDVAULT_EX02_SOURCE_DATABASE_URL` from the calling process and never read `DATABASE_URL` as an owner credential; load it only in a dedicated shell and remove it in `finally`. The templates are retained as operational explanation, not permission to rerun the one-time restore. Inspect immutable markers before any recovery action.

1. Establish a controlled write window across both computers, API, worker, scheduled jobs, operators and any other writers. Preserve Redis jobs; do not kill an active job blindly or flush queues. Prefer a graceful pause/drain, record in-flight IDs privately and leave live reconciliation disabled during restore tests. No services were paused in this phase.
2. Recapture counts and metadata; keep writers stopped through the backup baseline, or use a reviewed shared PostgreSQL snapshot across counts/dumps. A dump's consistency does not make separately timed counts consistent.
3. Once protection and PostgreSQL 17 tooling are verified, execute with selected service aliases and paths:

```powershell
# Private operator inputs; aliases and absolute paths are deliberately unresolved.
# PGSERVICEFILE / PGPASSFILE are private, ACL-restricted files outside Git.
# The restore destination must not equal any live or legacy source.
& $medvaultPgDump17 --dbname='service=medvault_ex02_source' --schema=public --schema-only --file=$medvaultSchemaFile
if ($LASTEXITCODE -ne 0) { throw 'Schema export failed; stop.' }
& $medvaultPgDump17 --dbname='service=medvault_ex02_source' --schema=public --format=custom --file=$medvaultDumpFile
if ($LASTEXITCODE -ne 0) { throw 'Application backup failed; stop.' }
Get-Item -LiteralPath $medvaultSchemaFile, $medvaultDumpFile | Select-Object Length
Get-FileHash -Algorithm SHA256 -LiteralPath $medvaultSchemaFile, $medvaultDumpFile
& $medvaultPgRestore17 --list $medvaultDumpFile
if ($LASTEXITCODE -ne 0) { throw 'Archive inspection failed; stop.' }
```

Both files were non-empty and the archive contained every reviewed definition and application/history TABLE DATA entry. Archive listing and checksums were followed by the actual isolated restore; they were not treated as restore success by themselves.

4. Provision the explicitly approved fresh empty restore database, from `template0` if a plain local PostgreSQL instance. Recreate required non-login ACL roles or approved owner mappings without privileged Supabase service operations. Inspect TOC/ACL dependencies first. Restore only to the allowlisted isolated target:

```powershell
& $medvaultPgRestore17 --dbname='service=medvault_ex02_isolated_restore' --exit-on-error --single-transaction --no-owner $medvaultDumpFile
if ($LASTEXITCODE -ne 0) { throw 'Isolated restore failed; migration remains blocked.' }
```

`--no-owner` mapped restored objects to the local restore administrator; local aliases allowed the source ACL/default-ACL commands to execute. That does not establish production ownership or least privilege. No `--clean`, `--create`, `--disable-triggers` or ignored errors were used.

5. **Executed:** the application-only verifier compared counts, semantic history, definitions and 22 relationship/ownership/uniqueness/version aggregates. Live `auth.users`/`storage.objects` checks remain separate; the restore was never connected to Redis or Gemini.
6. **Executed 02.3:** the exact local restore reported the three expected pending migrations. The capture was resolved as applied and rechecked before deploy; summary plus access hardening then deployed through Prisma 7.9.1. Four exact history records are current locally. Fifteen tables have RLS and no policies; anon/authenticated/service_role have no effective table or column access; `medvault_runtime` was temporarily enabled only for the test and exercised DML on all 14 application tables while migration-table, DDL and TRUNCATE access failed. A fresh-client Prisma `SummaryStore` request/claim/complete/reload/invalidation flow passed. Both fixtures were removed and the role returned to NOLOGIN with no password.
7. **Executed post-rehearsal:** the cluster was stopped. PostgreSQL scanned 1,626 files / 6,679 blocks with zero bad checksums; the recovery tree scan found 1,671 encrypted files, zero unencrypted entries, zero reparse points and no listener. Hosted services were never contacted.

## 6. Conditional reconciliation and rollback

After a verified backup/restore, trusted TLS, a controlled write window, current exact comparison, reviewed complete security change and applicable authority:

```powershell
# In a dedicated migration shell, load MIGRATION_DATABASE_URL privately from the
# approved secret store. It must identify the same database as runtime DATABASE_URL,
# never the runtime role itself. Do not start the API or worker from this shell.
# For a local isolated rehearsal ONLY, set process MEDVAULT_ALLOW_LOCAL_DATABASE=true.
try {
  pnpm --filter @medvault/database exec prisma migrate status
  if ($LASTEXITCODE -ne 0) { throw "Prisma migration status failed with exit code $LASTEXITCODE" }
} finally {
  Remove-Item Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
}
```

Read-only status can exit nonzero when expected migrations are pending. Inspect the actual pending names, identity and failure reason; do not continue on a connection error or unexpected state. Checkpoint that result. Only after all gates and this inspection pass, reacquire the owner credential in a new dedicated migration shell and issue **this command alone**:

```powershell
try {
  pnpm --filter @medvault/database exec prisma migrate resolve --applied 20260908000000_capture_existing_episode_medication_schema
  if ($LASTEXITCODE -ne 0) { throw 'Resolve failed or its outcome is unknown; inspect history before any retry or deploy.' }
} finally {
  Remove-Item Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
}
```

Stop here and read `_prisma_migrations` and checksums through the read-only query. Require exactly the initial and capture records, finished/non-rolled-back with matching hashes, unchanged application definitions/counts and no unexpected objects. Record that completed checkpoint. Only after inspection and confirmation that **every** now-pending migration is the rehearsed/reviewed set, reacquire the owner credential in another dedicated migration shell and issue the deployment separately:

```powershell
try {
  pnpm db:deploy
  if ($LASTEXITCODE -ne 0) { throw 'Deploy failed or its outcome is unknown; inspect the database before retrying.' }
} finally {
  Remove-Item Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
}
```

Then reacquire the owner credential in a final dedicated migration shell and verify status separately; no success claim until its output, live definitions/security and preservation checks agree:

```powershell
try {
  pnpm --filter @medvault/database exec prisma migrate status
  if ($LASTEXITCODE -ne 0) { throw 'Post-deploy status is not verified; leave EX-02 incomplete.' }
} finally {
  Remove-Item Env:MIGRATION_DATABASE_URL -ErrorAction SilentlyContinue
}
```

Each mutation is a separate checkpoint. Resolve marks the verified existing schema capture, not the missing summary schema; it must not execute the capture SQL on the hosted tables. The initial migration remains unchanged. Use the installed Prisma 7.9.1 workflow, not a Prisma 8 preview command or dependency update. [Prisma 7 baselining](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining) documents the resolve/skip mechanism; this repository already has valid initial history, so do not replace or archive the migrations directory.

The pending summary SQL alone does not finish database isolation. The separate access-hardening migration now supplies the reviewed application-object change and passed the isolated rehearsal. This preflight still is **not** executable approval for hosted resolve/deploy: durable key custody, fresh hosted comparison, a controlled write window and the remaining recovery/security gates must pass first.

Rollback rules:

- Before mutation: retain source unchanged, preserve queues and backups; no rollback needed.
- Unknown timeout/disconnection: inspect actual history, columns, triggers, grants and transaction outcome before any retry. Do not infer rollback from a client error.
- Resolve succeeded but later work blocked: do not delete its valid history entry. Retain the truthful capture record and pause dependent features; document actual remaining state.
- Transactional additive migration failed: verify rollback of its DDL. If Prisma records failure, diagnose/rehearse the cause first; mark rolled back only after proving the effects rolled back. Never reset or hand-edit history to suppress errors.
- Application regression after additive success: keep application writes paused as needed; revert only the responsible local code/config using the privately preserved prechange configuration. Retain hosted tables, summaries and backups for investigation. Do not drop newly written data.
- Recovery requiring restored data: restore a verified backup into another approved isolated target; validate counts, relationships and security, reconcile any post-backup writes and Storage objects, then approve a coordinated API/worker change. Never repoint to discarded legacy local databases. Keep live Storage/Auth unchanged. Never restart a restored DB against live queues before resolving in-flight/versioned jobs and duplicate replay risk.
- Security regression: diagnose the exact backend privilege or invoker-function permission; do not restore broad anonymous grants or `USING (true)` policies as rollback. Preserve the ability to recover with the separate migration owner.

## 7. Database security completion: locally rehearsed, not hosted

The browser uses Express, not application-table Data API queries. All 14 currently existing public tables, including history, are owned by `postgres`, have RLS disabled and grant SELECT/INSERT/UPDATE/DELETE/TRUNCATE to `anon`, `authenticated` and `service_role`. The no-body anonymous HEAD returned 200, so table access through that path is not isolated. Avoid adding real medical records while this remains open.

Inventory also found broad public-schema default ACLs for `postgres` and `supabase_admin`. No public views/functions/triggers/policies were found; dashboard-exposed schema settings, inherited/column privileges and runtime least privilege are not fully certified. Do not claim “RLS secured” merely because the summary migration passes its four-table synthetic test.

The exact application/history target set for the follow-up security review is:

```text
public.patients, public.patient_profiles, public.medical_documents,
public.report_extractions, public.report_measurements,
public.episodes, public.episode_memberships, public.episode_analyses,
public.medications, public.medication_schedules, public.schedule_occurrences,
public.intake_logs, public.reminder_deliveries,
public.medical_summaries, public._prisma_migrations
```

The fully expanded application-object change is now `packages/database/prisma/migrations/20260919000000_harden_application_database_access/migration.sql`. It revokes the exact list above from PUBLIC/anon/authenticated/service_role, enables RLS without permissive policies, removes current application-owner default grants, and grants only application DML to a disabled dedicated role. It does not revoke privileges on managed `auth`, `storage`, `realtime`, extensions or all schemas. Recheck exact role membership, column/inherited privileges and current definitions before hosted use; do not substitute schematic blanket SQL.

For the actual migration owner `postgres`, review both global and public-schema defaults and remove browser/HTTP grants on future application tables, sequences and functions. Do not assume schema-local REVOKE cancels a global grant. `supabase_admin` defaults must not be changed blindly: confirm the supported provider configuration and keep that role out of application-object creation until its exposure behavior is controlled. Dashboard Data API exposure minimization needs owner review; preserving Auth/Storage does not require exposing patient tables.

Runtime strategy stays the one in `docs/DATABASE_SECURITY_PLAN.md`: `medvault_runtime` is a dedicated non-owner `BYPASSRLS` role with no login/password in Git, no DDL/role/database creation and no unrelated-schema access, exact DML on 14 application tables and no migration-table writes. Existing UUID tables need no fabricated sequence privileges. Local provisioning and invoker-trigger/Prisma behavior passed; hosted role creation and connection semantics remain unverified. A NOBYPASSRLS alternative needs deliberate identity-scoped transactions/policies and is a separate architectural decision, not a blanket allow policy. Keep maintenance credentials separate from runtime, provision LOGIN privately only at coordinated cutover, and switch API and worker together after live proof.

Required live security acceptance after the guarded change:

1. Rerun effective table **and column/inherited** privileges, RLS/policies, owners, default ACLs, exposed schemas, views and functions. Future migration objects must not regain browser exposure.
2. Use real anonymous and synthetic authenticated test identities through Data API independently of Express. Test read denial on every listed table; test write denial only with approved synthetic fixture targets and verify no writes occurred. Test HTTP service-role application-table denial while retaining required Auth/Storage service operations. 200 with an empty fixture alone does not prove denial.
3. Prove API/worker Prisma CRUD, summary triggers, stale-write rejection, retry/lease behavior and two-user IDOR with the intended non-owner role. Verify runtime cannot perform DDL, truncate tables, change grants or access unrelated data.
4. Keep `medical-documents` private; test owned signed access and other-user denial with synthetic files. No broad Storage policies or object cleanup.
5. Extend count/relationship checks for `medical_summaries`: patient/scope parent exists, owner agrees, scope key matches exactly one document/episode, attempts/generation/status checks hold, fingerprints/version fencing and restart reload work. Existing medication rows/tables must remain preserved.

EX-02 cannot pass merely because the historical backup/restore, local rehearsal and maintenance-window read-only snapshot succeeded. The operator declined the recovery gate, so hosted mutation is blocked. An approved verified cloud recovery point and restore procedure, Auth/Storage recovery disposition, hosted migration/security application, live authenticated/service-role Data API denial, hosted runtime CRUD and hosted summary persistence remain open or NOT_RUN.

## 8. Local checks and next checkpoint

Current repository commands pass: lint, typecheck, 299 tests with one opt-in PostgreSQL test skipped, Prisma validation and a production build using a process-only HTTPS API placeholder. The first build correctly stopped on the local-public-API production guard. EX-02 adds 50 comparator/recovery regressions, PowerShell parser checks, Node syntax checks, targeted Prettier, exact secret-value/pattern scans and `git diff --check`. These checks do not establish Auth/Storage recovery, hosted permissions, device acceptance or hosted cutover.

Offline comparator regression/formatting results are recorded in `docs/IMPLEMENTATION_REVIEW.md` when complete. `git diff --check` passed; inherited CRLF-conversion warnings are not content failures. No automatic commit is authorized.

Next: **02.4 remains gated with no authorized mutation.** The operator declined local and cloud backup. To resume, approve and verify a cloud recovery point and restore procedure without sharing secrets, then refresh hosted definitions/counts/history/security under a new controlled write window before issuing resolve and deploy as separate checkpoints. Do not touch hosted history until every recovery, freshness, security and authority gate passes. Do not start EX-03 automatically.
