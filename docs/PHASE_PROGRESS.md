# Phase Progress

Tracks high-level requirements, status, decisions, blockers, and exact next steps.

## Execution checkpoint - 2026-09-20 UTC / EX-05 independent work

**EX-05 independent implementation is complete; hosted, browser/device and clinical acceptance remain BLOCKED / NOT RUN.** No hosted PostgreSQL, Auth, Storage or Redis state, environment file, deployment or running application process was changed.

The dashboard now has dedicated latest patient-reviewed value cards, and `/history` provides an owner-scoped per-metric history with clinical-date filters, unknown-date preservation, source ranges, chart/table alternatives and original-report navigation. The strict response reports its 200-source bound; a metric filter is applied at the database relation before that bound. Unknown clinical dates never become “latest.” Existing deterministic report-group ordering now applies the 12-group limit only after winner selection and total ordering.

Versioned MedlinePlus-backed general explanations render beside latest/history data and completed grounded summaries. Unknown terms say they are unmapped. Gemini still receives only reviewed fact-selection input and cannot author the explanations. Summary prompt/config versions and the fingerprint snapshot include the terminology and disabled-attention versions so older results become stale under the new contract.

The attention boundary validates the inputs a future rule set would need but returns only `CANNOT_ASSESS`, reports zero supported metrics and keeps automated urgency disabled. Its MedlinePlus provenance is informational, not a threshold rule or clinical approval. Current comparison structures correctly separate supplied laboratory/method/specimen context and treat unknown context as uncertain, but persistence supplies only laboratory. A reviewed additive method/specimen migration remains gated behind EX-02; no values were guessed or backfilled.

Repository gates pass: lint 11/11, typecheck 11/11, 364 tests with the single opt-in PostgreSQL integration test skipped, production-mode local-architecture build 7/7, Prisma validation, targeted formatting and `git diff --check`. Static/rendered tests cover the new route contract, owner-scoping, reversed date rejection, mapped/unmapped explanations, zero-coverage attention boundary, unknown-date latest exclusion, source links/ranges and summary rendering. These checks do not substitute for a real browser, worker restart or hosted queue/provider/write/reload lifecycle.

EX-05 remains BLOCKED because the real hosted individual/episode lifecycle, active-job stale correction, cache reuse after restart, actual keyboard/touch browser pass and second-device/session pass were not authorized while EX-02 is blocked. Clinical rules remain a separate EX-10 dependency. See [EX-05 acceptance and deferred live checklist](completion/EX-05_ACCEPTANCE.md).

## Execution checkpoint - 2026-09-20 UTC / EX-04 independent work

**EX-04 independent implementation is complete; live acceptance remains BLOCKED / NOT RUN.** No
hosted PostgreSQL, Auth, Storage, Redis, environment, deployment, or application-process state was
changed. The operator's deferred recovery decision keeps EX-02 blocked, so EX-04 cannot create the
synthetic hosted state required for its real-service and Mac-to-Windows checks.

| Boundary                  | Automated/local result                                                                                                                                                                                        | Required live result                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh sessions / devices  | Per-layout private query caches remain isolated; logout clears the active cache; server-side token verification remains the authority.                                                                        | Real Supabase Auth login/logout/reload/restart and actual Mac/Windows comparison are NOT_RUN.                                          |
| Screening                 | Classification-before-extraction, readable, unrelated, unreadable, unsupported, prescription, category mismatch, and transient checker outage paths pass.                                                     | Actual Storage → queue → worker → Gemini cases are NOT_RUN.                                                                            |
| Ownership / private files | Owner-scoped API tests deny foreign reads, signed URLs, verify, retry and delete. Signed-file DTOs now include their lifetime, use `private, no-store`, and refresh before expiry.                            | Two-account hosted denial and database/object consistency are NOT_RUN.                                                                 |
| Queue recovery            | Upload producer failure, duplicate claim, current-version/stale protection, retries, attempt ceiling, timeout and reconciliation have automated coverage.                                                     | Isolated real BullMQ producer failure and worker stop/restart are NOT_RUN.                                                             |
| Operations                | `/health` is liveness only; `/ready` checks PostgreSQL, Redis and private Storage. Request IDs are bounded and consistent across safe errors, rate limiting and report jobs; multipart errors are normalized. | Live readiness, expiry/logout, logging, monitoring, retention/audit and privacy approval evidence is NOT_RUN or operationally blocked. |

Confirmed repairs include the strict shared signed-file response mismatch, unreachable UI state after a
report is reclassified as a prescription, misleading readiness behavior/copy, unbounded raw client
correlation IDs, missing request IDs on 429 responses, unsafe 500 handling for non-size Multer errors,
and missing private-query-cache clearing on logout. API readiness checks the configured bucket exists
and is private without writing to it.

Targeted checks pass: shared 47, API 96, worker 47, web 18, plus affected-package typechecks. Full
repository lint, typecheck, 352 tests with one explicit opt-in PostgreSQL integration skip, a
local-opt-in production build, Prisma validation, targeted formatting, and `git diff --check` pass.
The exact dormant live procedure is
[EX-04 Live Acceptance Checklist](completion/EX-04_LIVE_ACCEPTANCE.md). EX-04 must remain BLOCKED
until that checklist has dated hosted and actual Mac/Windows evidence.

## Execution checkpoint - 2026-09-19 UTC / EX-03

**EX-03 VERIFIED within provider-only scope; EX-02 remains BLOCKED and no hosted database mutation occurred.** The same credential/backend context reproduced the legacy `gemini-2.5-flash` 404 through both the SDK and direct Developer API. The provider identified credential-cohort/model availability as the cause. Stable `gemini-3.6-flash` then passed bounded replacement checks without key rotation, backend replacement, custom endpoint or provider change.

| Boundary                                  | Result            | Evidence limit                                                                          |
| ----------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Direct API / minimal SDK                  | PASS              | Same credential, Developer API and `v1beta`; synthetic data only                        |
| Existing summary adapter                  | PASS              | Real REPORT and EPISODE responses passed runtime shape and grounded-source validation   |
| Real queue / worker with live provider    | NOT_RUN           | Earlier Redis/worker rehearsal used mock Gemini and is not promoted to a live pass      |
| Hosted summary persistence / fresh reload | BLOCKED / NOT_RUN | EX-02 remains blocked; `medical_summaries` is absent and no hosted write was authorized |

The replacement is officially stable and supports text/image/video/audio/PDF inputs and structured output. The shared default and active non-secret model selector now use `gemini-3.6-flash`; the adapter explicitly selects the Developer API `v1beta` endpoint, uses Gemini 3 minimal thinking, caps each request at 45 seconds, and permits one SDK attempt inside the existing four-attempt worker ceiling. Classification now validates strict provider output and all adapters map network/408/429/5xx failures as transient while treating 400/401/403/404 as permanent without logging raw upstream error objects.

Focused AI tests pass 45/45, API configuration tests pass 15/15 and worker configuration tests pass 16/16. Repository lint, typecheck, build and Prisma validation pass; the aggregate suite passes 339 tests with one opt-in SQL integration test skipped. Live synthetic REPORT and EPISODE adapter calls both returned runtime-valid summaries using only supplied fact IDs. No credential, prompt, generated response body or credential-bearing URL was printed; the safe provider model-availability error was retained as diagnostic evidence.

Current Developer API pricing as of this checkpoint: the `gemini-3.6-flash` free tier remains free; Standard paid rates are $0.75/M input and $3.75/M output tokens through 2026-12-31, then $1.50/$7.50 from 2027-01-01. The prior 2.5 Flash rates were $0.30/$2.50. See the official [model specification](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash) and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

EX-03's blocked-EX-02 branch permits adapter-only proof, so this phase is verified without implying queue, hosted-persistence or cross-device acceptance. EX-04 was not started automatically.

## Execution checkpoint - 2026-09-19 UTC / EX-02.4 read-only

**Maintenance-window snapshot PASS; hosted migration/cutover NOT PERFORMED.** The operator reported both computers stopped, and this Windows host had no listeners on ports 3000, 4000 or 55441. A verified-TLS repeatable-read transaction found the same 14 hosted public relations, one exact initial migration and unchanged protected schema/history. Application and non-orphan external integrity failures are zero; no database documents lack Storage metadata, no patient mappings lack Auth users, and three existing Storage orphan candidates remain untouched.

Hosted security is still unsafe and unchanged: zero relations have RLS, 42 inspected Data API role/table privilege records remain broad, and neither `medical_summaries` nor `medvault_runtime` exists. The bucket remains private. No hosted write occurred.

The operator declined both local and cloud backup requirements. Existing local recovery evidence was not deleted, but it is not an approved rollback gate. EX-02 is therefore **BLOCKED** before hosted resolve/deploy/security DDL. The only route to resume that mutation sequence is an approved, verified cloud recovery point and restore procedure followed by another current write-window snapshot. EX-03 does not start automatically.

## Execution checkpoint - 2026-09-18 UTC / EX-02.3

**Local reconciliation/security rehearsal PASS; EX-02 remains IN_PROGRESS and hosted migration/cutover was not performed.** On the protected loopback PostgreSQL 17 restore, the truthful capture resolution preserved every original count, relationship aggregate and schema definition. Prisma then applied the additive summary migration and new access-hardening migration. Four exact local history records are current.

The local result has 15 RLS-enabled application/history tables, no permissive policies, no effective table/column access for anon/authenticated/service_role, a disabled dedicated runtime role with exact DML on 14 application tables, and five working invalidation triggers. Raw SQL and fresh Prisma clients proved create/reload/update/delete, summary request/claim/complete, stale invalidation and cleanup. No synthetic rows remain. After stop, 1,626 database files / 6,679 blocks had zero bad checksums; the encrypted recovery tree has no unencrypted entries, reparse points or listener.

Prisma CLI now supports a distinct process-only `MIGRATION_DATABASE_URL` for the migration owner while API/worker share least-privilege `DATABASE_URL`. Prisma rejects a nonblank migration override in shared environment files, API/worker reject an inherited `MIGRATION_DATABASE_URL` before resource initialization, and the hosted metadata helper requires a separate process-only source variable. Repository lint/typecheck, 299 tests / one opt-in SQL skip, Prisma validation, targeted checks and the production build with a process-only HTTPS placeholder pass.

A fresh read-only hosted refresh over verified TLS confirms the schema/history still match the protected backup: 14 relations and one initial migration. Hosted state remains unsafe: `medical_summaries` and the runtime role are absent, RLS is off, and broad Data API grants remain. 02.4 mutation cannot begin until the user privately exports the EFS recovery certificate, stores the PFX off-device and confirms custody without disclosing the password/path. Auth/Storage recovery disposition and a controlled maintenance-window baseline also remain open. See [current review](IMPLEMENTATION_REVIEW.md#ex-02-reconciliation-rehearsal-checkpoint---2026-09-18-utc), [gated runbook](completion/EX-02_PREFLIGHT.md) and [current cursor](../track.md).

The EX-02.2 checkpoint below is retained as pre-reconciliation history.

## Execution checkpoint - 2026-09-18 UTC / EX-02.2

**Application PostgreSQL recovery PASS; EX-02 remains IN_PROGRESS and hosted migration/cutover was not performed.** A protected PostgreSQL 17 shared-snapshot dump was restored to a new loopback-only PostgreSQL 17 database. All 14 row counts, 22 application integrity aggregates, semantic migration history and the captured schema inventory match. After stop, repeated offline checks found zero bad page checksums, zero unencrypted files/directories, zero reparse points and no listener. The first stale encryption-count record is retained and narrowly superseded by the corrective rescan.

This is not full Supabase disaster recovery: Auth accounts/configuration, Storage object bytes, role passwords and Redis are excluded. Local role aliases/ownership mapping do not prove production least privilege; Windows/hosted collation equivalence and application integration are unverified. EFS recovery-key export and confirmed off-device custody remain a user action and block hosted mutation.

Next: complete 02.3 review/rehearsal of truthful capture-history resolution, the additive summary migration and the full Data API/runtime-role security change against the stopped restore. Hosted history still has only the initial migration, `medical_summaries` is absent, and current public-table RLS/grants remain unsafe. See [current EX-02 review](IMPLEMENTATION_REVIEW.md#ex-02-application-recovery-checkpoint---2026-09-18-utc), [gated runbook](completion/EX-02_PREFLIGHT.md) and [current cursor](../track.md).

The September 10 checkpoint below is retained as superseded pre-recovery history.

## Execution checkpoint - 2026-09-10 UTC / EX-02

**EX-02 BLOCKED, migration/cutover NOT PERFORMED.** Read-only 02.1 comparison completed: initial + capture definitions match the current metadata snapshot, but only initial history exists and `medical_summaries` is absent. The matching definitions support a conditional reconciliation plan, not permission to resolve history or deploy.

Fresh hosted findings: 6 patients, 5 profiles, 7 documents, 2 extractions and 1 episode; other application tables have zero rows. Relationship checks pass. Seven document paths match private Storage metadata; three orphan candidates were preserved. All current public tables still have broad Data API grants with RLS disabled, and anonymous HEAD access succeeds. No actual authenticated Data API denial or least-privilege runtime test has passed.

No protected backup or isolated restore target has been approved/verified. Verified TLS probes also fail certificate-chain validation; obtain the project CA from the trusted Dashboard. No export, restore, hosted DDL, environment edit, queue/Storage mutation or application restart occurred. See [EX-02 review](IMPLEMENTATION_REVIEW.md#ex-02-execution-review---2026-09-10-utc), [gated runbook](completion/EX-02_PREFLIGHT.md) and [current cursor](../track.md).

Local evidence: 25 new offline comparison regressions pass, independently rerun; repository lint/typecheck/test/build/Prisma validation pass with unchanged Turbo results reused (286 test passes and one SQL skip; 16 Web tests fresh). This does not satisfy live/backup/security acceptance. Resume 02.2 after protected-resource and certificate prerequisites. EX-03 provider-only diagnosis may be explicitly selected independently; EX-03 was not started. Historical checkpoints below remain history, not the current phase cursor.

## Execution checkpoint - 2026-09-10 / EX-01

The ten execution batches are tracked separately from product Phases 1-3 in [root track.md](../track.md), using [the supplied playbook plan](completion/plan.md). EX-01 closes the medication edit prescription-ownership gap without a schema rewrite; create and update now share the owned-PRESCRIPTION check. Existing PUT null/omission behavior, owner-scoped 404s and create behavior are preserved. New tests prove rejection without medication writes.

Verification: 23 new medication tests; 27 focused/nearby tests pass; repository lint, typecheck, tests (aggregate 286 passes, one opt-in SQL skip), local-opt-in build and Prisma validation pass. Changed API checks ran; unchanged package results were reused from Turbo cache. Independent candidate review found no concrete bypass/regression and reran the 23 tests successfully. See [the EX-01 review and finding map](IMPLEMENTATION_REVIEW.md#ex-01-execution-review---2026-09-10) for commands, initial failures corrected, scope and evidence limits.

No hosted migration, backup/restore, environment edit, deployment, live provider call or application restart was performed. EX-02 is the next phase, after this phase's review boundary; EX-02 through EX-10 remain NOT_STARTED. Historical hosted/Gemini/clinical/device gates below remain open and require their assigned phases. This checkpoint does not mark any whole product phase or production readiness complete.

## Status Summary

- **Phase 1 (Gaps):** Historically marked Completed; not re-certified by this Phase 2 task
- **Phase 2 (Trends/AI):** Implemented with automated/rehearsal evidence; INCOMPLETE hosted acceptance
- **Phase 3 (Medications):** Existing schema/CRUD preserved; no new UI/reminder work started

## Current Blocker / Next Action

- **Blockers:** Hosted unmanaged migration history, missing `medical_summaries` and unsafe grants/RLS remain; the operator declined an approved backup/recovery gate; Auth/Storage recovery disposition is open; live-provider queue/hosted persistence is not run; hosted browser/fresh-session acceptance is not run; clinical urgency rules are unavailable. The former Gemini model 404 is resolved within EX-03's direct/adapter scope.
- **Next action:** Do not touch hosted history or run the real persistence flow while EX-02 is blocked. EX-04 may begin only when its live dependencies are available and the user explicitly selects it.

## Current acceptance checkpoint — 2026-09-09

The dated checkpoint below preserves the pre-EX-03 provider failure; the EX-03 checkpoint above is the current provider status.

The implementation is not certified for real medical-data use. No hosted migrations, environment-file edits, deployments, commits, real-account creations, or upload deletions were performed during this task. Medication schema/CRUD and earlier dirty changes remain. The original SRS and prior documentation phases were not rewritten.

| ID    | Implementation / correction                                                                                                                                                                 | Automated evidence                                                                       | Real-service evidence                                                                                                       | Remaining acceptance / blocker                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| P2-01 | Implemented: exact aliases, analyte-specific conversions, reviewed-only sources, clinical chronology, qualified comparability, bounded/qualitative preservation, duplicate-import exclusion | 87 medical tests; runtime source schemas                                                 | Synthetic real PostgreSQL + API: out-of-order CBC uploads over 11 days produce clinical order                               | Actual hosted account workflow not run; lab context is limited by stored source metadata                                      |
| P2-02 | Implemented: create/edit title/dates, multiple membership selection/removal, filters, source links                                                                                          | API ownership tests; shared input/DTO validation                                         | Rehearsal creates, edits, adds/removes reports and reloads using a fresh API/DB connection                                  | Real Auth browser sessions and cross-device persistence unverified                                                            |
| P2-03 | Implemented: elapsed-time SVG, range equivalence/all-known rule, explicit unknowns, source-specific flags, table alternative, keyboard controls                                             | 9 rendered web cases; helper fixtures cover chronology/ranges                            | No interactive browser acceptance claimed                                                                                   | Touch/keyboard interaction and full browser state transitions still need exercise                                             |
| P2-04 | Implemented: direct report summary GET/POST, shared store/queue/worker, cached reload and stale correction handling                                                                         | Store + worker + API tests                                                               | Real Redis → worker → synthetic PostgreSQL → fresh API passes with MOCK Gemini                                              | Hosted summary table absent; live Gemini generation 404                                                                       |
| P2-05 | Implemented: episode summary with bounded fact-reference selection and deterministic application-rendered facts                                                                             | Invented IDs/numbers/units/prose rejected by shared, adapter, store and worker tests     | Second real Redis job completes and reloads with MOCK Gemini                                                                | No live Gemini success; no hosted summary persistence                                                                         |
| P2-06 | Implemented: owned scopes, membership array ownership, job/schema/DTO validation; prepared deny-browser grants/RLS                                                                          | API IDOR/duplicate-ID tests; malformed API/AI tests                                      | Synthetic PostgreSQL confirms `anon`/`authenticated` denial on four affected tables; actual source grants still unsafe      | Approved security migration not applied; browser/Data API posture and least privilege require hosted verification             |
| P2-07 | Implemented: full reviewed snapshot fingerprint, config/model versions, patient-row lock, invalidation triggers, generation/token guarded completion                                        | 12 store tests and worker controlled-race test                                           | Real PostgreSQL correction race discards old output; trigger blocks behind publication lock; membership removal marks stale | Trigger behavior verified on PostgreSQL 18.6 fixture, not hosted PostgreSQL 17.6; migration required                          |
| P2-08 | Implemented: shared queue job contract, four-attempt ceiling, 75s claim lease, cooldown/recovery, bounded read-only polling                                                                 | Duplicate claim, provider failure, write failure, expired lease and stranded queue tests | Configured Redis PONG; two isolated real BullMQ jobs complete; exactly two mock provider executions                         | No live worker crash/restart acceptance or provider completion; operator/user retries remain necessary for stranded summaries |
| P2-09 | Implemented honest boundary: source annotations and `CANNOT_ASSESS`; clinical urgency automation DISABLED                                                                                   | Grounding validation prevents fabricated advice; rendered states                         | No clinical rule integration or clinical validation                                                                         | BLOCKED subfeature: approved context/population/unit/source/version-specific clinical rules                                   |
| P2-10 | Audit/review, tests, rehearsal and handoff documented                                                                                                                                       | Lint/typecheck/test/build and Prisma validation pass; see command ledger                 | Metadata, Redis, synthetic DB/API/queue checks performed                                                                    | Full hosted Auth/Storage/Gemini/browser acceptance remains incomplete                                                         |

### Verified environment and migration facts

- API and worker resolve identical root-environment database and Redis URLs, Supabase project and bucket. Default BullMQ prefix is `bull`; summary queue is `episode-summary`, job `summarize-reviewed-sources`. Redis DB is 0. This checks configuration, not an already-running process's environment.
- Hosted database: Supabase session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, database `postgres`, schema `public`, PostgreSQL 17.6. Root `.env.local` remains absent. No credential-bearing URL is recorded.
- `_prisma_migrations` records only `20260807000000_initial`, completed and not rolled back. Two repository migrations are pending. Existing episode/medication tables must be reconciled, not recreated. `medical_summaries` is absent.
- Gemini: configured `gemini-2.5-flash`; SDK generation and direct REST generation returned HTTP 404. Model listing succeeds and still advertises that model. The exact provider/access inconsistency is unresolved; do not infer that the key is invalid or silently substitute a model.

### Test checkpoint

- Repository: **263 tests pass**, one explicit PostgreSQL integration test is skipped by default; that test was separately enabled and **passed** on an isolated synthetic PostgreSQL 18.6 database.
- Connected rehearsal: real Express service, real Redis/BullMQ producer and worker, real synthetic PostgreSQL, **mock Gemini and controlled authentication**; report and episode summaries complete, reload, reuse cache and reject another identity. Not a hosted or Mac-to-Windows test.
- The real-service rehearsal script is `apps/api/scripts/phase2-rehearsal.mjs`. It refuses a non-fixture database, requires explicit test URLs, uses a new random Redis prefix and removes only its two known non-active jobs. No real Storage bytes are created or accessed.
- Windows fixture creation initially failed due to process termination/recovery timing. After checking the server-ready log, the test passed. The fixture is not the application database, a migration source, or a rollback target. See the review for its location and stop instructions.
- Full build initially correctly rejected a localhost production endpoint; the passing local-application build uses process-only `NEXT_PUBLIC_ALLOW_LOCAL_API=true` without weakening production validation.

Exact commands, file review, operator gates and resume procedure are in [IMPLEMENTATION_REVIEW.md](IMPLEMENTATION_REVIEW.md).

## Historical initial audit — 2026-09-08 (superseded by checkpoint above)

Baseline: `b078f39` with 24 modified tracked files and pre-existing untracked episode UI/worker files. Preserve those changes and medication models/CRUD. No deployment, reset, queue flush, upload deletion, commit, or push is authorized.

Read-only hosted inspection: session pooler reachable. Only `20260807000000_initial` is recorded in `_prisma_migrations`; episode and medication tables already exist outside that recorded history. Episode tables have RLS disabled and broad `anon`/`authenticated` grants. Do not blindly apply a development migration or claim migration parity. Reconciliation of this unmanaged schema is an operational gate. No PHI was queried.

| ID    | Existing evidence and observed gap                                                                                          | Implementation   | Automated evidence           | Live evidence                     | Files / next step                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------- | --------------------------------- | ---------------------------------------------------- |
| P2-01 | Medical helpers exist; generic conversion factors, unconverted grouped units and ignored context are confirmed defects      | In progress      | Existing tests not yet rerun | Not run                           | medical/shared contracts and server trend builder    |
| P2-02 | Episode CRUD exists; UI editing/membership and date validation incomplete                                                   | Pending          | Not run                      | Tables confirmed only             | API service and episode UI                           |
| P2-03 | SVG uses elapsed time; filters missing ranges before selecting band, local-time formatting and color-only flags are defects | Pending          | Not run                      | Not run                           | chart/table rendered tests                           |
| P2-04 | Individual summary workflow missing                                                                                         | Pending          | Not run                      | Not run                           | report API/worker/persistence/UI                     |
| P2-05 | Episode AI accepts arbitrary text and lacks factual grounding                                                               | Pending          | Not run                      | Not run                           | bounded structured adapter                           |
| P2-06 | Ownership checks exist on API; worker payloads and DTOs use unchecked assertions                                            | Pending          | Not run                      | Broad hosted grants confirmed     | shared Zod, ownership tests, security migration gate |
| P2-07 | Fingerprint is only document IDs/update times; ignored claim result and unguarded completion allow stale writes             | Pending          | Not run                      | Not run                           | revision-safe shared summary repository              |
| P2-08 | PENDING/QUEUED mismatch, invalid custom job-ID delimiter, wrong polling endpoint and ignored query result                   | Pending          | Not run                      | Not run                           | shared queue contract and summary panel              |
| P2-09 | No documented clinically validated urgency rules                                                                            | Pending boundary | Not run                      | Clinical rules blocked            | explicit cannot-assess UI, no automated urgency      |
| P2-10 | Prior web-build claim is not full acceptance                                                                                | In progress      | Final suites pending         | Synthetic E2E pending schema gate | update this file and implementation review           |

Completion remains **INCOMPLETE** until code and evidence gates are satisfied. Clinical urgency automation may remain explicitly unavailable, but must not be represented as implemented.
