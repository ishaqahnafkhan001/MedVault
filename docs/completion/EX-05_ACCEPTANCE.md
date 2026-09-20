# EX-05 Phase 2 Completion and Live Acceptance

Status: **BLOCKED overall; independent implementation complete pending final repository gates**

This record covers only EX-05. It does not promote EX-02 or EX-04, authorize hosted writes, or claim clinical validation. The operator explicitly deferred paid/cloud recovery work, so no hosted PostgreSQL, Auth, Storage or Redis mutation was performed during EX-05.

## Acceptance summary

| Subtask                                 | Current result                                                         | Evidence boundary                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 05.1 latest values and test history     | Implemented                                                            | Owner-scoped API and automated/rendered tests; no real browser session                      |
| 05.2 sourced explanations               | Implemented                                                            | Versioned curated mappings and deterministic rendering; not patient-specific interpretation |
| 05.3 method/specimen provenance         | Partial / blocked                                                      | Runtime comparison and cache contracts are safe; persistence migration awaits EX-02 review  |
| 05.4 attention-rule boundary            | Boundary implemented; clinical integration blocked                     | Validated cannot-assess result, zero active coverage, informational provenance only         |
| 05.5 hosted lifecycle                   | Blocked / not run                                                      | Requires hosted database and Redis writes after EX-02 recovery approval                     |
| 05.6 interaction and restart acceptance | Automated portion implemented; actual browser/restart evidence not run | Final live checklist below                                                                  |

## 05.1 Latest values and history

- `GET /v1/measurements/history` derives the patient only from the verified bearer identity.
- Only patient-reviewed `REPORT` sources whose document, verification and extraction statuses are `VERIFIED` are eligible.
- The query accepts strict `metric`, `dateFrom` and `dateTo` filters. Date filters use the report's clinical date; unknown-date observations remain visible only without a date filter.
- Results are limited to the newest 200 eligible source reports and return `limited` plus `sourceReportCount`. The interface displays this limit instead of implying complete history.
- A metric filter is also applied to the database relation before the 200-report bound, so searching an older metric is not first narrowed by unrelated reports.
- Unknown-date observations are preserved in tables but cannot become a “latest” card.
- Each latest card displays the reviewed value, clinical date, source-specific range, comparison confidence, history link and authorized original-report link.
- Test history reuses the existing deterministic series, unit-conversion, range and source-link components. Qualitative/bounded results are never plotted as invented exact numbers.
- Latest report-group selection now obtains every eligible group winner under the existing total order before applying the 12-group limit.

## 05.2 Terminology and explanations

The mapping version is `medlineplus-curated-2026-09-21-v1`. It covers a bounded set of common normalized terms and returns an explicit `UNMAPPED` result for everything else. Every mapped entry contains an HTTPS source, publisher, short general explanation and uncertainty statement.

The mapping is deterministic application content. Gemini receives only the reviewed fact-selection input and cannot author, rewrite or cite these explanations. Completed report/episode summaries render the mapped explanations beside grounded findings. The summary prompt/config versions moved to `phase2-grounded-v3` and `reviewed-observations-v3`. The terminology and attention versions are included in the summary fingerprint snapshot so a version change invalidates an older cache.

These explanations do not interpret a patient's number, diagnose a condition, choose a reference range, or recommend treatment.

## 05.3 Method and specimen provenance

Current inspected behavior:

- `AnalysisSource`, trend points and rendered measurement tables already carry `laboratory`, `method` and `specimen`.
- `seriesCompatible` separates differing supplied laboratory/method/specimen contexts. A missing context leaves comparability `UNCERTAIN`; analyte name and unit alone never establish comparability.
- Summary snapshots include the complete source structures plus configuration, terminology and attention versions, so a future supplied context change will invalidate the cache.
- Current persistence supplies `laboratory` from `MedicalDocument.hospitalName`; extraction, Prisma and review DTOs have no method/specimen fields. `reviewedSources` therefore truthfully returns both as `null`.

Required blocked change after EX-02:

1. Review whether context belongs to each measurement, the report, or both; mixed panels make measurement-level provenance the safer default.
2. Add nullable extracted and patient-reviewed method/specimen fields through a reviewed additive Prisma migration. Do not backfill guessed values.
3. Extend strict extraction, review and response schemas; preserve original and reviewed values separately.
4. Map reviewed context into `AnalysisSource`, bump the analysis configuration version, and rerun stale-cache and incompatible-series tests.
5. Apply only after an approved hosted recovery point, isolated restore procedure and migration-history comparison. Do not use `db push` or reset.

## 05.4 Attention boundary

`AttentionRuleInput` documents the value kind, value, units, source range/flag, laboratory, method, specimen and patient context a real rule set would need. `AttentionAssessmentDto` documents coverage, provenance and the result.

Current runtime result is always:

- status `CANNOT_ASSESS`;
- rules version `disabled-no-validated-clinical-rules`;
- `automatedUrgencyEnabled: false`;
- zero supported metrics;
- informational provenance marked `NOT_APPROVED`.

The MedlinePlus lab-results reference explains why laboratory methods/ranges and broader patient context matter. It is not an urgency rule. No source fixture contains a threshold or produces an alert. Clinical source selection, population/method coverage, change control, safety review and approval remain blocked and must be resolved before enabling any automated urgency behavior.

## 05.5 Hosted lifecycle checklist — not run

Do not execute this checklist until EX-02 has an approved verified recovery point and restore procedure, the hosted migration history is reconciled, and synthetic hosted writes are authorized.

- [ ] Confirm API and worker resolve the same hosted PostgreSQL identity and Redis identity without printing credentials.
- [ ] Confirm the reviewed `medical_summaries` migration is present and current.
- [ ] With a synthetic patient, request one individual-report summary.
- [ ] Prove request → BullMQ job → worker claim → Gemini validated fact selection → fenced database completion → API reload → browser render.
- [ ] Repeat for an episode containing multiple eligible verified reports.
- [ ] During a controlled active job, correct a reviewed value and separately change episode membership.
- [ ] Prove both earlier completions lose their stale-write race and cannot overwrite the new fingerprint/generation.
- [ ] Request the unchanged summary twice and prove the valid completed cache is reused without a new provider job.
- [ ] Restart API and worker; reload the same results from hosted PostgreSQL.
- [ ] Record synthetic IDs, timestamps, statuses and safe hashes only. Do not record report content, prompts, provider responses, tokens or signed URLs.

## 05.6 Browser and failure checklist — not run

Use only synthetic data and a browser/session approved for hosted writes.

- [ ] Keyboard-only navigation reaches Test history, every filter, latest card, chart point, table and original-report link.
- [ ] Touch-size and mobile layout are usable without horizontal page overflow.
- [ ] Empty history, one point, constant values, qualitative/bounded values, unknown dates, missing ranges and differing source ranges render without invented data.
- [ ] Clinical-date from/to filters exclude unknown dates and reject reversed ranges.
- [ ] A source link opens only an owned report; a second synthetic account receives 404 for the same ID.
- [ ] Delayed summary polling pauses honestly and Check status resumes a read.
- [ ] Queue/provider failure leaves source reports/history usable and presents retryable failure without old text as current.
- [ ] Fresh login starts with an empty private query cache; logout clears it.
- [ ] Worker restart preserves queued/recoverable work and does not duplicate a completed summary.
- [ ] Repeat the same-account history/summary read in a separate browser/device context.

## Authoritative source review

The terminology and attention-boundary sources were checked on 2026-09-21:

- [MedlinePlus: Complete Blood Count](https://medlineplus.gov/lab-tests/complete-blood-count-cbc/)
- [MedlinePlus: Hemoglobin A1C](https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/)
- [MedlinePlus: Blood Glucose](https://medlineplus.gov/lab-tests/blood-glucose-test/)
- [MedlinePlus: Creatinine](https://medlineplus.gov/lab-tests/creatinine-test/)
- [MedlinePlus: TSH](https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/)
- [MedlinePlus: ALT](https://medlineplus.gov/lab-tests/alt-blood-test/)
- [MedlinePlus: AST](https://medlineplus.gov/lab-tests/ast-test/)
- [MedlinePlus: Cholesterol](https://medlineplus.gov/lab-tests/cholesterol-levels/)
- [MedlinePlus: Sodium](https://medlineplus.gov/lab-tests/sodium-blood-test/)
- [MedlinePlus: Potassium](https://medlineplus.gov/lab-tests/potassium-blood-test/)
- [MedlinePlus: Uric Acid](https://medlineplus.gov/lab-tests/uric-acid-test/)
- [MedlinePlus: How to Understand Your Lab Results](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/)

## Exit condition

EX-05 must remain **BLOCKED**, not `VERIFIED`, until 05.5 and the actual-browser/restart portion of 05.6 are recorded and the clinical dependency remains separately labeled. Independent code completion does not satisfy hosted or clinical acceptance.
