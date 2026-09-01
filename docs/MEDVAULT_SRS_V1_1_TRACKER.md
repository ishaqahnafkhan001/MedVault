# MedVault SRS v1.1 Tracker

This file is the continuity record for the five-phase SRS v1.1 and production-readiness process. It records specification decisions and evidence only. It must never contain credentials, tokens, signed URLs, patient identifiers, report contents, or other medical data.

## Source and Repository Baseline

- Review date: 2026-08-31
- SRS v1.0 source: `C:\Users\user\Downloads\MedVault_SRS_v1.0.docx`
- SRS v1.0 SHA-256: `8063B6FB28498D35200F6FC184133A79FB5DBC64CFDAEA2C5759476BE6DFB74D`
- Source preservation: the v1.0 DOCX was read but not modified or re-exported.
- Repository baseline: branch `main`, commit `efdf591`
- Working-tree warning: 50 paths were already modified or untracked when this SRS process started. Those changes are the earlier MedVault repair set and must not be discarded or broadly rewritten.
- Operational boundary: no database, migration, Redis queue, Supabase project, Storage object, Auth account, RLS policy, grant, environment secret, or production resource was changed during Phase 1.

## Phase Status

- [x] Phase 1 — Specification Truth (COMPLETE)
- [ ] Phase 2 — MVP Contract
- [ ] Phase 3 — Code Completion
- [ ] Phase 4 — Production Infrastructure
- [ ] Phase 5 — Acceptance / Freeze

Do not mark a phase complete without its required evidence. Do not start a later phase automatically.

## Status Vocabulary

- `VERIFIED`: behavior has direct evidence at the level claimed.
- `IMPLEMENTED`: source exists, but all required live or acceptance evidence does not.
- `PARTIAL`: only part of the requirement exists.
- `NOT IMPLEMENTED`: no qualifying implementation was found.
- `BLOCKED`: completion depends on a failed safety gate or external decision.
- `FUTURE`: intentionally assigned to Release 2 or later.
- `UNKNOWN`: evidence is insufficient.

## Change Register

### SRS11-001 — Product definition

- Original SRS statement: MedVault is a "patient-owned intelligent medical record platform."
- Repository reality: source establishes patient-scoped control through verified Supabase identity and ownership-filtered API queries; it does not establish a legal ownership conclusion.
- Required action: use "patient-controlled personal medical-record platform" and describe the actual authorization boundary.
- Priority: P0
- Target release: MVP specification
- Implementation status: IMPLEMENTED
- Evidence: `apps/api/src/middleware/auth.ts:16-47`; `apps/api/src/services/prisma-service.ts:39-65`; `docs/architecture.md:15-17`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-002 — Product release terminology

- Original SRS statement: product delivery is labeled Phase 1 through Phase 5.
- Repository reality: the repair process also uses numbered phases, making the product labels ambiguous.
- Required action: use MVP, Release 2 — Episodes, Release 3 — Medicines, Release 4 — Sharing, and Future Ecosystem. Reserve Phase 1–5 for this repair process.
- Priority: P0
- Target release: all product releases
- Implementation status: IMPLEMENTED
- Evidence: SRS v1.0 section 2.7; five-phase process instructions; `docs/phase-1-plan.md:1-12`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-003 — MVP scope

- Original SRS statement: the web baseline includes episodes/trends, medicine management/reminders/interactions, and selective sharing/access logs.
- Repository reality: no corresponding Prisma models, API routes, worker flows, or web routes exist.
- Required action: remove these capabilities from MVP and assign them to Releases 2, 3, and 4 respectively.
- Priority: P0
- Target release: MVP / Releases 2–4
- Implementation status: FUTURE for deferred capabilities
- Evidence: `packages/database/prisma/schema.prisma:52-166`; `apps/api/src/app.ts:79-212`; repository route inventory
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-004 — Current versus target PostgreSQL

- Original SRS statement: PostgreSQL on Supabase is the current technology baseline.
- Repository reality: the effective development configuration intentionally selects local Docker PostgreSQL, while Auth/Storage and Redis are hosted. The local source was unreachable at the latest preflight, and hosted cutover was blocked.
- Required action: describe local PostgreSQL as the configured development/legacy source, hosted PostgreSQL as the target, and state that the final operational system of record is not yet established.
- Priority: P0
- Target release: Production Gate
- Implementation status: BLOCKED
- Evidence: `docs/ENVIRONMENTS.md:1-20`; `docs/MEDVAULT_REPAIR_TRACKER.md:282-345`; `docker-compose.yml:1-22`
- Phase: 1 for specification; 4 for infrastructure
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-005 — Upload mechanism

- Original SRS statement: the web client requests an upload session.
- Repository reality: the browser sends one multipart request to Express; the API buffers one file, validates its magic bytes, and uploads it server-side to Supabase Storage.
- Required action: replace "upload session" with "multipart upload through Express" and server-side private Storage upload.
- Priority: P0
- Target release: MVP
- Implementation status: IMPLEMENTED
- Evidence: `apps/api/src/app.ts:95-122`; `apps/api/src/services/prisma-service.ts:67-119`; `apps/api/src/services/storage.ts:10-30`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-006 — Implemented document types

- Original SRS statement: MVP supports `REPORT`, `PRESCRIPTION`, and `OTHER/UNKNOWN` document types and allows type correction.
- Repository reality: physical and shared enums contain only `REPORT` and `PRESCRIPTION`; `OTHER` is a report category, not a document type. No document-type correction endpoint exists.
- Required action: limit implemented MVP types to report and prescription; treat other document types/type correction as unimplemented unless designed later.
- Priority: P0
- Target release: MVP
- Implementation status: IMPLEMENTED for two types; NOT IMPLEMENTED for other/type correction
- Evidence: `packages/database/prisma/schema.prisma:13-16`; `packages/shared/src/index.ts:5-27`; `apps/api/src/app.ts:79-212`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-007 — Processing state vocabulary

- Original SRS statement: document states are `STORED`, combined `PROCESSING`, `NEEDS_REVIEW`, `READY`, and `FAILED`.
- Repository reality: Prisma has three separate state dimensions. `QUEUED` and `PROCESSING` are distinct, and patient-confirmed completion is `VERIFIED`.
- Required action: document the exact `ProcessingStatus`, `VerificationStatus`, and `ExtractionStatus` enums plus the observed/intended transitions and known races.
- Priority: P0
- Target release: MVP
- Implementation status: IMPLEMENTED enum vocabulary; PARTIAL transition reliability
- Evidence: `packages/database/prisma/schema.prisma:18-50`; `apps/api/src/services/prisma-service.ts:97-119,210-297`; `apps/worker/src/prisma-repository.ts:21-170`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-008 — Physical measurement model

- Original SRS statement: the core data model contains `TestResult`.
- Repository reality: the physical Prisma model is `ReportMeasurement`.
- Required action: retain a readable conceptual measurement concept but map it explicitly to `ReportMeasurement`.
- Priority: P0
- Target release: MVP
- Implementation status: IMPLEMENTED
- Evidence: `packages/database/prisma/schema.prisma:141-166`; initial Prisma migration
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-009 — Physical versus future data model

- Original SRS statement: episodes, medicines, sharing, and audit entities appear alongside implemented data without implementation status.
- Repository reality: only `Patient`, `PatientProfile`, `MedicalDocument`, `ReportExtraction`, and `ReportMeasurement` exist.
- Required action: add a physical Prisma mapping and label every other proposed entity future/not implemented.
- Priority: P0
- Target release: MVP / Releases 2–4
- Implementation status: IMPLEMENTED for five physical models; FUTURE otherwise
- Evidence: `packages/database/prisma/schema.prisma:52-166`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-010 — Gemini input minimization claim

- Original SRS statement: the worker submits only required report content and metadata.
- Repository reality: Gemini receives the complete eligible PDF/image bytes and MIME type. The adapter does not deliberately add account/database identifiers, but identifiers may be present inside the report itself.
- Required action: state the complete-byte flow without claiming content minimization that the implementation does not perform.
- Priority: P0
- Target release: MVP / Production Gate
- Implementation status: IMPLEMENTED behavior; provider/privacy approval remains BLOCKED
- Evidence: `packages/ai/src/index.ts:108-127`; `docs/AI_DATA_FLOW_AND_PRIVACY.md:5-11`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-011 — AI clinical-safety boundary

- Original SRS statement: AI may analyze trends, explain health state, or recommend doctor review across episodes in the baseline.
- Repository reality: Gemini is used only for printed-fact extraction from a single eligible report; the fixed prompt forbids diagnosis, health-status interpretation, inference, and treatment recommendations.
- Required action: constrain MVP AI to facts, keep patient verification mandatory, and require separate safety/privacy approval before any multi-report generative analysis.
- Priority: P0
- Target release: MVP / Release 2
- Implementation status: IMPLEMENTED for extraction; FUTURE for multi-report generation
- Evidence: `packages/ai/src/index.ts:120-158`; `apps/worker/src/processor.ts:54-98`; `docs/AI_DATA_FLOW_AND_PRIVACY.md:13-29`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-012 — Prescription processing boundary

- Original SRS statement: prescriptions are stored and shareable while excluded from AI.
- Repository reality: records stored as `PRESCRIPTION` use terminal `NOT_APPLICABLE` states and are excluded from the queue/worker, but upload type is client-selected metadata and content is not independently classified. A prescription mislabeled as `REPORT` can reach Gemini. Sharing is not implemented.
- Required action: describe the label-based boundary and misclassification risk, record pre-AI classification/confirmation hardening as a code gap, and defer sharing to Release 4.
- Priority: P0
- Target release: MVP / Release 4
- Implementation status: PARTIAL for content-level exclusion; FUTURE for sharing
- Evidence: `apps/api/src/services/prisma-service.ts:97-119`; `apps/api/src/services/queue.ts:29-38`; `apps/worker/src/processor.ts:54-57`; `apps/worker/src/prisma-repository.ts:21-25`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-013 — Extraction, correction, and provenance

- Original SRS statement: raw AI output and patient-corrected canonical data are distinguishable and prompts/output schemas are versioned.
- Repository reality: extracted and verified measurement fields are separate, `patientCorrected` is persisted, and provider/model/schema version are stored. `rawOutput` is the validated/application-normalized structured extraction, not a byte-for-byte provider response. A separate prompt/processing-contract version is not stored.
- Required action: describe the existing fields precisely and record prompt-contract provenance as a later implementation gap.
- Priority: P1
- Target release: MVP / Production Gate
- Implementation status: PARTIAL
- Evidence: `packages/database/prisma/schema.prisma:114-166`; `apps/worker/src/prisma-repository.ts:63-142`; `docs/AI_DATA_FLOW_AND_PRIVACY.md:13-17`
- Phase: 1 specification; 3 implementation gap
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-014 — Architecture baselines

- Original SRS statement: one architecture diagram presents target hosted services as current.
- Repository reality: code architecture, configured development topology, and intended production topology are different evidence claims.
- Required action: add separate current-development and target-production diagrams, explicitly label operationally blocked/unverified components, and keep future product services separate.
- Priority: P0
- Target release: MVP / Production Gate
- Implementation status: IMPLEMENTED in specification; target deployment BLOCKED
- Evidence: `docs/ENVIRONMENTS.md:7-73`; `docs/MEDVAULT_REPAIR_TRACKER.md:327-345`
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-015 — Current reliability and lifecycle capabilities

- Original SRS statement: v1.0 omits deterministic job IDs, queue reconciliation, attempt ceilings, coordinated document deletion, and read-only consistency checks.
- Repository reality: these capabilities exist in the current repair set.
- Required action: represent them in the Current Implemented System without turning source presence into live-production verification.
- Priority: P1
- Target release: MVP
- Implementation status: IMPLEMENTED; live verification incomplete
- Evidence: `apps/api/src/services/queue.ts:20-100`; `apps/api/src/services/reconciliation.ts:41-216`; `apps/api/src/services/document-deletion.ts:25-185`; `apps/api/src/services/consistency.ts:53-249`
- Phase: 1 baseline; detailed contracts deferred to Phase 2
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-016 — Latest-report rule

- Original SRS statement: latest uses verified report date but leaves tie-breaking and limits unclear.
- Repository reality: only verified reports with non-null normalized test name/date participate; one per normalized test is selected by newest report date, then newest `createdAt`; at most 12 groups are returned. If a report-date tie straddles the 12-group boundary, group membership has no secondary selection order and is nondeterministic.
- Required action: state the exact implemented rule, do not substitute upload time for a missing report date, and record the boundary-tie limitation.
- Priority: P1
- Target release: MVP
- Implementation status: PARTIAL because boundary-tie group membership is not deterministic
- Evidence: `apps/api/src/services/prisma-service.ts:162-198`
- Phase: 1 summary; detailed acceptance deferred to Phase 2
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-017 — Current MVP gaps and production gates

- Original SRS statement: account recovery, dependency readiness, audit trail, backup/restore, RLS, and production-hosted persistence are written as present or baseline requirements without implementation truth.
- Repository reality: recovery UI/API, `/ready`, `AuditEvent`, account-wide closure, hosted cutover, operational backup/restore, and hosted grants/RLS verification are absent or blocked.
- Required action: place these in the Target Production System and never claim completion without evidence.
- Priority: P0
- Target release: MVP Production Gate
- Implementation status: NOT IMPLEMENTED or BLOCKED by item
- Evidence: `apps/api/src/app.ts:45-212`; `packages/database/prisma/schema.prisma:52-166`; `docs/BACKUP_AND_RECOVERY.md`; `docs/DATABASE_SECURITY_PLAN.md`; `docs/MEDVAULT_REPAIR_TRACKER.md:282-364`
- Phase: 1 specification; 3–5 completion
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-018 — Future acceptance criteria

- Original SRS statement: baseline acceptance includes episode grouping, medicine interactions, selective sharing, and share revocation.
- Repository reality: these workflows are not implemented and cannot be MVP acceptance gates.
- Required action: move acceptance ownership to Releases 2–4 and retain only shared security foundations as possible MVP concerns.
- Priority: P0
- Target release: Releases 2–4
- Implementation status: FUTURE
- Evidence: SRS v1.0 acceptance criteria AC-04 through AC-09; absent schema/routes noted in SRS11-003
- Phase: 1
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-019 — Known pre-cutover operational blockers

- Original SRS statement: hosted PostgreSQL and cross-device persistence are implied by the architecture.
- Repository reality: the local source is unavailable, no current source backup/restore is verified, the hosted direct endpoint is unreachable from this host, migration histories and row counts are not established, and six Storage objects remain unmatched to local metadata.
- Required action: label cutover and cross-device persistence BLOCKED; preserve the local source and unresolved Storage objects.
- Priority: P0
- Target release: Production Gate
- Implementation status: BLOCKED
- Evidence: `docs/MEDVAULT_REPAIR_TRACKER.md:231-260,282-364`; `docs/DATABASE_MIGRATION_RUNBOOK.md`
- Phase: 1 specification; 4 infrastructure
- Completion status: COMPLETE — Phase 1 specification action validated

### SRS11-020 — Current implementation gaps discovered during truth review

- Original SRS statement: queue reliability and verification are described generally as complete baseline behavior.
- Repository reality: reconciliation scans stale `QUEUED` and `PROCESSING` records but not a stranded `UPLOADED` row; upload and retry can overwrite a fast worker's `PROCESSING` claim with `QUEUED`; verification requires a non-null report date and does not enforce unique submitted measurement IDs; the web has no document-deletion control; no request-to-job correlation identifier is propagated; `/health` is static liveness even though the root HTML currently claims readiness; pre-AI document type is client-selected; and latest-group cutoff ties are nondeterministic.
- Required action: record these as Phase 3 code-completion candidates without changing runtime behavior in Phase 1.
- Priority: P1
- Target release: MVP / Production Gate as classified in Phase 2
- Implementation status: PARTIAL
- Evidence: `apps/api/src/services/prisma-service.ts:82-119,162-198,210-297`; `apps/api/src/services/reconciliation.ts:66-124`; `packages/shared/src/index.ts:50-58,81-106`; `apps/web/components/report-review.tsx:35-54`; `apps/api/src/app.ts:45-62`; current web component inventory
- Phase: 1 discovery; 2 classification; 3 implementation
- Completion status: COMPLETE — Phase 1 specification action validated

## Phase 1 Evidence Index

- Working SRS: `docs/srs/MedVault_SRS_v1.1.md`
- Mismatch report: `docs/srs/MEDVAULT_SRS_V1_0_MISMATCH_REPORT.md`
- Repository continuity: `docs/MEDVAULT_REPAIR_TRACKER.md`
- Environment truth: `docs/ENVIRONMENTS.md`
- AI boundary: `docs/AI_DATA_FLOW_AND_PRIVACY.md`
- Physical schema: `packages/database/prisma/schema.prisma`
- API routes and upload behavior: `apps/api/src/app.ts`
- API ownership/data behavior: `apps/api/src/services/prisma-service.ts`
- Queue/recovery: `apps/api/src/services/queue.ts`, `apps/api/src/services/reconciliation.ts`
- Worker/AI persistence: `apps/worker/src/processor.ts`, `apps/worker/src/prisma-repository.ts`, `packages/ai/src/index.ts`

## Phase 1 Completion Record

- Status: COMPLETE — specification truth only. No Phase 2 work has started.
- Source preservation: the original v1.0 DOCX remains unchanged; its SHA-256 was rechecked as `8063B6FB28498D35200F6FC184133A79FB5DBC64CFDAEA2C5759476BE6DFB74D`.
- Structural review: all 20 change-register entries contain the original statement, repository reality, required action, priority, target release, implementation status, evidence, phase, and completion status.
- Independent review: multiple read-only technical review passes were incorporated, including corrections for client-selected prescription classification, queue/status races, reconciliation no-op outcomes, measurement-ID uniqueness, latest-group boundary ties, processing-claim threshold semantics, and hybrid-development terminology.
- Files changed for Phase 1: `README.md`; `apps/web/app/page.tsx`; `docs/architecture.md`; `docs/phase-1-plan.md`; `docs/AI_DATA_FLOW_AND_PRIVACY.md`; `docs/DATA_LIFECYCLE.md`; `docs/ENVIRONMENTS.md`; `docs/MEDVAULT_REPAIR_TRACKER.md`; this tracker; the working SRS; and the mismatch report.
- Automated validation: targeted Prettier formatting passed; `pnpm lint` passed (11/11 tasks); `pnpm typecheck` passed (11/11 tasks); `pnpm test` passed (80 tests); `pnpm build` passed (7/7 tasks) using a process-only non-local placeholder for `NEXT_PUBLIC_API_URL`; and `pnpm db:validate` passed.
- Validation boundary: source and tests were inspected, but no live PostgreSQL, Redis, Supabase Auth/Storage policy, Gemini, cross-device, migration, backup/restore, or production workflow was exercised. Those operational claims remain blocked or unverified as recorded.
- Document tooling note: the source DOCX was completely read through structured OOXML extraction. LibreOffice was unavailable for optional page rendering; the original DOCX was not modified, and Phase 1 outputs are Markdown artifacts.

## Remaining Phase 2 Work

Phase 2 must verify Phase 1 first, then add authoritative requirement metadata, a requirements traceability matrix, the endpoint/OpenAPI contract, the complete data/state contract, acceptance classifications, evidence dates, owners, and open-decision governance. Phase 2 must not infer live verification from source or unit tests and must not begin production infrastructure work.
