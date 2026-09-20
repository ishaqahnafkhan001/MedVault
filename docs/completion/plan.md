# MedVault completion plan

Plan ID: MV-COMPLETE-2026-09-10-v1

Immutable execution scope transcribed from the user-supplied `MedVault_10_Phase_Completion_Playbook.pdf`, dated 2026-09-10, pages 4-13. PDF SHA-256: `4f722feb13e6831f4f670a65bcc240b860abe2b49919a7e3067d1c64aa4d4fb2`. The matching prompt-pack archive was not supplied; this text preserves the supplied PDF prompts. PDF wrapping is retained inside text blocks. Update execution state in root `track.md`, not in this plan.

Source findings refer to `MedVault_Incomplete_Work_Report.pdf`, dated 2026-09-09. They are historical until rechecked. EX-01 through EX-10 are execution batches within product Phases 1-3, not replacements for those product labels. Work one phase at a time and stop at its boundary for review. Do not automatically start the next phase.

## EX-01

```text
START OF PROMPT EX-01
EX-01 - Establish continuity and close the
edit-ownership gap
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: D-03; report pp. 1, 4, 7
Dependencies: None. This is the starting phase.
Goal: Create a trustworthy working checkpoint and repair the narrow authorization gap immediately,
without a schema rewrite.
01.1 - Read the actual repository instructions, current branch/HEAD, Git status/diff, package scripts,
docs/PHASE_PROGRESS.md and docs/IMPLEMENTATION_REVIEW.md. Map existing evidence once. Record
the report date and the current checkout; do not rescan every source file or rerun all tests just to initialize
tracking.
01.2 - Create or merge root track.md using the supplied template. Preserve existing progress documents as
detailed evidence; track.md is the compact execution cursor. Record the ten execution phases separately
from product Phases 1-3. Save the immutable prompt plan under docs/completion/ when supplied.
01.3 - Inspect updateMedication and its create equivalent. For a supplied replacement prescriptionId, verify
the linked document belongs to the authenticated patient and has the permitted prescription type. Handle
omitted versus null according to the actual DTO contract. Reject foreign/missing/wrong-type IDs without
changing the medication or link; never trust client ownership.
01.4 - Add targeted API/service regression tests for valid replacement, foreign prescription,
report-as-prescription, missing ID, and a rejected update leaving data unchanged. Inspect nearby
link-update paths for the same concrete bug only. Record any pre-existing failures separately.
01.5 - Seed the report finding-to-phase map and mark all unexecuted phases NOT_STARTED. Carry forward
old test results as historical, not newly passed. Record any existing authorized resources/approvals without
inventing approval requirements.
Acceptance checks
Affected ownership tests and package typecheck pass, or the exact pre-existing failure is recorded.
track.md identifies EX-02 as the next phase, with the source report, branch, evidence and precise
next action.
Finish after the authorization correction and durable tracker exist. No hosted migration or broad medication
implementation belongs here.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-01
```

## EX-02

```text
START OF PROMPT EX-02
EX-02 - Protect hosted data and reconcile schema
history
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: A-05, B-01; report pp. 2-3, 7
Dependencies: EX-01. Hosted mutation additionally requires a verified protected backup and usable
rollback/restore evidence.
Goal: Make the hosted schema and Prisma history consistent without losing existing records or blindly
replaying migrations.
02.1 - Read the schema, every relevant migration SQL file and actual hosted migration metadata. Inventory
columns, constraints, indexes, counts and relationships using metadata/aggregate queries. Recheck
whether medical_summaries is absent and episode/medication tables exist outside the recorded history.
Compare migration SQL with real definitions, not names alone.
02.2 - Use authorized protected backup and isolated restore resources. Document database/Auth/Storage
coverage separately; a SQL dump alone does not back up file objects. Validate backup integrity and
actually restore the relevant scope in isolation, checking counts and relationships. Keep secrets and
medical backups outside Git, chat logs and the prompt bundle.
02.3 - Prepare an exact reconciliation plan with SQL differences, expected effects, rollback conditions and
verification queries. Use current Prisma/Supabase documentation and existing migration ownership. Never
mark a migration applied merely because a similarly named table exists; do not use reset, forced db push
or edited historical SQL to hide drift.
02.4 - After backup/restore and applicable authorization are established, reconcile only verified existing
changes and apply the necessary reviewed additive migration through the repository workflow. If access, a
restore destination or a consequential decision is missing, prepare the concrete commands/plan and
checkpoint before mutation; do not repeatedly request already-granted permission.
02.5 - Verify resulting migration status, summary persistence schema, counts, foreign keys and
preservation of existing medication tables. Inspect actual grants, RLS, exposed views/functions and the
runtime database role. Prove anon/authenticated Data API isolation independently of Express tests; scope
policies to the actual access model and keep private Storage private.
Acceptance checks
Dated backup and isolated restoration evidence match their documented scope.
Hosted schema/history and required summary writes agree; pre-existing records and relationships
remain intact.
Authorization checks cover both application access and exposed database access.
If restoration or reconciliation is blocked, record the exact gate. Synthetic code work may continue in a
later explicitly chosen phase, but hosted schema acceptance cannot be marked passed.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-02
```

## EX-03

```text
START OF PROMPT EX-03
EX-03 - Diagnose Gemini 404 and prove real
generation
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: B-02; report p. 3
Dependencies: EX-01. Provider diagnosis can proceed while EX-02 is blocked; hosted summary persistence
requires EX-02.
Goal: Identify the real provider failure and establish a verified generation configuration without guessing or
replacing the architecture.
03.1 - Inspect the running worker environment loader, installed SDK, adapter, model resource, API
version/base URL and selected Google backend. Compare the values actually used by the process with the
intended configuration using sanitized diagnostics. Do not print keys, tokens or key-bearing request URLs.
03.2 - Reproduce one minimal synthetic generation request. Compare SDK and direct API behavior using
current official documentation. Verify the model supports the requested generation method for the same
API/backend/project/credential context. Successful model listing or a 404 alone does not establish a bad
key or valid generation access.
03.3 - Investigate the evidenced causes: model identifier/version, endpoint/backend mismatch, request
method, project/access restrictions and relevant provider response details. Repair the established cause.
Do not blindly rotate keys, change models or introduce another provider. If replacement is necessary,
document the supported alternative, compatibility and cost impact; obtain only approvals actually required
for that change.
03.4 - Run a real synthetic single-report summary and an episode summary through the existing adapter.
Check runtime schema and grounded-source validation. If EX-02 passed, persist and reload them through
the real queue/repository. Otherwise label the result adapter-only and leave hosted acceptance pending.
03.5 - Add regression coverage for the actual fix and clear timeout/rate-limit/invalid-output/non-retryable
configuration errors. Keep retry counts bounded. Explain why the cause is established and which checks
still need the browser or hosted database.
Acceptance checks
A real provider generation response passes source/shape validation; model listing alone is
insufficient.
Recorded evidence distinguishes direct API, adapter, queue and hosted persistence checks.
No mock response is presented as a live pass and no secret appears in logs.
Record the working model/backend/configuration names without secret values. Continue to EX-04 only
when its live dependencies are available; otherwise retain the blocker.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-03
```

## EX-04

```text
START OF PROMPT EX-04
EX-04 - Close Phase 1 hosted and cross-device
acceptance
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: A-01 to A-04, A-06; report p. 2
Dependencies: EX-02 for hosted schema/security and EX-03 for real AI. Independent browser/persistence
checks may run earlier if their dependencies are ready.
Goal: Verify the existing foundation with real services and repair only defects exposed by those checks.
04.1 - Use synthetic patients/reports and authorized real authentication. Verify identical patient mapping,
profile, document list and reviewed values across fresh sessions. Exercise logout/login, refresh and service
restart. Ask for actual Mac/Windows checks only if those devices are inaccessible; record an exact checklist
and leave the real-device result unverified.
04.2 - Run readable report, prescription, unrelated, unreadable/uncertain and unsupported-file cases
through the actual screening path. Prove screening precedes extraction. Prescriptions remain storage-only
apart from type screening. A checker outage is a retryable technical failure; rejection/readability messages
must explain the next action without claiming authenticity verification.
04.3 - Verify metadata-to-private-object consistency, authorized preview/download and second-account
denial for reads, verification, retry, deletion and linked IDs. Use synthetic owned test objects and preserve
unrelated uploads. Never publish medical content or signed URLs as test evidence.
04.4 - Exercise producer failure, worker stop/restart, duplicate delivery, timeout and reconciliation with
isolated test jobs. Compare BullMQ, PostgreSQL, API and browser states; reject false success and stale
overwrites. Do not stop other users' workers or flush a shared queue.
04.5 - Recheck environment alignment, health/readiness, safe errors/logs, session expiry/logout/cache
handling and applicable existing retention/audit/provider-privacy requirements. Reuse current plans;
identify the operations and approvals actually evidenced versus still pending. Use synthetic data while
patient-data approvals remain unresolved.
Acceptance checks
Dated hosted evidence covers persistence, screening, isolation and recovery.
Every confirmed defect is fixed and its targeted regression check passes.
Fresh-session evidence and actual cross-device evidence are separately labeled.
Do not claim Phase 1 live acceptance while a required real-service/device check remains missing. Save the
smallest outstanding manual action and continue only independent authorized work.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-04
```

## EX-05

```text
START OF PROMPT EX-05
EX-05 - Finish Phase 2 features and hosted
acceptance
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: B-03 to B-06; report p. 3
Dependencies: EX-02 and EX-03 for hosted summaries; EX-04 for shared foundation acceptance.
Independent UI/domain work need not wait on provider access.
Goal: Complete the actual remaining health-intelligence gaps while preserving existing summary routes
and concurrency protections.
05.1 - Inspect and reuse individual/episode summary routes, editing/membership, grounded fact validation,
inputFingerprint and stale-write guards. Check the existing source-range handling and runtime validators;
do not assume the earlier walkthrough defects remain. Add dedicated per-metric latest-value cards and a
test-history workflow with clinical-date filters, original-report navigation and source-specific ranges.
05.2 - Add a sourced plain-English terminology/explanation layer alongside validated deterministic findings.
Version its source mappings and display uncertainty. If Gemini renders explanatory text, constrain and
validate source references and numerical facts. Do not weaken existing fact validation or invent diagnoses
just to produce more fluent text.
05.3 - Inspect method/specimen provenance. Persist supplied context through extraction, DTOs and
comparison only where supported; leave existing unknown values unknown. Use reviewed additive
migrations after EX-02. Incorporate relevant context/version changes in cache validity; matching analyte
names/units alone cannot establish comparability.
05.4 - Implement a reusable attention-rule boundary with documented inputs, provenance, coverage and
cannot-assess results. Add supported source fixtures. Keep automated urgency disabled without applicable
validated rules/clinical approval. This specific clinical dependency may remain blocked; do not call a
placeholder a completed clinical integration.
05.5 - Run real hosted individual and episode summary lifecycles: request, queue, provider, validated write,
API reload and browser display. Correct a value/change membership during an active job; prove stale
output cannot become current. Verify caching avoids duplicate calls and invalidates when the actual input
changes.
05.6 - Exercise touch/keyboard/table access, source links, missing ranges/dates, empty/one-point/constant
series, delayed polling, failure/retry, fresh-account cache isolation and real worker restart. Add focused
regression tests and record actual browser evidence.
Acceptance checks
Expanded history/cards and explanations are usable; existing Phase 2 functions remain intact.
Hosted/browser lifecycle and stale-result checks have evidence, or exact external blockers remain
recorded.
Clinical-rule readiness is separate from ordinary numerical comparison and software test results.
Close product Phase 2 only for requirements actually evidenced. Leave unresolved clinical/device/provider
acceptance explicitly blocked and carry it into EX-10.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-05
```

## EX-06

```text
START OF PROMPT EX-06
EX-06 - Complete medication domain, validation
and history
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: D-02 to D-06; report p. 4
Dependencies: EX-01 ownership correction and EX-02 before applying hosted schema changes. This phase
does not require Gemini.
Goal: Make the medication API a reliable basis for the UI and scheduling phases before exposing new
workflows.
06.1 - Inspect existing Medication, MedicationSchedule, ScheduleOccurrence, IntakeLog and
ReminderDelivery models/DTOs/API methods. Preserve their data. Define supported regimens and separate
strength, dose amount/unit and administration quantity. Add AFTER_MEAL handling and preserve original
patient-entered clinician instructions without computing a new prescription.
06.2 - Distinguish explicit daily clock times from elapsed intervals such as every eight hours;
three-times-daily is not an automatic eight-hour interval. Require an interval anchor/context where needed.
Keep as-needed medicines free of invented recurring schedules. Validate real HH:mm limits, IANA
timezones, start/end ordering, dose/quantity values and unsupported combinations before persistence.
06.3 - Implement versioned edits and status/schedule history so prior occurrences keep their original
meaning. Define effective-time semantics for edits. Pause/stop/archive must supersede future occurrences
and mark relevant jobs obsolete; use execution-time version checks when EX-08 adds delivery. Do not
erase historical intake or imply medical advice to discontinue treatment.
06.4 - Recheck EX-01 ownership validation on medication create/update, prescriptions, schedules and
intake-linked IDs. Preserve entered medicine names as unresolved unless a supported source establishes
identity. Define a resolver boundary for EX-10 without guessing ingredients or adding a paid integration
here.
06.5 - Add paginated/filtered list API behavior and complete necessary CRUD/status responses with runtime
validation and transactional consistency. Prepare minimal additive migrations through the reconciled
workflow. Document the actual DTO/endpoint/version contracts in the existing review so EX-07 and EX-08
reuse them.
Acceptance checks
Invalid times/timezones/dates/regimens and foreign prescriptions are rejected without partial writes.
Edits/status transitions preserve history and invalidate future work consistently.
Targeted tests cover same-account reload and second-account denial; hosted writes are verified
when EX-02 permits.
Deliver domain/API contracts and evidence. Medication UI and occurrence delivery belong to the next
phases; do not implement hidden parallel versions.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-06
```

## EX-07

```text
START OF PROMPT EX-07
EX-07 - Build medication records and prescription
UI
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: D-01, D-06; report p. 4
Dependencies: EX-06 contracts and EX-02 hosted schema. Preserve the existing report/episode navigation.
Goal: Complete the patient-facing medication workflow using the existing application design and
centralized data.
07.1 - Create medication list/detail/create/edit/archive routes and components using the established
AppShell and API-client patterns. Add the Medications navigation item, pagination, filtering and current/past
status views. Do not rebuild the dashboard or introduce another UI system.
07.2 - Build accessible fields for the exact EX-06 strength/dose/quantity/regimen/meal/timezone semantics.
Show errors beside their fields and preserve unsaved inputs on validation failure. Make unresolved
medicine identity and as-needed behavior visible. No auto-generated treatment instructions or inferred
dose times.
07.3 - Provide a selector for the patient's own prescription documents and authorized preview/access.
Support permitted unlinking and replacement. Client filtering is a convenience; exercise backend denial of
a manipulated foreign ID. Show edit/status history and explain the effect of pause/archive on future
reminders.
07.4 - Implement loading, empty, stale, failed, conflict and retry states; invalidate relevant queries on
mutations and isolate caches by authenticated account. Read saved data from the API after refresh/login
rather than relying on device-local state.
07.5 - Run the browser workflow with synthetic medicines and real authentication: create, edit, link/relink,
archive, paginate, reload in a fresh session and attempt access as another account. Verify keyboard/mobile
layouts and that existing records/episodes still open.
Acceptance checks
The full medication record workflow is usable and persists centrally.
Server and browser errors are meaningful; foreign prescriptions cannot be linked or previewed.
UI evidence and API/integration evidence are recorded separately.
Finish the medication records UI only. Calendar execution, notifications and clinical safety display follow
EX-08 through EX-10.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-07
```

## EX-08

```text
START OF PROMPT EX-08
EX-08 - Implement occurrence scheduling, delivery
and intake integrity
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: E-01, E-02, E-03, part of E-07; report p. 5
Dependencies: EX-06 versioned schedule contracts and EX-02 hosted schema. EX-07 provides the
user-facing record workflow.
Goal: Create the durable reminder execution engine and duplicate-safe intake behavior before building
calendar notifications.
08.1 - Generate a bounded rolling horizon of occurrences from active PostgreSQL schedules. Persist
intended local time, confirmed IANA zone, UTC instant and schedule revision. Define midnight/end-date,
timezone-change, ambiguous/nonexistent DST-time and elapsed-interval behavior. Exclude as-needed
regimens unless an explicit supported occurrence exists.
08.2 - Define stable occurrence identity and database uniqueness/transaction guards for two schedulers.
Add a queue producer and register the reminder worker alongside existing processors. Use duplicate-safe
claims and schedule/status/revision checks immediately before actions; obsolete jobs must not create
current deliveries.
08.3 - Persist delivery intent and attempt/result states. Distinguish queued, attempted, durable in-app
delivery, browser dispatch and unknown device display; do not claim exactly-once external delivery where
the channel cannot prove it. Use bounded retries, safe errors and a unique occurrence/channel delivery
identity.
08.4 - Implement startup/periodic reconciliation from durable schedules, occurrences and delivery records.
Recover missing due work without replaying cancelled schedules or flooding historical reminders. Record
backlog/delay honestly when local workers were offline. Do not flush shared Redis to reset the system.
08.5 - Replace create-on-every-request intake behavior with request idempotency and atomic occurrence
updates. Define conflict handling for two devices, current/cancelled revision checks, and an append-only
correction history. Keep taken/skipped, due/overdue and delivery states distinct. Never infer a missed dose
merely from lack of acknowledgment.
Acceptance checks
Deterministic-clock tests cover timezone/DST/midnight/end dates and interval versus clock
schedules.
Two workers/schedulers, restart, duplicate jobs/intake requests and edits during delivery preserve
uniqueness/history.
A real isolated synthetic job reaches the registered processor and persists the truthful
delivery/intake result.
Record the occurrence/delivery/intake contracts for EX-09. Any browser acknowledgment limitations
remain documented rather than disguised as success.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-08
```

## EX-09

```text
START OF PROMPT EX-09
EX-09 - Build calendar, notifications and refill
workflows
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: E-04 to E-07; report p. 5
Dependencies: EX-07 medication UI and EX-08 occurrence/delivery/intake contracts.
Goal: Expose usable reminder and tracking workflows with honest offline behavior and no invented dosing
instructions.
09.1 - Build the daily/weekly calendar, upcoming doses, overdue/unacknowledged items and intake history.
Provide taken/skipped actions and corrections using EX-08 idempotency/conflict semantics. Display each
schedule in its confirmed timezone and preserve the meaning of historical entries.
09.2 - Display durable in-app notifications and optional browser notifications. Request permission only after
an intentional user action; handle denial and unsupported browsers without blocking in-app reminders.
Hide medicine/medical details in previews by default. Reuse current delivery states; do not equate
permission or an attempted dispatch with proven device display.
09.3 - Implement refill reminders using explicit stock units, administration quantities and actual taken
events. Handle corrections/undo and concurrent logs without double-decrementing inventory. Do not
deduct skipped doses or produce precise estimates from unknown quantities. Add course-ending messages
that do not recommend changing or extending treatment.
09.4 - Connect archive/pause/reschedule changes to UI and delivery cancellation. Explain when local
API/worker or browser availability limits delivery. On restart show a bounded overdue summary instead of
sending a flood of obsolete alerts. Do not deploy a service to solve this task.
09.5 - Run browser and service acceptance with synthetic medication data: same-account fresh sessions,
second-account denial, two-device conflicting actions, permission denial, unsupported browser, worker
outage/restart, schedule edit, refill adjustment and course completion. Mark inaccessible real-device
checks pending with precise steps.
Acceptance checks
Calendar, history and notifications agree with durable occurrence/intake records.
Refill math accounts for idempotency and corrections; no compensatory dosing advice is produced.
Browser and hosted results are recorded separately from deterministic/mock tests.
Complete the reminder user workflow and E-07 evidence. Preserve explicit limits for offline delivery and
any actual device checks still not performed.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-09
```

## EX-10

```text
START OF PROMPT EX-10
EX-10 - Add sourced medication safety and close
integration
Work only on this execution phase in existing MedVault. Read AGENTS.md, root track.md, and
docs/completion/WORKFLOW.md and plan.md if present. Reconcile the checkpoint with current Git state;
preserve edits. Initialize missing tracking without replacing newer progress. Reconfirm historical report
claims. Preserve local services, centralized hosted data/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, secret disclosure, automatic commits/pushes or future features 22-28.
Source findings: Safety work on report p. 6; remaining core acceptance from pp. 2-7
Dependencies: EX-06 medication/context contracts; EX-02 for hosted persistence; other phases for their
final acceptance. Adapter/unavailable-state work can proceed without provider access.
Goal: Implement the missing safety boundary and usable states, integrate only justified sources, and
produce an honest final completion review.
10.1 - Inspect any current resolver/provider first. Prepare a concrete source decision: availability, licensing,
cost, geography/brand coverage, supported checks, updates/versioning, privacy and intended-use limits.
Confirm current official documentation. Do not treat terminology lookup or Gemini as an interaction
database; obtain approval for genuinely new paid access before subscribing.
10.2 - Build typed request/result/provider contracts, minimal data transfer, bounded timeouts/retries/cache
and safe failures. Cover duplicate ingredients/overlapping use, drug interactions, supported
allergy/condition conflicts, and the distinction between inconsistent entered schedules and clinical dosage
judgments. Leave unknown identity/context unresolved.
10.3 - Persist findings, source/version/date, checked coverage and input revisions. Invalidate after
medicine/allergy/condition edits and atomically reject stale responses. Enforce patient ownership across
findings, refresh requests and source details. Never automatically change medications or generate
treatment instructions.
10.4 - Build the medication-safety UI with findings detected, no listed finding within checked coverage,
partial coverage, unknown medicine, missing context and service unavailable. If no suitable source/clinical
approval is available, finish this boundary/UI and fixtures but keep affected live clinical checks explicitly
BLOCKED. Do not ship hidden mock results or a tiny hardcoded list as a complete checker.
10.5 - Test supported source fixtures, malformed responses, failures, stale edits and cross-patient denial.
Run a real synthetic provider check only for a configured, authorized supported source. Revisit the Phase 2
rule-approval blocker without inventing clinical approval or claiming software tests establish it.
10.6 - Run the repository's actual final lint/typecheck/test/build/Prisma gates, relevant hosted/browser
checks, and a representative end-to-end user journey. Preserve synthetic/real and session/device
distinctions. Reconcile every report finding in track.md, update the detailed review with file-by-file changes
and risk, and list remaining external actions. Keep features 22-28 deferred.
Acceptance checks
All available safety workflows are usable with explicit provenance and truthful coverage states.
Final evidence identifies checkout/configuration context and actual command results; older passes
are not silently reused after relevant changes.
Every core finding is verified or explicitly partial/blocked, with an owner and next action.
Do not announce full completion if clinical/provider approval, hosted operation or real-device acceptance
remains blocked. Finish with a concrete review and resumable tracker, not a blanket all-done claim.
Checkpoint in track.md after each subtask and before long/consequential work: phase, subtask, changed
files, observed test/evidence results, pending outcome, blocker and exact next action. Complete
independent work but leave blocked acceptance explicit. Finish only this phase with a change/evidence
review. Follow WORKFLOW.md; do not depend on predicting usage limits.
END OF PROMPT EX-10
```
