# Backup and Recovery

No repository evidence establishes that usable PostgreSQL, Storage, or Auth backups currently exist. This document defines the required strategy and validation work; it does not claim that any backup has been configured.

The 2026-08-30 Phase 3 attempt did not create a backup because the local Docker PostgreSQL source was unavailable. `backups/` is now ignored to prevent an eventual logical dump from entering Git, but ignore rules are not encryption. `DATABASE_MIGRATION_RUNBOOK.md` contains the gated custom dump, schema export, archive validation, and isolated PostgreSQL 17 restore rehearsal. Until that rehearsal passes, migration and cutover remain blocked.

## PostgreSQL

Before Phase 3, create both a schema-only export and a complete logical backup using an approved PostgreSQL tool compatible with the source and target versions. Store backups encrypted, access-controlled, outside the database host, and with documented retention.

A migration checkpoint must include:

- source database/project identity and timestamp;
- latest Prisma migration name;
- schema-only export;
- complete logical backup;
- per-table row counts without row contents;
- backup checksum and protected storage location;
- restore owner and rollback decision point.

Test restoration into an isolated database, never over the source. Run Prisma migration status/validation, table-count comparisons, referential-integrity checks, representative authenticated API reads, and IDOR tests. A backup is not considered available until this restore test succeeds.

## Supabase Storage

The database stores the authoritative metadata relationship in `MedicalDocument.storagePath`; the private bucket stores the file bytes. The Phase 2 consistency command inventories both directions and reports path fingerprints, but an inventory is not a backup.

A Storage backup needs an authorized export/copy process that preserves the exact object key, bytes, content type, size, and an integrity checksum. Protect the backup as medical data. Restoration should write to an isolated bucket first, compare checksums, then validate database-to-object relationships before serving signed URLs.

Deleting through the Storage API is permanent. Direct SQL deletion of `storage.objects` must not be used as a backup or cleanup mechanism.

## Redis

Redis/BullMQ is not the system of record. PostgreSQL document status/version and private Storage bytes are authoritative. Redis loss can remove waiting jobs and retained job history; Phase 2 reconciliation rebuilds eligible stale jobs with deterministic document/version IDs. Redis persistence can reduce disruption but does not replace PostgreSQL or Storage backups.

## Disaster Scenarios

### PostgreSQL lost

Stop API and worker writes, preserve logs without sensitive payloads, identify the last verified backup, restore into an isolated target, validate schema/counts/integrity, reconcile Storage relationships, and only then cut over API and worker together. Any Storage objects newer than the database backup require manual reconciliation.

### Redis lost

Restore Redis service availability, keep API and worker pointed at the same Redis target, then allow the reconciliation loop to recover stale `QUEUED`/`PROCESSING` reports. Monitor summary counts; do not bulk-create ad hoc jobs.

### Storage object lost

Prevent verification/download of the affected document, locate the object in the protected Storage backup by exact key/checksum, restore it, and rerun the consistency check. If no backup exists, retain metadata as an explicit recoverable failure and ask the patient to re-upload; do not fabricate content.

### Supabase Auth account lost

An Auth deletion does not cascade into the Prisma database. Run the read-only orphan checker, verify the account event and retention policy, and obtain explicit authorization before deleting or reassigning application records. See `AUTH_ACCOUNT_LIFECYCLE.md`.

### Worker crashes mid-processing

BullMQ may retry a failed attempt. If the job is lost, the stale timeout and queue-state check recover it. Transactional persistence prevents partial extraction/measurement commits, and document-version predicates prevent a stale worker from overwriting newer work.
