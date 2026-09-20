# EX-04 Live Acceptance Checklist

Status: **PREPARED, NOT RUN**  
Prepared: 2026-09-20 UTC  
Scope: synthetic accounts and synthetic medical documents only

This checklist is the smallest remaining manual/live action for EX-04. It must not be used while
EX-02's hosted recovery and security gates are blocked. Completing automated checks or running the
application locally does not substitute for this live evidence.

## Activation gates

Before creating an account, row, object, or queue job, record all of the following without copying a
secret into evidence:

- [ ] EX-02 authorizes hosted writes after a verified recovery point and separate restore procedure.
- [ ] The hosted schema and committed migration history are aligned.
- [ ] API and worker resolve the same hosted PostgreSQL database and Redis deployment.
- [ ] Auth and private Storage belong to the intended Supabase project.
- [ ] A private `medical-documents` bucket exists and the readiness endpoint passes.
- [ ] The API and worker are running the reviewed checkout; no unrelated worker is stopped.
- [ ] Two synthetic Supabase Auth accounts are available: owner A and non-owner B.
- [ ] Test inputs contain no real patient identity, medical content, or reused production files.

Record a UTC start time, checkout SHA, sanitized environment classification, and operator initials.
Never record tokens, credentials, signed URLs, object bytes, prompts, AI responses, emails, UUIDs, or
medical values.

## 04.1 Fresh sessions and actual Mac/Windows persistence

1. On the Mac, sign in as synthetic owner A in a fresh private browser session.
2. Create or update the synthetic profile, then refresh the page and sign out.
3. Sign in again in a second fresh Mac session. Confirm the same patient mapping and profile appear.
4. Upload one synthetic readable report, complete review with synthetic values, verify it, then sign
   out. Record only PASS/FAIL and timestamps.
5. Restart the local web, API, and worker processes without changing their environment.
6. On Windows, open a fresh private browser session and sign in as the same owner A.
7. Confirm the same profile, document list, document metadata, reviewed values, and verified state.
8. Refresh, close the browser, reopen a fresh session, sign in again, and repeat the checks.
9. Sign out and confirm protected pages redirect to login and cached owner data is not visible.

Fresh-session result and actual Mac-to-Windows result must be recorded separately. Screenshots, if
used, must be redacted and must not show document content, identifiers, emails, or signed URLs.

## 04.2 Screening matrix

Upload each fixture as a new synthetic item and compare API, queue, worker, and browser states. Do not
reuse a real document.

| Fixture                                                 | Expected outcome                                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Readable supported report                               | Screening occurs before extraction; processing reaches `NEEDS_REVIEW`; patient verification can reach `VERIFIED`.           |
| Prescription declared as prescription                   | Stored privately with `NOT_APPLICABLE`; no report-analysis job or extraction.                                               |
| Prescription mislabeled as report                       | Server-side screening reclassifies it as prescription; it is stored, not extracted, and the browser explains what happened. |
| Unrelated image                                         | Extraction does not start; safe message explains how to upload a valid document.                                            |
| Blank, blurry, or uncertain document                    | Extraction does not start; safe readability message requests a clearer upload.                                              |
| Unsupported medical content                             | Extraction does not start; safe message explains that the type is unsupported.                                              |
| Unsupported file bytes with an allowed-looking filename | API returns 415 and creates no object, metadata row, or queue job.                                                          |
| Screening provider outage                               | Technical failure is retryable, does not claim the content is invalid, and does not start extraction.                       |

For the readable fixture, correlate sanitized request/job IDs to prove `classify` preceded `extract`.
Do not retain raw AI request/response content as evidence.

## 04.3 Ownership and private Storage

1. For every synthetic database document, verify its expected namespaced private object exists.
2. As owner A, confirm document metadata, signed preview, and download work.
3. Confirm the signed-file API response is `private, no-store` and the browser refreshes the URL
   before its declared expiry.
4. Sign in as synthetic non-owner B in a separate private session.
5. Attempt owner A's direct document read, report read, signed-file request, verify, retry, cancel,
   delete, episode/document link, summary source, medication/prescription link, and linked-ID inputs.
6. Every attempt must return the owner-scoped not-found/denial behavior without revealing existence.
7. Confirm owner A's database row and Storage object remain unchanged after the denial checks.
8. Report missing database objects or unreferenced objects; do not auto-delete either class.

## 04.4 Queue and recovery

Use a unique test prefix or allowlisted job IDs. Never flush a shared queue and never stop another
user's worker.

1. Make the producer unavailable for one isolated upload. Confirm the file and metadata remain
   recoverable, the API does not report false success, and status is `FAILED/QUEUE_UNAVAILABLE`.
2. Stop only the isolated test worker, enqueue one synthetic report, then restart it. Confirm eventual
   processing and one persisted current-version result.
3. Deliver the same document/version job twice. Confirm one claim/result and no duplicate extraction.
4. Force a bounded provider timeout. Confirm retry before the attempt ceiling and a safe terminal
   failure at the ceiling.
5. Exercise stranded `UPLOADED`, missing queued job, stale `PROCESSING`, live active job, completed
   job, failed job, current-version mismatch, and concurrent reconciliation claims.
6. Compare BullMQ state, PostgreSQL state, API DTO, and browser state after every case. A stale worker
   must not overwrite a newer version or verified result.

## 04.5 Operations and security

- [ ] `GET /health` proves process liveness even when a dependency is unavailable.
- [ ] `GET /ready` checks PostgreSQL, Redis, and the private Storage bucket and fails safely.
- [ ] Gemini readiness is assessed at the worker/provider boundary and is not implied by API health.
- [ ] Safe 4xx/5xx/429 envelopes contain the same bounded request ID as the response header.
- [ ] Logs contain no medical content, prompts, responses, tokens, credentials, or signed URLs.
- [ ] Expired/invalid tokens return 401; logout clears private query state and protected pages.
- [ ] Rate limiting and Redis outage policy match the intended production environment.
- [ ] Retention/deletion approval, audit requirements, monitoring, incident response, and Gemini
      privacy/legal approval are explicitly PASS or still blocked; absence is never treated as PASS.

## Evidence record

For each item record only: UTC time, test case ID, PASS/FAIL/BLOCKED, sanitized component state,
checkout SHA, and a reference to redacted evidence stored outside Git. Any unexpected count, ownership
result, missing object, stale overwrite, or unsafe log stops acceptance and becomes a defect.

EX-04 can be marked VERIFIED only after every applicable item passes and both fresh-session and actual
Mac/Windows results are present. Until then the required status is **BLOCKED / LIVE ACCEPTANCE NOT
RUN**.
