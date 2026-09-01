# MedVault Database Migration Runbook

This runbook moves MedVault application rows from the legacy local Docker PostgreSQL database to the intended hosted PostgreSQL database without moving Supabase Auth users or re-uploading Supabase Storage objects.

The procedure is intentionally stop-on-uncertainty. Never use `prisma migrate reset`, `prisma db push`, a forced Prisma migration resolution, destructive target cleanup, or automatic orphan deletion.

## Current Execution Checkpoint — 2026-08-30

**CUTOVER NOT PERFORMED.** No schema, row, Auth user, Storage object, Redis job, persisted environment file, or running-service target was changed during this attempt. The hosted URL was used only as a transient process variable for read-only connectivity probes.

The configured topology is understood but the live safety gates are not satisfied:

- Configured source: Docker Compose PostgreSQL 17 on `localhost:5432`, database `medvault`, schema `public`.
- Source availability: blocked. Docker Desktop is installed, its Windows service is stopped, this session cannot start that privileged service, and local port 5432 is closed.
- Intended target: Supabase PostgreSQL database `postgres` for project reference `ginzrzcgjmkrpkdywfds`, schema `public`.
- Project alignment: the configured database hostname, Supabase server URL, and public Supabase URL carry the same project reference.
- Target availability: blocked. The direct database hostname resolves to an IPv6 address, this workstation has no working IPv6 path to port 5432, and Prisma/Node cannot connect.
- Alternative target connection: not configured. Obtain the exact Supavisor **session pooler** connection string from the Supabase project Connect panel when running from an IPv4-only network. Never guess the pooler region or hostname.
- Repository migration inventory: one committed migration, `20260807000000_initial`.
- Live source/target migration histories and row counts: unknown in this attempt and must be queried again.
- Backup: not created because the source database is unavailable. A repository row-count observation from an earlier phase is not a substitute for a current backup or current counts.

Resume at Preflight only after Docker Desktop is running and an approved, tested target connection method is available.

## Intended Target Architecture

- Intended system of record after verified cutover: hosted PostgreSQL, accessed by Prisma from the API and worker.
- Authentication: Supabase Auth.
- File/object storage: private Supabase Storage bucket `medical-documents`.
- Queue and cache: hosted Redis with BullMQ; Redis is not a system of record.
- AI processor: Gemini fact extraction through the worker; validated output remains untrusted until patient verification.
- Browser: Supabase session cookies plus temporary UI/query state; no PostgreSQL credentials and no direct application-table access.

This is not the currently verified running architecture. After cutover, the API and worker must use the same hosted PostgreSQL database and the same Redis queue. The browser must use the matching Supabase Auth project. Storage object paths remain unchanged during the database move.

## Roles and Secrets

Assign one migration operator and one reviewer. Record the operator, reviewer, maintenance window, backup ID, source identity, target identity, and go/no-go decisions in a private operational record.

Keep all credential-bearing values in environment variables or an approved secret manager. Do not paste them into this document, Git, screenshots, issue trackers, terminal output, or command arguments that will be logged.

Suggested process-only variables are:

```powershell
$env:MEDVAULT_SOURCE_DATABASE_URL = '<loaded from an approved secret source>'
$env:MEDVAULT_TARGET_DATABASE_URL = '<loaded from an approved secret source>'
```

Clear those variables when the migration shell closes. Do not print them.

## Safety Gates

Every item below must be recorded as passed before the first target write:

- [ ] Source is reachable and reports database `medvault`, schema `public`, and the expected PostgreSQL server.
- [ ] The exact pre-existing Docker container and data volume are identified; no replacement container/volume was created.
- [ ] Target is reachable and reports the intended hosted database, schema, provider, and project.
- [ ] Source migration history is captured.
- [ ] Target migration history is captured.
- [ ] Migration histories have an explicitly reviewed, non-conflicting relationship.
- [ ] Current source counts for all five application tables are captured.
- [ ] Current target counts for all five application tables are captured.
- [ ] The selected backup root is encrypted, access-controlled, and protected before any dump is written.
- [ ] A custom-format source backup and schema export exist outside the Docker volume.
- [ ] The backup list contains `_prisma_migrations`, schema objects, and all application tables.
- [ ] The backup was restored into an isolated PostgreSQL 17 instance and its counts match the source snapshot.
- [ ] The database backup has a second approved encrypted/off-host copy with verified checksum and retention.
- [ ] Referenced Storage objects have an encrypted, checksum-verified backup and isolated restore result, or the current source document count is proven to be zero.
- [ ] The rollback procedure and write-freeze point are approved.
- [ ] API and worker are confirmed able to use the exact same target database and Redis environment.
- [ ] Supabase Auth/Storage project alignment is confirmed.
- [ ] Data API exposure is disabled or restricted so an initial empty application schema cannot become publicly reachable during deployment.
- [ ] Hosted Data API exposure/grants/RLS are enforced and denial tests pass while application tables are still empty.
- [ ] The six previously observed Storage-to-local-database mismatch candidates are reconciled against the hosted database and backup inventory.

If any item is unknown or fails, stop before target schema deployment, data restore, security DDL, or cutover.

## Preflight

### 1. Preserve the Working State

Record the Git branch, commit, and changed-file list. Do not commit a database dump. The repository ignores `backups/`.

Confirm the application is not currently in a write maintenance window before discovery; the read-only checks below do not require a write freeze.

### 2. Start and Identify the Source

Start Docker Desktop interactively with sufficient Windows privileges. Do not run `docker compose up` yet: if the original container or volume is missing, that command can create a fresh empty database that looks like the source.

First inventory the existing Compose object without creating anything:

```powershell
docker compose ps -a postgres
$sourceContainer = docker compose ps -aq postgres
if (-not $sourceContainer) {
  throw 'Legacy PostgreSQL container is absent; stop and locate the original volume'
}
docker inspect $sourceContainer --format '{{json .Mounts}}'
docker volume ls --filter name=medvault-postgres
```

An operator and reviewer must verify that the container mount at `/var/lib/postgresql/data` is a pre-existing named volume for this MedVault source. Inspect that exact volume with `docker volume inspect <reviewed-volume-name>`. If the container, mount, or volume is missing/empty/unexpected, stop; do not recreate or attach anything during this runbook.

Start only the already verified container, then test its port:

```powershell
docker compose start postgres
Test-NetConnection -ComputerName localhost -Port 5432
```

Query identity and version without selecting medical values:

```powershell
docker compose exec -T postgres psql -U postgres -d medvault -v ON_ERROR_STOP=1 -c "SELECT current_database() AS database_name, current_schema() AS schema_name, current_user AS database_role, current_setting('server_version') AS server_version;"
```

The database and schema must be exactly `medvault` and `public`. Stop if they are not.

Capture the table inventory and migration history:

```powershell
docker compose exec -T postgres psql -U postgres -d medvault -v ON_ERROR_STOP=1 -c "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
docker compose exec -T postgres psql -U postgres -d medvault -v ON_ERROR_STOP=1 -c "SELECT migration_name, checksum, applied_steps_count, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY started_at;"
```

The live history—not merely the migration directory—establishes the source schema version.

### 3. Capture Source Counts and Integrity Metrics

Run metadata-only counts:

```sql
SELECT 'patients' AS table_name, count(*) AS row_count FROM public.patients
UNION ALL SELECT 'patient_profiles', count(*) FROM public.patient_profiles
UNION ALL SELECT 'medical_documents', count(*) FROM public.medical_documents
UNION ALL SELECT 'report_extractions', count(*) FROM public.report_extractions
UNION ALL SELECT 'report_measurements', count(*) FROM public.report_measurements
ORDER BY table_name;
```

Run count-only integrity checks:

```sql
SELECT 'profiles_without_patient' AS check_name, count(*) AS failures
FROM public.patient_profiles p
LEFT JOIN public.patients parent ON parent.id = p.patient_id
WHERE parent.id IS NULL
UNION ALL
SELECT 'documents_without_patient', count(*)
FROM public.medical_documents d
LEFT JOIN public.patients parent ON parent.id = d.patient_id
WHERE parent.id IS NULL
UNION ALL
SELECT 'extractions_without_document', count(*)
FROM public.report_extractions e
LEFT JOIN public.medical_documents d ON d.id = e.document_id
WHERE d.id IS NULL
UNION ALL
SELECT 'measurements_without_extraction', count(*)
FROM public.report_measurements m
LEFT JOIN public.report_extractions e ON e.id = m.extraction_id
WHERE e.id IS NULL
UNION ALL
SELECT 'duplicate_auth_user_id_groups', count(*)
FROM (
  SELECT auth_user_id FROM public.patients GROUP BY auth_user_id HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'duplicate_storage_path_groups', count(*)
FROM (
  SELECT storage_path FROM public.medical_documents GROUP BY storage_path HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'duplicate_extraction_document_groups', count(*)
FROM (
  SELECT document_id FROM public.report_extractions GROUP BY document_id HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'duplicate_measurement_order_groups', count(*)
FROM (
  SELECT extraction_id, sort_order
  FROM public.report_measurements
  GROUP BY extraction_id, sort_order
  HAVING count(*) > 1
) duplicates
UNION ALL
SELECT 'empty_storage_paths', count(*)
FROM public.medical_documents
WHERE btrim(storage_path) = ''
UNION ALL
SELECT 'extraction_document_version_mismatches', count(*)
FROM public.report_extractions e
JOIN public.medical_documents d ON d.id = e.document_id
WHERE e.document_version <> d.document_version
UNION ALL
SELECT 'extractions_on_nonreport_documents', count(*)
FROM public.report_extractions e
JOIN public.medical_documents d ON d.id = e.document_id
WHERE d.document_type::text <> 'REPORT'
UNION ALL
SELECT 'invalid_processing_status', count(*)
FROM public.medical_documents
WHERE processing_status::text NOT IN (
  'NOT_APPLICABLE', 'UPLOADED', 'QUEUED', 'PROCESSING',
  'NEEDS_REVIEW', 'VERIFIED', 'FAILED'
)
UNION ALL
SELECT 'invalid_verification_status', count(*)
FROM public.medical_documents
WHERE verification_status::text NOT IN ('NOT_APPLICABLE', 'PENDING', 'VERIFIED')
UNION ALL
SELECT 'invalid_extraction_status', count(*)
FROM public.report_extractions
WHERE status::text NOT IN ('DRAFT', 'VERIFIED');
```

All relationship, duplicate, empty-path, version, document-type, and invalid-status counts must be zero. PostgreSQL enums and unique constraints should already enforce several checks; the explicit counts remain migration evidence. Do not print row identifiers or contents while investigating a nonzero count.

All `patients.auth_user_id` values are PostgreSQL UUIDs by schema. This validates format only; Auth membership must be checked separately through a bounded identity lookup that emits counts/fingerprints, not emails.

### 4. Identify and Reach the Target

Use the Supabase project Connect panel to select an exact connection method:

- Direct `db.<project-ref>.supabase.co:5432`: preferred for migrations, backup tools, and long-lived servers when the execution environment supports IPv6 (or the project has the IPv4 add-on).
- Supavisor session pooler on port 5432: appropriate for this long-running Express API/worker and for Prisma tooling when the execution environment is IPv4-only.
- Supavisor transaction pooler on port 6543: intended for short-lived/serverless connections and not the default for this architecture.

The current repository accepts one `DATABASE_URL` for Prisma tooling and runtime. Do not add a second URL operationally until repository support and tests for that URL are committed. A session-pooler URL may be used consistently for the current long-running processes and migration commands if that is the provider-approved connection shown by the project.

Set the target URL in the process environment so the ignored `.env.local` cannot override it:

```powershell
$env:DATABASE_URL = $env:MEDVAULT_TARGET_DATABASE_URL
$env:MEDVAULT_ALLOW_LOCAL_DATABASE = 'false'
pnpm --filter @medvault/database exec prisma migrate status
```

Then use a read-only PostgreSQL client to record:

```sql
SELECT current_database() AS database_name,
       current_schema() AS schema_name,
       current_user AS database_role,
       current_setting('server_version') AS server_version;
SELECT to_regclass('public._prisma_migrations') AS prisma_migrations_table;
SELECT tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Confirm the safe project reference in the database hostname matches both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`. Do not print credentials or full URLs.

Capture target migration history and the same five table counts. If a table is absent, record it as absent; do not create it during discovery. If application tables exist but `_prisma_migrations` does not, stop for an explicit baseline/reconciliation review.

## Backup and Restore Rehearsal

### 1. Create the Source Backup

Use a backup root that the operator and reviewer have already verified as encrypted at rest, access-controlled, covered by retention, and outside the Docker volume. It may be the ignored repository `backups/` directory only when the underlying storage has those protections. Use custom format so `pg_restore --list` can validate the archive. The dump must include the entire application database, including `_prisma_migrations`; do not restrict it to rows only.

```powershell
$backupId = Get-Date -Format 'yyyyMMdd-HHmmss'
$protectedBackupRoot = $env:MEDVAULT_PROTECTED_BACKUP_ROOT
if (-not $protectedBackupRoot) { throw 'Protected backup root is not configured' }
$backupDirectory = Join-Path $protectedBackupRoot "medvault-phase3\$backupId"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$containerDump = "/tmp/medvault-$backupId.dump"
$containerSchema = "/tmp/medvault-$backupId.schema.sql"
$hostDump = Join-Path $backupDirectory "medvault-$backupId.dump"
$hostSchema = Join-Path $backupDirectory "medvault-$backupId.schema.sql"

docker compose exec -T postgres pg_dump -U postgres -d medvault --format=custom --no-owner --no-acl --file=$containerDump
docker compose exec -T postgres pg_dump -U postgres -d medvault --schema-only --format=plain --no-owner --no-acl --file=$containerSchema
docker compose cp "postgres:$containerDump" $hostDump
docker compose cp "postgres:$containerSchema" $hostSchema
```

Verify before removing the temporary container copy:

```powershell
$backupFile = Get-Item -LiteralPath $hostDump
if ($backupFile.Length -le 0) { throw 'Backup is empty' }
$schemaFile = Get-Item -LiteralPath $hostSchema
if ($schemaFile.Length -le 0) { throw 'Schema export is empty' }
Get-FileHash -Algorithm SHA256 -LiteralPath $hostDump
Get-FileHash -Algorithm SHA256 -LiteralPath $hostSchema
docker compose exec -T postgres pg_restore --list $containerDump
```

The archive listing must show `_prisma_migrations` and each of the five application tables. Record timestamp, source classification, PostgreSQL version, custom format, absolute protected location, size, hash, and list-validation result. Store the hash but never row contents.

Only after the host copy and archive listing pass, remove the exact temporary file:

```powershell
docker compose exec -T postgres rm -f -- $containerDump $containerSchema
```

Before restore rehearsal or target writes, copy both files to a second approved encrypted/off-host location and verify their SHA-256 values there. Record access control and retention evidence. Git ignore is not encryption or access control.

### 2. Restore in Isolation

Use a disposable PostgreSQL 17 container, never the source or target. The unique label below prevents cleanup from targeting an unrelated container. Native-command failures must abort the rehearsal, and cleanup must run even after failure.

```powershell
$restoreToken = [guid]::NewGuid().ToString('N')
$restoreContainer = "medvault-phase3-restore-$restoreToken"
$restorePassword = [Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
)
$env:POSTGRES_PASSWORD = $restorePassword

function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

try {
  docker run --detach --name $restoreContainer --label "medvault.phase3.restore=$restoreToken" --env POSTGRES_PASSWORD postgres:17-alpine
  Assert-NativeSuccess 'start isolated restore container'

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    docker exec $restoreContainer pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'isolated PostgreSQL did not become ready in 30 seconds' }

  docker cp $hostDump "${restoreContainer}:/tmp/medvault.dump"
  Assert-NativeSuccess 'copy backup into isolated restore container'
  docker exec $restoreContainer createdb -U postgres medvault_restore
  Assert-NativeSuccess 'create isolated restore database'
  docker exec $restoreContainer pg_restore -U postgres -d medvault_restore --exit-on-error --single-transaction /tmp/medvault.dump
  Assert-NativeSuccess 'restore isolated database'

  # Run the identity, migration-history, five-table count, and integrity queries
  # against medvault_restore here. Assert every native exit code and record only
  # metadata/counts. They must exactly match the source snapshot.
} finally {
  try {
    $candidate = docker ps -aq --filter "name=^/$restoreContainer$"
    if ($candidate) {
      $observedToken = docker inspect --format '{{ index .Config.Labels "medvault.phase3.restore" }}' $restoreContainer
      if ($LASTEXITCODE -ne 0 -or $observedToken -ne $restoreToken) {
        throw 'Refusing cleanup because the disposable restore label does not match'
      }
      docker rm --force $restoreContainer
      Assert-NativeSuccess 'remove isolated restore container'
    }
  } finally {
    Remove-Item Env:POSTGRES_PASSWORD -ErrorAction SilentlyContinue
    $restorePassword = $null
  }
}
```

Do not leave the restored PHI container running, and do not delete the protected backup.

### 3. Protect Referenced Storage Objects

If the current source count for `medical_documents` is greater than zero, the checkpoint also requires an authorized, encrypted backup of exactly the referenced objects. Preserve each exact bucket/key, bytes, MIME type, size, and checksum; rehearse restoration into an isolated private bucket and compare metadata/checksums. This is the only stage where downloading referenced medical files may be necessary for backup, and access must be restricted and audited.

If the current source document count is zero, record `relevant source Storage objects: 0` rather than creating an unnecessary bulk export. The six objects observed in Phase 2 are still separate reconciliation candidates: compare them with hosted database metadata once the target is reachable, and do not delete or download them merely because the local source has no matching rows.

## Migration History Decision

Compare ordered migration names, checksums, applied-step counts, and finished/rolled-back status, and run Prisma migration status. If independently reproducing a checksum, hash the exact canonical bytes that were deployed; line-ending normalization can otherwise create a false mismatch. Any unexplained checksum difference stops migration. Checksums are safe metadata, not row contents.

- Empty target with no application tables: `prisma migrate deploy` may apply all committed migrations after backup/restore gates pass.
- Target history is an exact applied prefix of the committed repository history: `prisma migrate deploy` may apply only pending migrations.
- Target history exactly matches the repository: do not apply schema changes.
- Failed, rolled-back, missing-middle, checksum-conflicting, or divergent migration: stop.
- Application tables exist without compatible Prisma history: stop.
- Target objects conflict with `20260807000000_initial`: stop.

Do not use `prisma migrate resolve` merely to make histories look aligned. A baseline is a separate reviewed database change and requires evidence that the existing schema exactly matches the committed migration.

## Target Schema Migration

Before an initial schema deployment, disable the project's Data API or remove `public` from its exposed surface unless an independently reviewed configuration already prevents access. This must happen before the application tables exist; do not create an interval where empty medical tables receive automatic HTTP-role privileges.

After all pre-schema gates pass and with the target URL set explicitly in the process environment:

```powershell
$env:DATABASE_URL = $env:MEDVAULT_TARGET_DATABASE_URL
$env:MEDVAULT_ALLOW_LOCAL_DATABASE = 'false'
pnpm db:deploy
pnpm --filter @medvault/database exec prisma migrate status
```

`prisma migrate deploy` applies committed migrations without a development shadow database. Never use `prisma migrate dev` against the hosted target.

Re-query target schema inventory and `_prisma_migrations` before moving data.

## Database Exposure and RLS — Before Data Import

This gate runs immediately after schema deployment while every target application table is still empty. No medical row may be restored until exposure is minimized, the reviewed grants/RLS design is applied, HTTP denial tests pass, and Prisma backend CRUD is proven against non-medical test data.

The browser uses Supabase Auth but does not need the Supabase Data API for MedVault application tables. The preferred security posture is therefore no browser Data API access to these tables.

Use metadata-only queries to inventory the live target before writing security SQL:

```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN (
    'patients', 'patient_profiles', 'medical_documents',
    'report_extractions', 'report_measurements'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       COALESCE(array_to_string(c.relacl, ','), '<default>') AS acl_metadata
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
    'patients', 'patient_profiles', 'medical_documents',
    'report_extractions', 'report_measurements'
  )
ORDER BY c.relname;

SELECT defaclrole::regrole::text AS owner_role,
       defaclnamespace::regnamespace::text AS schema_name,
       defaclobjtype AS object_type,
       defaclacl::text AS default_acl_metadata
FROM pg_default_acl
WHERE defaclnamespace = to_regnamespace('public')
ORDER BY owner_role, object_type;

SELECT schemaname, tablename, policyname, permissive, roles, cmd,
       qual IS NOT NULL AS has_using,
       with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'patients', 'patient_profiles', 'medical_documents',
    'report_extractions', 'report_measurements'
  )
ORDER BY tablename, policyname;
```

These queries report grant/policy structure, not patient rows or policy expressions. `information_schema.table_privileges` is used because `role_table_grants` omits privileges granted to `PUBLIC`.

Before importing application data:

1. Prove all five target application tables have zero rows.
2. Inspect whether `public` is exposed through the Supabase Data API and inspect grants for `anon`, `authenticated`, `service_role`, and `PUBLIC`.
3. Prefer disabling the Data API for the environment or exposing a different schema when no Supabase REST/GraphQL client needs application tables.
4. For any application tables that remain in an exposed schema, enable RLS and explicitly revoke HTTP/browser-role privileges unless a reviewed feature requires them.
5. Do not create `USING (true)` patient policies.
6. If direct browser access is ever introduced, policies must derive ownership from `auth.uid()` mapped to `patients.auth_user_id`; client-provided patient IDs are never trusted.
7. Prove Data API access is denied for `anon`, an authenticated user, and the service-role HTTP client; then prove the dedicated Prisma backend role can perform its required operations using disposable non-medical test rows that are removed before import.

RLS with no policies blocks an ordinary `NOBYPASSRLS` role, while a broad backend `USING (true)` policy is prohibited. The current code-neutral candidate is a non-owner, narrowly granted Prisma role with `BYPASSRLS`, no DDL/administrative privileges, and access only to the application tables; a `NOBYPASSRLS` design instead requires deliberate transaction-local verified-identity changes. Rehearse the selected model outside the authoritative database.

Security DDL must be a reviewed, committed migration. Do not make an untracked dashboard SQL change. The current Prisma connection role and grants must be identified before choosing whether RLS is bypassed or enforced for backend access. Any failed or incomplete denial/backend test stops data import.

## Application Data Migration

Supabase Auth accounts are not application tables and must not be dumped or restored through Prisma. Storage objects stay in the private bucket and are not re-uploaded. Preserve existing UUIDs and `storage_path` values.

The safe automated path assumes the target application tables are empty. If any target table contains rows, stop and produce a table-by-table reconciliation plan for key collisions, Auth mappings, timestamps, and relationships; do not use conflict-ignore behavior.

With an empty, migrated target:

1. Enter a write maintenance window and stop API and worker processes.
2. Pause new queue production and wait for active jobs to settle; record BullMQ state without deleting jobs.
3. Repeat source counts and create a final verified backup.
4. Create a data-only dump containing these tables in dependency order:
   `patients`, `patient_profiles`, `medical_documents`, `report_extractions`, `report_measurements`.
5. Restore it to the target with `pg_restore --data-only --single-transaction --exit-on-error`.
6. If any insert or constraint fails, the transaction must roll back and cutover remains stopped.

Create the data-only archive inside the source container and copy it to the protected backup directory without PowerShell binary redirection:

```powershell
$containerData = "/tmp/medvault-$backupId.data.dump"
$hostData = Join-Path $backupDirectory "medvault-$backupId.data.dump"

docker compose exec -T postgres pg_dump -U postgres -d medvault --data-only --format=custom --no-owner --no-acl --table=public.patients --table=public.patient_profiles --table=public.medical_documents --table=public.report_extractions --table=public.report_measurements --file=$containerData
docker compose cp "postgres:$containerData" $hostData

$dataFile = Get-Item -LiteralPath $hostData
if ($dataFile.Length -le 0) { throw 'Data archive is empty' }
Get-FileHash -Algorithm SHA256 -LiteralPath $hostData
docker compose exec -T postgres pg_restore --list $containerData
docker compose exec -T postgres rm -f -- $containerData
```

For target restore, load `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`, and `PGSSLMODE` from the approved target secret without printing them. Use a uniquely named PostgreSQL 17 client container so the password is inherited rather than placed in the command:

```powershell
function Assert-NativeSuccess([string]$step) {
  if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

$migrationToken = [guid]::NewGuid().ToString('N')
$migrationClient = "medvault-phase3-client-$migrationToken"
try {
  docker create --name $migrationClient --label "medvault.phase3.client=$migrationToken" --env PGHOST --env PGPORT --env PGUSER --env PGDATABASE --env PGPASSWORD --env PGSSLMODE postgres:17-alpine pg_restore --data-only --single-transaction --exit-on-error --no-owner --no-acl --dbname=$env:PGDATABASE /tmp/medvault.data.dump
  Assert-NativeSuccess 'create target migration client'
  docker cp $hostData "${migrationClient}:/tmp/medvault.data.dump"
  Assert-NativeSuccess 'copy data archive into target migration client'
  docker start --attach $migrationClient
  Assert-NativeSuccess 'restore data into target'
} finally {
  $candidate = docker ps -aq --filter "name=^/$migrationClient$"
  if ($candidate) {
    $observedToken = docker inspect --format '{{ index .Config.Labels "medvault.phase3.client" }}' $migrationClient
    if ($LASTEXITCODE -ne 0 -or $observedToken -ne $migrationToken) {
      throw 'Refusing cleanup because the migration-client label does not match'
    }
    docker rm --force $migrationClient
    Assert-NativeSuccess 'remove target migration client'
  }
}
```

Any nonzero client exit stops cutover. The labeled client is removed even after failure; keep the protected archive.

Do not disable foreign keys for a convenience merge. Do not restore `_prisma_migrations` as data after `prisma migrate deploy`; migration history is established by Prisma deploy and must match the separately reviewed source history.

## Verification Before Cutover

Compare source and target counts for all five application tables. Each count must match exactly.

Run the relationship, duplicate, empty-path, and document-version checks from Preflight on the target. Every failure count must be zero.

Run the bounded consistency command against the target through an explicit process environment:

```powershell
$env:DATABASE_URL = $env:MEDVAULT_TARGET_DATABASE_URL
$env:MEDVAULT_ALLOW_LOCAL_DATABASE = 'false'
pnpm --filter @medvault/api check:consistency
```

Record only counts and fingerprints. For each `medical_documents.storage_path`, verify metadata-level existence in private bucket `medical-documents`. Report missing, inaccessible, and potential-orphan counts; never auto-delete or bulk-download objects. Reconcile the six candidates recorded in Phase 2 against hosted database rows before declaring Storage consistent.

For each patient Auth UUID, use the bounded Auth check to report existence counts/fingerprints only. Do not print email addresses. Preserve and report orphans; never delete or remap them automatically.

Any unexpected count, relationship, Auth, or Storage difference stops cutover.

## Cutover

Cutover is permitted only after every verification gate passes.

1. Keep API and worker stopped from the write-freeze window.
2. Save the pre-cutover local environment configuration in the approved secret/operations store.
3. Configure the API and worker with the exact same hosted `DATABASE_URL`, `MEDVAULT_ALLOW_LOCAL_DATABASE=false`, Supabase project variables, and hosted `REDIS_URL`.
4. Configure Prisma deployment commands with the reviewed hosted connection.
5. Remove `DATABASE_URL` and `MEDVAULT_ALLOW_LOCAL_DATABASE=true` from repository-root `.env.local` so it cannot silently override the shared target. Keep unrelated local settings if needed. Do not delete the legacy database or its backup.
6. Set the deployed web app to a non-local HTTPS `NEXT_PUBLIC_API_URL` and the matching public Supabase URL/key.
7. Start the API, then the worker. Confirm safe startup diagnostics classify database and Redis as remote without printing URLs.
8. Run API health and a read-only profile request before re-enabling writes.
9. Resume queue production only after API and worker target alignment is independently reviewed.

Production variables are defined in `docs/ENVIRONMENTS.md`. No production value may use localhost; server-only keys must never use a `NEXT_PUBLIC_` prefix.

## Cross-Device Validation

Use a dedicated non-medical test report and a test account in the intended Supabase project.

In browser/session A:

1. Authenticate and create/update a profile.
2. Upload a report.
3. Confirm metadata is in hosted PostgreSQL and the object exists in private Storage.
4. Confirm a BullMQ job exists and the worker processes it.
5. Confirm validated extraction persists and the document reaches `NEEDS_REVIEW`.
6. Correct and verify values; confirm hosted persistence.

In an isolated browser/session B, sign in as the same account and verify the same profile, document, signed preview/download, extraction, and verified values.

Then test IDOR boundaries with two test accounts: user A must receive no data for user B's identifiers, and an invalid token must return no patient data. Do not use real patient content for this test.

## Failure Tests

Perform these in a controlled non-production environment after normal integration succeeds:

- PostgreSQL unavailable: API fails safely and does not claim successful writes.
- Redis unavailable: persisted database/Storage data remains intact; configured rate-limit and queue failure behavior is explicit.
- Worker unavailable: uploaded file and metadata remain recoverable and reconciliation can requeue deterministically.
- Gemini failure: document transitions to the repository's recoverable failure/retry path without exposing prompts or content.
- Storage unavailable: no signed access or deletion is reported as successful when it failed.
- Invalid Auth token: no patient data is returned.
- User A requests user B's resource: request is denied without revealing existence.

## Rollback

Rollback never deletes the hosted database, Storage objects, Redis data, local volume, or backup.

### Before Hosted Writes Resume

If cutover fails before any hosted write is accepted:

1. Stop API and worker.
2. Restore the pre-cutover environment configuration from the approved operations record.
3. Point both API and worker back to the same verified local database and the intended Redis target.
4. Start API, verify health and source counts, then start worker.
5. Inspect deterministic job IDs before resuming queue production so completed jobs are not replayed blindly.
6. Retain the hosted database unchanged for investigation.

### After Hosted Writes Resume

A simple URL reversal could lose or fork data. Freeze API writes and stop the worker first. Record local and hosted counts, timestamps, and queue state. Designate one source of truth through an explicit incident decision, then use a reviewed forward-copy/reconciliation procedure. Never merge patient records automatically or replay all jobs.

### Source Corruption

If the local source becomes corrupt, restore the verified custom-format dump into a new isolated PostgreSQL 17 database, validate counts and integrity, and only then point API/worker to that restored database. Do not overwrite the original volume during diagnosis.

Supabase Storage remains unchanged throughout rollback. Database `storage_path` values must continue referencing the existing private objects.

## Local Database Retirement

After successful hosted cutover, label local PostgreSQL `legacy migration source`. Keep the Docker volume and verified backup through the agreed stability/retention period. Local PostgreSQL remains optional development infrastructure, not the shared system of record.

Do not drop the database, remove the volume, prune Docker, or delete backups as part of initial cutover. Eventual removal requires a separate reviewed decision after stable cross-device, restore, and incident-response validation.

## Completion Evidence

Attach or record, without secrets or medical values:

- source and target safe identities;
- ordered migration-history comparison;
- backup path, format, size, SHA-256, and isolated restore result;
- source/target counts for all five application tables;
- zero-failure relationship/duplicate/path/version metrics;
- Storage and Auth consistency counts/fingerprints;
- RLS/grant/Data API test results;
- API/worker target-alignment review;
- cross-device and IDOR results;
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` results;
- API, worker, queue, Storage, deletion, reconciliation, and failure-test results;
- rollback decision owner and retained backup/source locations.

Only after all evidence passes may `docs/MEDVAULT_REPAIR_TRACKER.md` mark Phase 3 complete.
