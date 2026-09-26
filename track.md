# MedVault execution tracker

## Resume here

- Plan: MV-COMPLETE-2026-09-10-v1; immutable scope in [plan](docs/completion/plan.md)
- Source: MedVault_Incomplete_Work_Report.pdf, dated 2026-09-09; supplied completion playbook dated 2026-09-10
- Evidence basis: current targeted source inspection plus separately labeled historical checks
- Current phase: EX-05 (independent Phase 2 completion work; EX-02/EX-04 live gates remain blocked)
- Current subtask: EX-05 independent work complete; live and clinical acceptance deferred
- Execution state: BLOCKED
- Next action: do not run hosted EX-05 lifecycle or method/specimen migration while EX-02 recovery approval is blocked. Begin EX-06 only on an explicit user instruction, carrying all EX-05 live/clinical evidence to EX-10.
- Next phase after acceptance: EX-06 only after EX-05 independent work is complete; hosted summaries, actual browser/device evidence and clinical approval remain separately gated
- Last updated UTC: 2026-09-20 20:11 (EX-05 independent implementation and full gates pass; hosted/browser/device/clinical acceptance not run; no hosted call)
- Branch / HEAD: antigravity / b078f39aa90e45a9d2b71dc8bbb3c6320113beb0
- Working diff / user edits to preserve: initial 28 modified tracked files, 2,880 additions / 80 deletions; pre-existing untracked Phase 2 tests/migrations/UI/docs and output PDF; do not reset or attribute those edits to EX-01
- Shell and repository root: PowerShell; C:/Users/user/WebstormProjects/MedVault

## Execution phases

| Phase | State       | Completed subtasks                                |
| ----- | ----------- | ------------------------------------------------- |
| EX-01 | VERIFIED    | 01.1, 01.2, 01.3, 01.4, 01.5                      |
| EX-02 | BLOCKED     | 02.1, 02.2, 02.3                                  |
| EX-03 | VERIFIED    | 03.1, 03.2, 03.3, 03.4, 03.5                      |
| EX-04 | BLOCKED     | 04.1, 04.2, 04.3, 04.4, 04.5 independent work     |
| EX-05 | BLOCKED     | 05.1, 05.2, 05.3 inspection, 05.4, 05.6 automated |
| EX-06 | NOT_STARTED | none                                              |
| EX-07 | NOT_STARTED | none                                              |
| EX-08 | NOT_STARTED | none                                              |
| EX-09 | NOT_STARTED | none                                              |
| EX-10 | NOT_STARTED | none                                              |

## Current phase acceptance

- Scope: EX-05 independent Phase 2 completion. The operator explicitly deferred paid/cloud recovery, so EX-02 and the EX-04 live gate remain blocked and EX-05 must not mutate hosted PostgreSQL, Auth, Storage or Redis.
- 05.1 PASS so far: added patient-scoped per-metric latest cards and a global test-history workflow with runtime validation, clinical-date filters, unknown-date handling, original-report links and source-specific ranges; deterministic latest-report selection now limits only after total ordering.
- 05.2 PASS so far: added a versioned, curated MedlinePlus terminology map with explicit general-information/unmapped uncertainty. Gemini remains a fact selector and cannot author these explanations.
- 05.3 PARTIAL/BLOCKED: comparison and snapshot contracts already carry laboratory/method/specimen, separate differing supplied contexts, and include context/config in fingerprints. Current persistence supplies only laboratory; method/specimen remain null. The required additive persistence migration is deferred until EX-02 review and must not be improvised now.
- 05.4 PASS for the non-clinical boundary: a reusable validated input/result contract exposes provenance, required context and zero supported metrics; automated urgency remains disabled. Clinical rules and approval remain BLOCKED.
- 05.5 BLOCKED/NOT_RUN: real hosted report/episode queue-provider-write-reload, active-job stale correction and post-restart cache evidence would mutate hosted database/Redis and depends on EX-02.
- 05.6 PASS for automated/static scope: full lint/typecheck/build/Prisma/format/diff gates pass and 364 tests pass with one explicit opt-in PostgreSQL integration skip. Actual browser/device, hosted failure and restart checks remain BLOCKED/NOT_RUN.

## Prior phase acceptance — EX-03

- Scope: EX-03 provider diagnosis only. The operator explicitly selected EX-03 while keeping EX-02 blocked and prohibiting hosted database mutation.
- 03.1 inspection: a fresh process loads root `.env`; `.env.local` is absent; the Gemini key is configured without being printed; the prior selected model was `gemini-2.5-flash`; no Vertex AI selector, Google Cloud project/location or custom Google API endpoint is configured. Installed SDK is pinned `@google/genai` 2.16.0 on Node 24.12.0.
- Backend/resource: application construction passes an API key to `GoogleGenAI`, selecting the Gemini Developer API. EX-03 now explicitly pins that backend to `https://generativelanguage.googleapis.com`, API version `v1beta`, one SDK attempt and a 45-second request ceiling; worker, report adapter, summary adapter and persisted model expectations use the shared model default.
- 03.2 live reproduction: SDK and direct `v1beta` REST requests used the same key/model/backend context and both returned HTTP 404/`NOT_FOUND`. The provider states that `models/gemini-2.5-flash` is unavailable to new users and directs this context to `models/gemini-3.6-flash`; this disproves bad-key, SDK-only, endpoint and request-method hypotheses.
- 03.3 cause and bounded repair: credential-cohort/model availability was the cause. The same credential/backend produced valid structured output through both SDK and direct REST with stable `gemini-3.6-flash`; no key rotation, provider/backend replacement or API-version change occurred. Gemini 3 requests use `ThinkingLevel.MINIMAL` so the output budget is not consumed by unbounded reasoning.
- Official compatibility/cost: `gemini-3.6-flash` supports text, image, video, audio and PDF inputs, text output and structured outputs. As of this checkpoint, its Developer API free tier remains free; paid Standard is $0.75/M input and $3.75/M output tokens through 2026-12-31, then $1.50/$7.50 from 2027-01-01, compared with 2.5 Flash's $0.30/$2.50.
- 03.4 adapter evidence: real synthetic REPORT and EPISODE calls through `GeminiEpisodeSummaryAdapter` both passed runtime input/output validation and grounded every returned fact reference to the supplied facts.
- Queue: NOT_RUN with the live provider. The earlier real Redis/worker rehearsal used mock Gemini only and is not promoted to a live pass.
- Hosted persistence/reload: BLOCKED / NOT_RUN because EX-02 remains blocked and hosted `medical_summaries` is absent. No database, Redis, Auth or Storage mutation occurred.
- 03.5 regressions: transport coverage distinguishes abort/network/408/429/5xx transient failures from 400/401/403/404 permanent failures; empty/malformed/schema-invalid/extra-field output fails closed; requests are bounded to one SDK attempt inside the unchanged four-attempt worker ceiling; raw provider errors are not logged by the adapters. Final review also aligned validated API/worker model resolution and constrained Gemini 3 tuning to the verified model.
- Acceptance conclusion: EX-03 passes under its explicit blocked-EX-02 adapter-only branch. This is provider/adapter verification, not queue, hosted-summary or cross-device acceptance.

## Active checkpoint

- Last completed subtask and observed outcome: EX-04 04.1-04.5 independent implementation and targeted checks complete. Confirmed signed-URL schema/refresh, prescription-reclassification UI, readiness/liveness, request-correlation, multipart error, queue-producer recovery and transient screening defects are repaired.
- Files changed / important symbols: shared signed-file/document/job contracts; API request context, health/readiness, Storage health, upload/error and recovery tests; web signed-file refresh, prescription state and logout cache; worker screening tests; `docs/completion/EX-04_LIVE_ACCEPTANCE.md`; progress/review records.
- Verification: full repository lint, typecheck, 352 tests with one explicit opt-in PostgreSQL integration skip, local-opt-in production build, Prisma validation, targeted formatting and `git diff --check` pass.
- Exact next operation / working directory: no EX-04 operation is authorized while the live gate is blocked. On explicit instruction, begin EX-05 from `C:/Users/user/WebstormProjects/MedVault` without promoting EX-04 to VERIFIED.
- Pending command/job/migration: no database migration, hosted write, Redis job, Auth/Storage action or application restart is pending or authorized. The prepared live checklist remains dormant.
- Pending operation state: BLOCKED (hosted writes, actual fresh-session/device acceptance, operational approvals); no command is running.
- Evidence boundary: automated/local checks and current official documentation only; no hosted service call has been made in EX-04.
- Last known good evidence: EX-01 and provider-only EX-03 VERIFIED; EX-02 remains BLOCKED; EX-04 cannot be VERIFIED without its live checklist.
- Detailed evidence links: [completion plan](docs/completion/plan.md#ex-04), [live checklist](docs/completion/EX-04_LIVE_ACCEPTANCE.md), [review](docs/IMPLEMENTATION_REVIEW.md), [product progress](docs/PHASE_PROGRESS.md)

## Evidence ledger

| Date / checkout                          | Scope                             | Result                                                                                                                                                                                                  | Evidence path                                                                                 |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-09-09 / historical dirty b078f39    | Prior implementation              | Historical 263 passes; separate SQL and mock-Gemini/controlled-Auth rehearsal not rerun in EX-01                                                                                                        | docs/IMPLEMENTATION_REVIEW.md                                                                 |
| 2026-09-10 / dirty b078f39               | EX-01 inspection                  | Target medication owned; replacement prescription unchecked; create guard available; PUT omission/null both currently clear link                                                                        | apps/api/src/services/prisma-service.ts; packages/shared/src/index.ts                         |
| 2026-09-10 / dirty b078f39 + EX-01       | Final EX-01 gates                 | PASS: 27 focused; API 81 fresh; aggregate 286 with unchanged packages cached / 1 SQL skip; lint/typecheck/local build/Prisma/format/diff and independent review pass                                    | docs/IMPLEMENTATION_REVIEW.md                                                                 |
| 2026-09-12 to 18 / dirty b078f39 + EX-02 | Application recovery              | PASS in scoped PostgreSQL-only recovery: shared-snapshot dump, allowlisted isolated PG17 restore, 14 count/schema/history comparisons, 22 integrity checks, offline EFS/ACL/page-checksum rescan        | Private recovery tree; docs/completion/ex02 helpers; docs/IMPLEMENTATION_REVIEW.md            |
| 2026-09-18 / dirty b078f39 + EX-02       | Local reconciliation rehearsal    | PASS: truthful capture resolve, additive summary/security deploy, 15-table Data API denial/RLS, 14-table non-owner DML, Prisma summary lifecycle, clean synthetic cleanup and stopped-cluster checksums | Private recovery evidence; `20260919000000_harden_application_database_access`; EX-02 helpers |
| 2026-09-18 / dirty b078f39 + EX-02       | Hosted pre-mutation refresh       | PASS read-only: verified TLS/repeatable read, 14 unchanged relations, one exact migration, schema matches protected backup; security remains unchanged/unsafe                                           | Private encrypted `hosted-readonly-refresh-20260919.json`; no hosted mutation                 |
| 2026-09-19 / dirty b078f39 + EX-03       | Provider configuration 03.1       | PASS sanitized inspection: key configured, model `gemini-2.5-flash`, Developer API + SDK default `v1beta`, no Vertex/custom endpoint; no key/value printed and no provider request issued               | worker/config/adapter source, installed `@google/genai` 2.16.0                                |
| 2026-09-19 / dirty b078f39 + EX-03       | Legacy provider reproduction 03.2 | SDK and direct REST both returned the same model-availability 404 for `gemini-2.5-flash`; credential value and generated content were not printed                                                       | Same-context bounded synthetic probes                                                         |
| 2026-09-19 / dirty b078f39 + EX-03       | Replacement validation 03.3       | SDK and direct REST both returned valid bounded JSON with stable `gemini-3.6-flash`; official multimodal/PDF, structured-output and pricing compatibility recorded                                      | Google model, GenerateContent, thinking and pricing documentation                             |
| 2026-09-19 / dirty b078f39 + EX-03       | Live adapter validation 03.4      | PASS: real synthetic REPORT and EPISODE summary calls; valid runtime shape and only supplied fact references                                                                                            | `GeminiEpisodeSummaryAdapter`; no database/queue/Storage access                               |
| 2026-09-19 / dirty b078f39 + EX-03       | Regressions and final gates 03.5  | PASS: AI 45, API config 15, worker config 16, full aggregate 339 with one opt-in SQL skip; lint, typecheck, build and Prisma validate pass                                                              | AI/API/worker tests and root repository commands                                              |
| 2026-09-20 / dirty b078f39 + EX-04       | Independent 04.1-04.5 work        | PASS: lint, typecheck, 352 tests / one opt-in SQL skip, local-opt-in build, Prisma validation, targeted format and diff checks. No hosted service call or mutation                                      | EX-04 source tests; `docs/completion/EX-04_LIVE_ACCEPTANCE.md`                                |

Current EX-02 evidence: [preflight, recovery gates and conditional reconciliation](docs/completion/EX-02_PREFLIGHT.md). Initial standalone JS lint found an unnecessary regex escape; corrected, final JS lint and 25 tests pass. Repository commands pass; direct repository-project ESLint cannot load these documentation-only scripts outside a TS workspace, so standalone Node/JavaScript recommended rules were used without changing project configuration. New-artifact formatting, evidence hashes/JSON, six runbook local links, secret-pattern scan and diff checks pass. Legacy documentation bodies were preserved, not bulk-formatted.

Full historical A/B/D/E/safety/future finding map: [EX-01 review](docs/IMPLEMENTATION_REVIEW.md#ex-01-execution-review---2026-09-10). EX-01 remains verified.

## Open blockers and dependencies

- G-DB: application backup/restore and local reconciliation rehearsal pass; hosted capture history, hosted `medical_summaries`, hosted Data API/security posture, recoverable EFS-key custody and Auth/Storage recovery disposition remain open.
- G-AI: EX-03 VERIFIED for direct-provider and adapter scope; live-provider queue execution and hosted persistence remain open under later acceptance phases and depend on EX-02
- G-LIVE: hosted/browser/device acceptance absent; EX-04 and EX-05
- G-CLINICAL: Phase 2 rules/source approval not evidenced; EX-05 and EX-10
- G-SAFETY: medication provider/coverage/access not established; EX-10
- Current gate blocking EX-02 hosted mutation: an approved verified cloud recovery point and restore procedure, Auth/Storage recovery disposition, fresh maintenance-window comparison, and reviewed/rehearsed history/additive/security changes. No hosted DDL or history edits yet.
- Required user action for EX-02 only: approve and verify cloud-only recovery without sharing credentials. The operator instead explicitly selected EX-03 and required EX-02 to remain blocked.
- Current independent work: none automatically selected. EX-03 is complete; EX-02 remains blocked.

## Decisions and constraints

- Local web/API/worker; centralized hosted records and private files; existing configured shared Redis and Gemini adapter
- No deployment, reset, queue flush, secret disclosure, automatic commit/push or future features 22-28; EX-02 hosted changes require its verified backup/restore and reconciliation gates
- Preserve existing summaries, episodes, fingerprints, stale-write guards and all inherited changes
- Core backup/reminders remain required in their assigned phases; clinical identity/findings stay unknown without evidence
- 2026-09-10: retain existing full PUT DTO semantics: name required; prescriptionId omitted or null clears link; supplied UUID must be an owned PRESCRIPTION; target-medication 404 takes precedence
- No application services, accounts or restore resources created in EX-01; previous isolated synthetic PostgreSQL is historical test evidence, not an approved hosted-data restore destination
- User approval after the EX-02 preflight: create an encrypted backup and separate PostgreSQL 17 restore instance on this PC. Hosted database remains unchanged until backup/restore verification passes. Do not reuse the old synthetic fixture or broaden this into deployment.

## Checkpoint rules

Update after each completed subtask and before long/consequential work. Record exact next action, changed files, observed results and unknown outcomes. After interruption inspect actual Git/process/database state before repeating work. VERIFIED requires all phase acceptance, not all product acceptance. Keep live/clinical blockers open. Follow [WORKFLOW](docs/completion/WORKFLOW.md) and [RESUME](docs/completion/RESUME.md); keep detailed evidence in the existing review.
