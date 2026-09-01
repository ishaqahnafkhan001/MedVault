# MEDVAULT

## Software Requirements Specification

### Patient Web Platform — v1.1 Working Source

**Version:** 1.1 — Phase 1 specification-truth baseline  
**Date:** 31 August 2026  
**Status:** Working draft; not frozen, approved, or production-ready  
**Primary product release:** MVP  
**Source baseline:** MedVault SRS v1.0 (preserved unchanged)

> This document separates verified repository behavior from target production requirements and future product scope. A statement about current source does not prove live production operation. Phase 2 must add the authoritative traceability and acceptance contract before this document can be frozen.

## Document Control

| Version     | Date        | Status                               | Scope                                                                |
| ----------- | ----------- | ------------------------------------ | -------------------------------------------------------------------- |
| 1.0         | 6 Aug 2026  | Preserved development baseline       | Original patient web plan using ambiguous product phase terminology  |
| 1.1 working | 31 Aug 2026 | Phase 1 specification-truth baseline | Current MVP, target production system, and future releases separated |

### Source Integrity

- Original source: `MedVault_SRS_v1.0.docx`
- Original SHA-256: `8063B6FB28498D35200F6FC184133A79FB5DBC64CFDAEA2C5759476BE6DFB74D`
- Preservation result: the original DOCX was read but not modified or re-exported.
- Detailed corrections: `docs/srs/MEDVAULT_SRS_V1_0_MISMATCH_REPORT.md`
- Process continuity: `docs/MEDVAULT_SRS_V1_1_TRACKER.md`

### Requirement Language

- **Shall** or **Must** identifies a mandatory requirement for its assigned product release.
- **Should** identifies an important but deferrable requirement for its assigned release.
- **Future** identifies a capability outside the MVP.
- A **Must** requirement blocks only its assigned release unless it is explicitly classified as a **Production Gate**.
- Repair **Phase 1–5** labels describe the SRS/production-readiness process, not product releases.

Phase 2 will attach complete requirement metadata, verification methods, evidence dates, owners, and release decisions. This Phase 1 draft does not use `VERIFIED` merely because source exists.

---

# 1. Introduction

## 1.1 Purpose

This SRS defines the truthful baseline for MedVault's patient-facing web product. It describes:

1. the current implemented system visible in repository source;
2. the target production system that must exist before real production use; and
3. future product releases that are intentionally outside the MVP.

The document is intended for product, engineering, QA, security, privacy, clinical-safety, and academic review. It does not claim regulatory certification or production readiness.

## 1.2 Product Definition

MedVault is a **patient-controlled personal medical-record platform**. It helps an authenticated patient keep medical reports and prescriptions, extract printed facts from supported reports, verify structured report data, and browse a private history.

MedVault is not a diagnostic system, treatment authority, emergency service, prescribing system, or replacement for a qualified clinician.

## 1.3 Specification Baselines

### 1.3.1 Current Implemented System

The current repository implements an MVP codebase with:

- Next.js patient web pages for registration, login, logout, profile, dashboard, upload, document history, report history, report review, retry, and original-file access;
- Supabase Auth sessions in the browser and independent bearer-token verification by the Express API;
- a unique Supabase Auth UUID to internal `Patient` mapping;
- patient-scoped profile read/upsert behavior;
- multipart upload through Express for `REPORT` and `PRESCRIPTION` documents;
- PDF, JPEG, PNG, and WebP magic-byte validation with a configurable size limit;
- server-side private Supabase Storage operations and short-lived signed URLs after ownership checks;
- Prisma models for patients, profiles, documents, report extractions, and report measurements;
- BullMQ report extraction using deterministic document/version job IDs, bounded retry, and stale-job reconciliation;
- complete eligible report bytes and MIME type sent to Gemini under a facts-only prompt;
- Zod validation, normalization, draft extraction persistence, and explicit patient verification;
- verified-only latest-report selection, dashboard summaries, pagination, search, filters, retry, and an ownership-scoped coordinated document-deletion API;
- read-only database-to-Storage, Storage-to-database, and Patient-to-Auth consistency checks;
- Redis-backed production rate-limit support, safe error handling, and optional privacy-scrubbed monitoring.

Important current limitations:

- The configured development database is local PostgreSQL, not the intended hosted system of record.
- The local PostgreSQL source was unreachable at the latest migration preflight; its current contents are not represented by a verified Phase 3 backup.
- The hosted PostgreSQL target has not passed identity, migration-history, row-count, restore, cutover, or cross-device checks.
- Account recovery, a dependency-aware readiness endpoint, an audit-event model, account-wide closure, and a patient-facing document-deletion control are not implemented.
- Source/unit-test evidence does not establish live Supabase, Redis, Gemini, PostgreSQL, backup, or production behavior.

### 1.3.2 Target Production System

Before production, MedVault is intended to run with:

- Supabase Auth as the authentication authority;
- Express as the only browser-facing application-data API;
- one hosted PostgreSQL system of record used by both API and worker through Prisma;
- private Supabase Storage for original medical file bytes;
- one hosted Redis environment shared by API queue producer and BullMQ worker;
- Gemini restricted to eligible report fact extraction;
- production-safe secrets, TLS, monitoring, backup/restore, least-privilege database roles, and verified Data API/RLS posture;
- cross-device persistence, IDOR isolation, failure recovery, and restore evidence.

This target is **not** the verified running architecture. Hosted database cutover remains blocked by the safety gates recorded in `docs/MEDVAULT_REPAIR_TRACKER.md`.

### 1.3.3 Future Product System

Future releases may add episodes/trends, medicines/reminders/interactions, selective sharing, mobile applications, wearables, and provider ecosystems. None is implemented MVP functionality. Each requires its own data model, API, authorization, privacy, safety, and acceptance work.

## 1.4 Intended Users

- **Patient:** authenticated person controlling their MedVault profile and medical records.
- **Platform operator:** internal operational role; no operator console is specified or implemented in the MVP.
- **Future shared-link recipient:** unauthenticated or separately authorized read-only recipient in Release 4; no current recipient experience exists.

## 1.5 Core Terms

| Term                            | Definition                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI extraction                   | Structured printed facts produced from one eligible medical report by Gemini and validated by application code.                                                                |
| Auth user ID                    | Supabase Auth UUID verified by the API and mapped uniquely to an internal `Patient`.                                                                                           |
| Canonical verified value        | Patient-confirmed value returned after report verification; it may equal or correct the extracted value.                                                                       |
| Document                        | An uploaded `REPORT` or `PRESCRIPTION` file plus metadata.                                                                                                                     |
| Latest report                   | At most one verified, dated report per normalized test name, selected by report date then creation time.                                                                       |
| Medical record system of record | The PostgreSQL database authoritative for structured MedVault application data; target is hosted PostgreSQL, but current final authority is not yet operationally established. |
| Processing status               | The document's queue/worker lifecycle state.                                                                                                                                   |
| Verification status             | Whether report data is pending or patient-verified, or not applicable.                                                                                                         |
| Extraction status               | Whether the persisted report extraction is a draft or verified.                                                                                                                |

---

# 2. Product Scope and Release Model

## 2.1 MVP Scope

The MVP contains only:

- Supabase-backed patient registration, login, logout, and session use;
- an owned patient profile;
- upload and private retention of reports and prescriptions;
- facts-only Gemini extraction for supported reports;
- patient review/correction and verification;
- document/report history, filtering, latest-by-test selection, dashboard status, retry, and source-file access;
- ownership-safe API deletion and supporting reliability/security foundations.

Account recovery and other target items listed in section 5 remain MVP/Production-Gate gaps; their presence must not be inferred from this scope statement.

## 2.2 Release 2 — Episodes

Future Release 2 may introduce:

- `MedicalEpisode` and `EpisodeMembership` data;
- candidate grouping of medically related reports;
- patient correction of membership;
- chronological comparison/trend views over verified comparable values;
- any constrained multi-report generation approved through a separate safety/privacy process.

Release 2 is not implemented and does not block MVP except where it relies on a security or data foundation independently required by MVP.

## 2.3 Release 3 — Medicines

Future Release 3 may introduce:

- medicines and medication schedules;
- reminders or calendar integration;
- interaction facts from a vetted non-generative source;
- patient-facing interaction explanations with clinical-safety constraints.

Release 3 is not implemented and does not block MVP.

## 2.4 Release 4 — Sharing

Future Release 4 may introduce:

- explicit item/field selection;
- expiring, revocable, read-only share grants;
- unguessable bearer links or another approved recipient authorization mechanism;
- recipient authorization and IDOR protection;
- minimized share access logs and patient-visible share history.

Release 4 is not implemented and does not block MVP.

## 2.5 Future Ecosystem

Mobile apps, wearables, continuous monitoring, provider/doctor portals, hospital discovery, recommendations, appointments, referrals, and similar ecosystem capabilities are future. They are not prerequisites for Releases 1–4 unless separately approved.

## 2.6 Explicit MVP Exclusions

The MVP does not include:

- episode detection or multi-report trend interpretation;
- medicine CRUD, reminders, or interaction checks;
- selective sharing or public recipient views;
- `OTHER` or `UNKNOWN` document types;
- handwritten/Bangla prescription OCR or AI analysis;
- diagnosis, treatment decisions, emergency triage, or autonomous medication changes;
- a full doctor/hospital platform;
- wearables or continuous monitoring.

---

# 3. System Context and Architecture

## 3.1 Current Development Architecture

```text
Browser / Next.js (development)
  |-- session/auth requests ----------------------> hosted Supabase Auth
  |-- Bearer access token ------------------------> local Express API
                                                       |
                                                       |-- Prisma --> configured local PostgreSQL
                                                       |              (last preflight: unreachable)
                                                       |
                                                       |-- service role --> hosted private
                                                       |                   Supabase Storage
                                                       |
                                                       +-- BullMQ --> effective Redis target
                                                                      (documented as hosted Railway
                                                                       unless locally overridden)
                                                                          |
                                                                          v
                                                                     local worker
                                                                          |
                                                                          v
                                                                       Gemini
```

This is a hybrid configuration description, not proof that every component is currently running. Docker Compose defines optional local PostgreSQL and Redis. Effective environment precedence is process variables, then `.env.local`, then `.env`; current development intentionally permits a local database override.

## 3.2 Target Production Architecture

```text
Browser / Next.js
  |-- authentication -----------------------------> Supabase Auth
  |-- verified-session Bearer token --------------> Express API
                                                       |
                                                       +-- Prisma --> hosted PostgreSQL
                                                       |              SYSTEM OF RECORD
                                                       |
                                                       +-- server-only access --> private
                                                       |                        Supabase Storage
                                                       |
                                                       +-- BullMQ --> hosted Redis
                                                                          |
                                                                          v
                                                                       Worker
                                                                          |
                                                +-------------------------+------------------+
                                                |                                            |
                                                v                                            v
                                      hosted PostgreSQL                                   Gemini
                                      extraction/results                         printed-fact extraction
```

Target invariants:

- API and worker use the exact same logical PostgreSQL database.
- API and worker use the same intended Redis queue.
- The browser receives no database, Redis, service-role, or Gemini credential.
- Authentication remains Supabase Auth.
- Original file bytes remain in private Supabase Storage.
- Redis/BullMQ is temporary processing infrastructure, not the medical system of record.
- Prisma remains the primary application database access layer.

## 3.3 Request and Upload Flow

1. The browser authenticates with Supabase and obtains a session.
2. The browser sends the access token to Express in the `Authorization: Bearer` header.
3. Express verifies the token through Supabase Auth and uses only the verified user UUID for authorization.
4. For upload, the browser sends one multipart request containing a file and JSON metadata to Express.
5. Express checks the file limit and magic-byte-detected MIME type.
6. Express stores the file server-side in private Supabase Storage under `<auth-user-id>/<document-id>/<sanitized-name>`.
7. Express creates a patient-scoped `MedicalDocument` through Prisma.
8. For a document stored as `REPORT`, Express enqueues a deterministic document/version job and returns the resulting state; for a document stored as `PRESCRIPTION`, processing is not applicable.

There is no upload-session entity and no implemented direct browser-to-Storage upload flow.

## 3.4 Report Processing Flow

1. BullMQ supplies `documentId` and `documentVersion` to the worker.
2. The worker claims only the matching current report/version and changes its processing state to `PROCESSING`.
3. The worker validates the stored path namespace and supported MIME type.
4. The worker downloads the complete private object server-side.
5. Gemini receives the complete report bytes and MIME type with a fixed facts-only instruction.
6. Application code parses, Zod-validates, normalizes, and categorizes the structured result.
7. A transaction moves the document to `NEEDS_REVIEW` and stores a `DRAFT` extraction and its measurements.
8. The patient compares the extraction with the original file and submits corrections.
9. An owned transaction stores separate verified fields and moves document, verification, and extraction state to `VERIFIED`.

## 3.5 Trust Boundaries

- **Identity:** the API verifies Supabase access tokens; client-supplied patient IDs never establish ownership.
- **Application data:** browser data access is through Express, not direct Supabase Data API queries.
- **Medical files:** server-only Storage credentials perform object operations; signed URLs are issued only after another ownership check and expire.
- **Queue:** a job identifier does not confer authorization; the worker re-reads database ownership/path/version data.
- **AI provider:** full report content crosses an external-provider boundary and must be governed accordingly.
- **Telemetry:** logs and monitoring must exclude medical content, AI prompts/responses, tokens, secrets, signed URLs, and storage paths where sensitive.

---

# 4. Current MVP Functional Contract

This section states current source behavior. Phase 2 must convert it into the authoritative metadata-rich requirement and acceptance contract.

## 4.1 Authentication and Patient Profile

- The web supports registration, email/password login, logout, and protected routing using Supabase Auth.
- Account recovery is not implemented.
- Every `/v1` route requires an API-verified Supabase bearer token.
- The API maps the verified Supabase UUID to one internal `Patient` using the unique `authUserId` field.
- The patient can retrieve and upsert one profile containing name, optional date of birth, gender, blood group, allergy list, chronic-condition list, and emergency contact fields.
- Strict Zod validation rejects unrecognized profile input, including a client-injected patient ID.

## 4.2 Medical Documents

- Implemented `DocumentType` values are `REPORT` and `PRESCRIPTION` only.
- The patient can upload one supported PDF/JPEG/PNG/WebP file per multipart request.
- The default maximum upload size is 15 MiB and is configurable.
- The API stores the original filename, detected MIME, byte size, SHA-256, unique Storage path, document version, optional date/facility/test/category metadata, state, and timestamps.
- Metadata rename/correction after upload is not implemented as a document endpoint.
- The API supports owned document listing, filtering, pagination, detail retrieval, short-lived file access, and coordinated deletion.
- The current web UI supports list/detail/file access but does not expose the deletion API.

## 4.3 Prescription Boundary

- A document stored with `documentType=PRESCRIPTION` is retained privately.
- It receives `ProcessingStatus=NOT_APPLICABLE` and `VerificationStatus=NOT_APPLICABLE`.
- It has no report extraction.
- Queue producer and worker barriers reject records stored as `PRESCRIPTION`.
- The upload metadata is patient/client selected and the API does not independently detect prescription content. A prescription file mislabeled as `REPORT` can therefore enter the report-analysis pipeline; this is an unresolved safety gap.
- Prescription sharing is not implemented; it belongs to Release 4.

## 4.4 Report Extraction

- A newly stored report begins `UPLOADED/PENDING`.
- Successful queue creation is intended to be followed by a move to `QUEUED`; queue failure leaves the original file/row and marks `FAILED` with a safe code. The publication/status ordering race is documented in section 4.7.
- The deterministic job ID is `<documentId>-v<documentVersion>`.
- Queue jobs use four attempts with exponential backoff starting at two seconds.
- The worker increments `processingAttempts` when it atomically claims a matching version.
- Gemini output is untrusted until JSON parsing and Zod validation succeed.
- Successful persistence is transactional and protected by document version/status conditions.
- Provider, model, schema version, analysis time, validated structured output, extraction facts, and measurements are persisted.
- A separate processing/prompt-contract version is not persisted.

## 4.5 Patient Verification

- Verification requires an owned report in `NEEDS_REVIEW/PENDING` with an extraction.
- The service compares the submitted measurement count and IDs with stored IDs, but the input schema does not enforce ID uniqueness; duplicate submitted IDs can defeat the intended exact-set check. This is a Phase 3 integrity gap.
- Verified report metadata is stored on `MedicalDocument`.
- Patient-confirmed measurement fields are stored separately in `verified*` columns.
- `patientCorrected` records whether selected measurement fields differ from their extracted values.
- The original file remains in private Storage; its metadata/path/checksum, extracted fields, provider/model/schema provenance, and structured output remain in PostgreSQL.
- A current edge case exists: extraction may produce no report date, but verification input requires a date and the web form initializes only when a date exists.

## 4.6 History, Filtering, Latest Reports, and Dashboard

- Document/report lists are patient-scoped and support bounded pagination.
- Supported filters include document type, processing status, report category, hospital, test, date range, and a search across filename/test/hospital.
- Supported sort modes are report date descending, report date ascending, and creation time descending.
- The dashboard returns six recent documents, status counts, and latest reports.
- Latest-report selection uses only `REPORT` documents with `VerificationStatus=VERIFIED`, non-null `normalizedTestName`, and non-null `documentDate`.
- It selects the maximum report date for each normalized test name, then the newest `createdAt` on an equal date.
- It returns at most 12 normalized-test groups, ordered by report date then creation time.
- If a report-date tie straddles the 12-group boundary, the current `groupBy` query has no secondary tie-breaker for choosing which tied groups enter the set; cutoff membership is therefore not deterministic.
- Upload time never substitutes for a missing report date in the latest set.

## 4.7 Failure, Retry, Reconciliation, and Deletion

- Transient extraction failure returns a claimed report to `QUEUED`; permanent or final-attempt failure moves it to `FAILED` with a safe failure code.
- An owned failed report can be explicitly retried using the current document version.
- Reconciliation scans bounded stale `QUEUED` and `PROCESSING` reports, preserves live BullMQ jobs, requeues missing/dead jobs using optimistic claims, and marks recovery exhausted when the accumulated worker-processing-claim count reaches a configurable threshold. Repeated recovery attempts made before another worker claim do not themselves increment that count.
- Reconciliation currently does not scan an `UPLOADED` row stranded before the enqueue attempt completes.
- Upload and explicit retry both add or ensure the BullMQ job before an unconditional database update to `QUEUED`. A fast worker can claim `UPLOADED` or `FAILED` as `PROCESSING` and then have that state overwritten by the API. The intended transition therefore has a race that Phase 3 must fix.
- Deletion rejects an active report job, uses a temporary retryable database marker, removes Storage through the server adapter, deletes cascading metadata, and attempts queue/database compensation on partial failure.
- Account-wide deletion/closure is not implemented.

## 4.8 API Error and Ownership Behavior

- Missing/invalid authentication returns `401 UNAUTHENTICATED`.
- Protected resource lookup is patient-scoped.
- Missing and cross-owner resources use the same not-found response so existence is not disclosed.
- Errors are normalized to a safe envelope containing code/message and, where available, request ID or field errors.
- Stack traces, provider secrets, and other patients' data are not intended for client errors.

---

# 5. Target MVP and Production-Gate Work

These items are not current capabilities and must not be described as complete.

## 5.1 Safe Code Completion Before Cutover

- Implement Supabase-compatible account recovery and password update handling.
- Add an accessible patient-facing control for the existing coordinated document-deletion API.
- Fix the missing-extracted-report-date verification edge case and clarify extracted, corrected, and final values visually.
- Enforce unique verification measurement IDs and exact stored/submitted set equality.
- Make upload/retry queue publication and database status transitions race-safe, and cover stranded `UPLOADED` records.
- Define a deterministic secondary rule for latest-report groups tied at the 12-group cutoff.
- Add an approved pre-AI classification/confirmation safeguard so prescription content mislabeled as `REPORT` cannot silently reach Gemini.
- Add `GET /ready` for dependency readiness while retaining `GET /health` as liveness only, and remove the dependency-readiness claim from the root HTML until readiness is actually checked.
- Persist a stable processing/prompt-contract version.
- Add privacy-safe request-to-job correlation.
- Add PDF page-count, image-dimension/resource, and malformed-file limits; keep malware-scanning policy explicit if unresolved.
- Review signed URL cache/referrer/expiry behavior and test expiry/authorization.
- Add a minimized audit-event foundation without medical content.
- Design a retryable account-closure workflow only after retention/legal policy is decided.
- close obvious WCAG 2.2 AA gaps and record required manual checks.

## 5.2 Production Infrastructure Gates

- Identify and reach the authoritative local/legacy source database without recreating its volume.
- Create a protected non-empty PostgreSQL backup and pass an isolated restore rehearsal.
- Establish Storage backup/export and restore evidence preserving exact keys and bytes.
- Identify the intended hosted PostgreSQL and compare migration histories and row counts.
- Resolve the reachable Supabase connection method without guessing pooler details.
- Apply committed migrations safely and migrate data only after every safety prerequisite passes.
- Verify relationships, Storage references, Auth identifier consistency, and source/target counts.
- Switch API and worker to the same hosted PostgreSQL and Redis only after verification.
- Establish least-privilege runtime and migration database roles.
- Minimize Supabase Data API exposure; if application tables remain exposed, enforce and test ownership-safe RLS.
- Complete cross-device, IDOR, failure, backup/restore, monitoring, and rollback tests using synthetic data.
- Resolve Gemini retention, training use, residency, subprocessors, deletion, contract, legal basis, and incident-response decisions.

## 5.3 Current Blocked Safety Result

**CUTOVER NOT PERFORMED.** Source availability, current backup/restore, target connectivity, target migration history, current row counts, and rollback rehearsal were not all established. Six hosted Storage objects previously observed without matching local database metadata remain unresolved and must not be deleted automatically.

---

# 6. Future Functional Requirements

## 6.1 Release 2 — Episodes and Trends

Future requirements include configurable relationship/time rules, patient-correctable membership, explicit included-report display, verified-value comparisons with dates/units, and careful uncertainty wording. Same-name-only grouping is prohibited. Multi-report generative analysis requires a new clinical-safety, privacy, legal, data-flow, and acceptance review before implementation.

## 6.2 Release 3 — Medicines

Future requirements include medicine identity/course management, schedules, reminders/calendar behavior, and interaction facts from a selected vetted source. A generative model alone must never determine an interaction or instruct a patient to start, stop, or change medication.

## 6.3 Release 4 — Sharing

Future requirements include explicit share membership, expiry, revocation, unguessable authorization, read-only recipient access, strict resource inclusion checks, and minimized access logging. Patient ownership of a resource must not automatically make it visible through a share.

## 6.4 Future Ecosystem

Mobile, wearables, continuous monitoring, doctor/provider accounts, hospital discovery, appointments, referrals, and deeper clinical collaboration require separate specifications.

---

# 7. Data Requirements

## 7.1 Authority

Committed Prisma migrations are authoritative for physical PostgreSQL schema names, types, constraints, indexes, and cascade behavior. `packages/database/prisma/schema.prisma` is the readable current model; the committed initial migration is the deployment history currently present in the repository.

## 7.2 Conceptual-to-Physical MVP Mapping

| Concept                                   | Physical implementation                 | Key truth                                                                                          |
| ----------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Authenticated patient                     | External Supabase Auth user + `Patient` | `Patient.authUserId` is a unique UUID mapping.                                                     |
| Health profile                            | `PatientProfile`                        | Optional one-to-one profile owned through `patientId`.                                             |
| Uploaded item                             | `MedicalDocument`                       | Holds file metadata, unique Storage path, checksum, state, attempts, and report metadata.          |
| Report extraction                         | `ReportExtraction`                      | Optional one-to-one document extraction with provider/model/schema provenance and structured JSON. |
| Measurement / former `TestResult` concept | `ReportMeasurement`                     | Extracted and patient-verified fields are stored separately; unique sort order per extraction.     |

## 7.3 Physical Relationships and Cascades

- One `Patient` may have zero or one `PatientProfile` and many `MedicalDocument` rows.
- One `MedicalDocument` may have zero or one `ReportExtraction`.
- One `ReportExtraction` may have many `ReportMeasurement` rows.
- Patient deletion cascades to profile/documents; document deletion cascades to extraction; extraction deletion cascades to measurements.
- `storagePath` is unique.
- `authUserId` is unique.
- `patientId` is unique in `PatientProfile`.
- `documentId` is unique in `ReportExtraction`.
- `(extractionId, sortOrder)` is unique in `ReportMeasurement`.

## 7.4 Version and Provenance Limits

- `MedicalDocument.documentVersion` is currently a concurrency/idempotency token defaulting to `1`.
- No implemented application path increments the version.
- `ReportExtraction.documentId` is unique, so the physical schema retains one extraction row per document rather than a user-visible history of all extraction versions.
- Stored provenance currently includes provider, model, schema version, analysis timestamp, document version, and validated/application-normalized structured output.
- A separate prompt/processing-contract version is absent.

## 7.5 Future/Not-Implemented Entities

| Proposed entity      | Product release               | Current status           |
| -------------------- | ----------------------------- | ------------------------ |
| `MedicalEpisode`     | Release 2                     | FUTURE / no Prisma model |
| `EpisodeMembership`  | Release 2                     | FUTURE / no Prisma model |
| `Medicine`           | Release 3                     | FUTURE / no Prisma model |
| `MedicationSchedule` | Release 3                     | FUTURE / no Prisma model |
| `InteractionWarning` | Release 3                     | FUTURE / no Prisma model |
| `ShareSession`       | Release 4                     | FUTURE / no Prisma model |
| `ShareItem`          | Release 4                     | FUTURE / no Prisma model |
| `ShareAccessLog`     | Release 4                     | FUTURE / no Prisma model |
| `AuditEvent`         | MVP Production Gate candidate | NOT IMPLEMENTED          |

---

# 8. Processing State Model

## 8.1 `ProcessingStatus`

| Value            | Meaning                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `NOT_APPLICABLE` | No report-analysis processing applies, currently used for documents stored as `PRESCRIPTION`. |
| `UPLOADED`       | Report file and database row exist; enqueue has not yet been recorded as successful.          |
| `QUEUED`         | Report is eligible for or awaiting BullMQ processing/retry/recovery.                          |
| `PROCESSING`     | Worker has atomically claimed the current document version.                                   |
| `NEEDS_REVIEW`   | A validated draft extraction exists and requires patient review.                              |
| `VERIFIED`       | Patient verification completed for the report.                                                |
| `FAILED`         | Processing/recovery/deletion coordination failed with a safe failure code.                    |

`STORED` and `READY` are not physical enum values. Queued and running work must not be collapsed into one `PROCESSING` label in the authoritative state contract.

## 8.2 `VerificationStatus`

| Value            | Meaning                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| `NOT_APPLICABLE` | Verification does not apply, currently used for documents stored as `PRESCRIPTION`. |
| `PENDING`        | Report data has not been patient-verified.                                          |
| `VERIFIED`       | Patient verification succeeded.                                                     |

## 8.3 `ExtractionStatus`

| Value      | Meaning                                  |
| ---------- | ---------------------------------------- |
| `DRAFT`    | Persisted extraction remains unverified. |
| `VERIFIED` | Its report has been patient-verified.    |

## 8.4 Current Transition Summary and Known Races

| Event                              | From                                       | To                                                | Additional effects                                                                                                 |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Document stored as `PRESCRIPTION`  | none                                       | `NOT_APPLICABLE / NOT_APPLICABLE / no extraction` | File/metadata retained; no queue job.                                                                              |
| Report database creation           | none                                       | `UPLOADED / PENDING / no extraction`              | Storage object already exists.                                                                                     |
| Enqueue succeeds                   | `UPLOADED`                                 | intended `QUEUED`                                 | Job is published before the row update; a fast worker can expose the documented race.                              |
| Enqueue fails                      | `UPLOADED`                                 | `FAILED`                                          | `QUEUE_UNAVAILABLE`; original object/row remain.                                                                   |
| Worker claims current version      | `UPLOADED`, `QUEUED`, or eligible `FAILED` | `PROCESSING`                                      | `processingAttempts` increments.                                                                                   |
| Transient non-final worker failure | `PROCESSING`                               | `QUEUED`                                          | Safe code recorded; BullMQ may retry.                                                                              |
| Permanent/final worker failure     | `PROCESSING`                               | `FAILED`                                          | Original document remains available.                                                                               |
| Extraction persists                | `PROCESSING / PENDING`                     | `NEEDS_REVIEW / PENDING / DRAFT`                  | Extraction and measurements written transactionally.                                                               |
| Patient verifies                   | `NEEDS_REVIEW / PENDING / DRAFT`           | `VERIFIED / VERIFIED / VERIFIED`                  | Verified metadata/measurement fields stored.                                                                       |
| Explicit retry                     | `FAILED`                                   | intended `QUEUED`                                 | Job is ensured before the row update, exposing the same fast-worker race.                                          |
| Reconcile stale work               | stale `QUEUED` or `PROCESSING`             | unchanged, `QUEUED`, or `FAILED`                  | Live jobs remain unchanged; dead/missing jobs may be requeued; the ceiling can produce `QUEUE_RECOVERY_EXHAUSTED`. |
| Coordinated deletion               | owned non-active document                  | temporary `FAILED/DELETE_PENDING`, then deleted   | Queue/Storage/database compensation attempts protect partial failure.                                              |

Detailed actor, precondition, retryability, document-version, attempt, and user-label metadata is a Phase 2 deliverable.

---

# 9. External Interfaces

## 9.1 Implemented Web Interface

The web currently includes registration/login, protected app layout, onboarding/profile, dashboard, upload, document list/detail, report list/review, source preview, retry, and logout. The public landing page contains an explicitly labeled illustrative dashboard fixture; it is static example content, not API-backed patient data. The web does not include password recovery, account closure, episodes, medicines, sharing, or a document-deletion control.

## 9.2 Implemented HTTP Surface

Public/liveness:

- `GET /`
- `GET /health` — process liveness only; it does not prove PostgreSQL, Redis, Storage, or Gemini readiness.

Authenticated through verified Supabase bearer identity:

- `GET /v1/profile`
- `PUT /v1/profile`
- `POST /v1/documents`
- `GET /v1/documents`
- `GET /v1/documents/{id}`
- `GET /v1/documents/{id}/file`
- `DELETE /v1/documents/{id}`
- `GET /v1/reports`
- `GET /v1/reports/latest`
- `GET /v1/reports/{id}`
- `PUT /v1/reports/{id}/verify`
- `POST /v1/reports/{id}/retry`
- `GET /v1/dashboard`

No readiness, recovery, closure, episode, medicine, share, or audit endpoint is implemented. Phase 2 will create the complete endpoint/OpenAPI contract.

## 9.3 External Services

| Service             | Current purpose                                            | Boundary                                                                                                                                                |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Auth       | Browser sessions and API token verification                | Verified identity is the authorization root; user metadata is not used for ownership.                                                                   |
| Supabase Storage    | Original medical document bytes                            | Server-only service-role access; private bucket is intended/configured and was previously observed, but production posture still requires verification. |
| PostgreSQL / Prisma | Structured application data                                | Configured local in current development; hosted shared target remains blocked.                                                                          |
| Redis / BullMQ      | Report queue, retry/recovery, optional rate-limit counters | Temporary infrastructure, never the medical system of record.                                                                                           |
| Gemini              | Single-report printed-fact extraction                      | Complete eligible report bytes cross this external boundary.                                                                                            |
| Sentry              | Optional error/worker monitoring                           | Must scrub medical and secret data; deployed alerting/retention are not verified.                                                                       |

---

# 10. AI and Clinical-Safety Boundary

## 10.1 Data Sent to Gemini

- Only documents stored with `documentType=REPORT` are eligible.
- That classification comes from upload metadata selected by the patient/client. The API validates the enum but does not inspect file semantics to detect a mislabeled prescription, so the current barrier is label-based rather than content-based.
- Supported MIME types are PDF, JPEG, PNG, and WebP.
- The worker downloads and sends the **complete object bytes** and MIME type.
- The adapter does not deliberately add patient database ID, Auth UUID, original filename, Storage path, profile, bearer token, or signed URL.
- The report itself may contain names, identifiers, dates, facility information, or other medical/personal content.

## 10.2 Permitted AI Action

Gemini may extract facts explicitly printed in one report, including report/test name, date, facility, category, patient name printed on the report, measurements, units, reference ranges, and source flags.

Gemini must not:

- diagnose;
- interpret a patient's health status;
- infer facts absent from the report;
- determine treatment;
- autonomously recommend starting, stopping, or changing medication;
- analyze prescriptions in the MVP.

## 10.3 Application and Patient Controls

- A JSON response schema constrains provider output.
- Application code parses and validates the response with strict Zod schemas.
- Application code normalizes test/measurement names and can apply deterministic category logic.
- Invalid/malformed output does not become a completed extraction.
- A successful extraction remains `DRAFT/PENDING/NEEDS_REVIEW`.
- Only the authenticated patient can submit verification for their owned report.

## 10.4 Future Multi-Report Analysis

Multi-report generative analysis is not an MVP capability. Before Release 2 implementation, it requires an approved data flow, clinical-safety language, model/output contract, privacy/provider review, human correction controls, failure behavior, and acceptance tests.

## 10.5 Unresolved Provider/Legal Questions

Repository code cannot prove provider retention, training use, processing region, residency, subprocessors, staff access, deletion guarantees, legal basis, contractual protections, breach handling, or jurisdictional compliance. These remain external Production-Gate decisions.

---

# 11. Security, Privacy, and Data Governance

## 11.1 Implemented Security Invariants

- Every `/v1` route verifies a Supabase bearer token.
- Patient ownership derives from the verified Auth UUID/internal Patient mapping.
- Client resource IDs select a candidate only; ownership-scoped database conditions decide access.
- Missing and cross-owner resources are deliberately indistinguishable where applicable.
- Original medical files use server-side private Storage operations.
- Signed URLs are time-bounded and created only after an ownership re-check.
- The service-role, database, Redis, and Gemini credentials are server-only.
- Rate limiting is available, with Redis/fail-closed defaults in production configuration.
- Medical content, AI prompts/responses, tokens, credentials, and signed URLs must not be logged.

## 11.2 Supabase Data API and RLS Truth

The browser does not need Supabase Data API access to application tables. Current application access goes through Express/Prisma. The committed application migration does not enable application-table RLS, and hosted grants/exposure have not been verified.

The target design should minimize or disable Data API exposure for application tables. If tables remain exposed, grants and RLS must deny anonymous access and constrain authenticated rows using trusted identity; broad `USING (true)` or role-only access is prohibited. Backend Prisma connection semantics and least-privilege role behavior must be tested against the actual target.

## 11.3 Data Lifecycle Truth

- Single-document deletion is implemented through a coordinated API workflow.
- Account-wide deletion, legal holds, retention periods, and backup expiry are unresolved.
- Direct/operator database deletion can bypass Storage coordination and is not a supported lifecycle workflow.
- Six previously observed Storage objects did not match current local database metadata; they are investigation candidates, not authorization to delete.
- No operational PostgreSQL or Storage restore is currently verified.

---

# 12. Non-Functional Requirements and Evidence Boundary

## 12.1 Reliability

Implemented mechanisms include asynchronous extraction, bounded BullMQ retry/backoff, version/status conditional claims, transactional extraction replacement, stale queue reconciliation, safe failure codes, original-file preservation, and coordinated single-document deletion.

Remaining risks include the unhandled stranded-`UPLOADED` window, eventual rather than transactional queue recovery, no durable outbox, no account-wide deletion workflow, and unverified live recovery.

## 12.2 Performance

The architecture prevents the upload HTTP request from waiting for Gemini once queueing succeeds. No production load test establishes the v1.0 latency targets. Concurrency, file mix, dataset size, queue load, percentiles, test duration, and third-party exclusions must be defined and measured in Phase 5 before any target is claimed as met.

## 12.3 Availability and Readiness

`GET /health` reports process liveness only. Dependency readiness is not implemented. Production must define which dependencies are mandatory for readiness and how degraded Redis, Storage, worker, and Gemini conditions affect safe API behavior.

## 12.4 Accessibility and Usability

The current UI includes labels and some status/error semantics, but no complete WCAG 2.2 AA verification exists. Keyboard, focus, screen-reader, error association, contrast-independent status, dialogs, upload, verification, deletion, and responsive behavior require automated plus manual acceptance evidence.

## 12.5 Maintainability and Observability

- Shared TypeScript/Zod contracts are reused across workspaces.
- Prisma migrations are version-controlled.
- Adapters isolate Auth, Storage, queue, and AI for mock-backed tests.
- Provider/model/schema extraction provenance exists.
- A separate prompt-contract version and end-to-end request/job correlation do not exist.
- Sentry instrumentation exists, but production alerting, retention, scrubbing, and incident ownership are not verified.

## 12.6 Backup and Recoverability

Redis is not backed up as the medical system of record. Production readiness requires protected PostgreSQL and Storage backups plus successful isolated restores, row/relationship/reference checks, authenticated read checks, and ownership/IDOR revalidation. A backup is not considered available merely because a Docker volume or provider feature exists.

---

# 13. Acceptance Boundary

## 13.1 MVP Acceptance Domains

Phase 2 must create testable criteria for:

- registration, login, logout, and recovery status;
- verified-identity ownership and cross-patient denial;
- profile create/read/update;
- report and prescription upload boundaries;
- private file access and signed URL expiry;
- report queueing, extraction, malformed output, failure, retry, and reconciliation;
- patient verification and corrected-value provenance;
- list/filter/pagination/latest/dashboard behavior;
- coordinated document deletion and partial failure;
- same-account cross-device persistence;
- DB, Redis, worker, Storage, and Gemini failure behavior;
- accessibility.

Criteria that depend on missing code or blocked infrastructure must be marked accordingly rather than weakened.

## 13.2 Production-Gate Acceptance

Production cannot be approved without evidence for:

- hosted database identity, migration history, data integrity, and API/worker alignment;
- PostgreSQL and Storage backup plus isolated restore;
- cross-device persistence using synthetic accounts/data;
- IDOR denial for every protected resource/action;
- Data API/RLS/grant denial and least-privilege runtime role behavior;
- controlled failure recovery and rollback;
- monitoring privacy, alerting, incident ownership, and secret rotation;
- Gemini privacy/legal/contract decisions;
- measured performance and WCAG 2.2 AA review.

## 13.3 Future Release Acceptance

- Release 2 acceptance covers episode membership, correction, trend accuracy, uncertainty, and multi-report safety/privacy.
- Release 3 acceptance covers medicine lifecycle, reminder behavior, vetted interaction provenance, and medication-safety wording.
- Release 4 acceptance covers explicit share membership, token security, expiry, revocation, recipient IDOR resistance, and minimized access logs.

These future criteria are not MVP blockers unless they depend on an independently applicable MVP security foundation.

---

# 14. Open Decisions and Known Risks

The following remain unresolved and must receive owners, due dates, evidence, and release decisions in Phase 2:

1. Account-recovery and account-closure policy/workflows.
2. Final upload page/dimension/resource limits and malware-scanning decision.
3. Prompt/processing-contract versioning.
4. Request-to-job correlation design.
5. Stranded `UPLOADED` recovery or durable outbox strategy.
6. Null report-date verification behavior.
7. Audit event model, retention, access, and minimization.
8. Hosted PostgreSQL reachability, backup, migration, roles, grants, and RLS/Data API posture.
9. Supabase Storage backup/export and six unmatched-object investigation.
10. Production domain, deployment, TLS, secrets, monitoring, incident ownership, RPO, and RTO.
11. Gemini provider retention, training, residency, legal basis, contracts, deletion, and incident terms.
12. Performance targets/test shape and accessibility manual-testing plan.
13. Release 2 episode rules and any generative-analysis approval.
14. Release 3 interaction provider and reminder mechanism.
15. Release 4 share authorization and access-log minimization.

---

# Appendix A — Current State Sequence

```text
Nominal REPORT flow (the queue/status publication races are documented in section 4.7)
  -> UPLOADED / PENDING
  -> QUEUED / PENDING
  -> PROCESSING / PENDING
  -> NEEDS_REVIEW / PENDING / DRAFT extraction
  -> VERIFIED / VERIFIED / VERIFIED extraction

Failure/recovery
  PROCESSING -> QUEUED (transient retry)
  PROCESSING -> FAILED (permanent/final attempt)
  FAILED -> QUEUED (explicit retry)
  stale QUEUED|PROCESSING -> unchanged when its job is live
  stale QUEUED|PROCESSING -> unchanged, QUEUED, or FAILED when its job is not live
    (queue-state errors and lost optimistic updates can leave the row unchanged)

document stored as PRESCRIPTION
  -> NOT_APPLICABLE / NOT_APPLICABLE / no extraction
```

# Appendix B — Evidence Index

- Physical models/enums: `packages/database/prisma/schema.prisma`
- Physical migration: `packages/database/prisma/migrations/20260807000000_initial/migration.sql`
- Shared input/output schemas: `packages/shared/src/index.ts`
- Authentication: `apps/api/src/middleware/auth.ts`; `apps/web/lib/supabase/*`
- HTTP routes and upload validation: `apps/api/src/app.ts`
- Ownership/data/latest/verification: `apps/api/src/services/prisma-service.ts`
- Private Storage: `apps/api/src/services/storage.ts`; `apps/worker/src/storage.ts`
- Queue/retry: `apps/api/src/services/queue.ts`
- Reconciliation: `apps/api/src/services/reconciliation.ts`
- Coordinated deletion: `apps/api/src/services/document-deletion.ts`
- Worker state/persistence: `apps/worker/src/processor.ts`; `apps/worker/src/prisma-repository.ts`
- Gemini contract: `packages/ai/src/index.ts`
- Environment truth: `docs/ENVIRONMENTS.md`
- AI/privacy truth: `docs/AI_DATA_FLOW_AND_PRIVACY.md`
- Infrastructure safety result: `docs/MEDVAULT_REPAIR_TRACKER.md`

# Appendix C — Phase 1 Boundary

Phase 1 corrected specification truth only. It did not change Prisma schema, migrations, runtime endpoints, Supabase configuration, RLS, Redis, production infrastructure, or future-release implementation. Phase 2 must verify this draft and add the authoritative requirements, API, traceability, state, data, acceptance, and open-decision contracts without silently changing these baseline decisions.
