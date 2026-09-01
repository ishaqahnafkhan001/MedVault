# Medical Document Lifecycle

## Upload and Processing

The API derives the patient from verified Supabase identity, generates the document UUID and storage path, uploads to the private bucket, and then stores metadata. For documents stored as `REPORT`, it attempts to publish a deterministic `<documentId>-v<documentVersion>` job and then set the row to `QUEUED`; publication can fail, and the current ordering has a stranded-`UPLOADED` window plus a fast-worker status race. Records stored as `PRESCRIPTION` remain `NOT_APPLICABLE` and are rejected by AI-processing boundaries. Because the classification is client-selected and not independently inferred from content, a prescription mislabeled as `REPORT` can still enter report analysis.

The nominal report state is `UPLOADED → QUEUED → PROCESSING → NEEDS_REVIEW → VERIFIED`, with `FAILED` as a recoverable error state and the queue/status races noted above. A stale queue reconciler consults PostgreSQL status/version/processing-claim count and the matching BullMQ job before requeueing. A live job is left unchanged even at or above the configured threshold. A non-live job at the threshold becomes `FAILED` with `QUEUE_RECOVERY_EXHAUSTED` only when the conditional database update succeeds; queue-state errors or lost optimistic updates can leave it unchanged. Worker writes are atomic and conditional on the same document version still being `PROCESSING`.

## Single-Document Deletion Strategy

`DELETE /v1/documents/:id` is authenticated and resolves the document through the verified user's patient relationship. A missing or other-patient document returns the same not-found response and does not expose its storage path.

For reports, the coordinator first inspects/removes the deterministic BullMQ job. Active jobs cause a retryable conflict and no deletion. It then conditionally marks the current document/version `FAILED` with `DELETE_PENDING`, deletes the private object through the Supabase Storage API, and deletes database metadata. Database cascades remove extraction and measurement rows.

If Storage deletion fails, database deletion does not proceed. The prior state is restored and eligible report jobs are recreated with the same deterministic ID. If that compensation fails, the document remains `FAILED` with `DELETE_ROLLBACK_QUEUE_FAILED` for operator recovery.

If Storage succeeds but the database delete fails, the durable `DELETE_PENDING` metadata remains and the endpoint returns `DOCUMENT_DELETE_INCOMPLETE`. Retrying is safe because Storage removal is treated idempotently, after which metadata deletion can complete. The read-only consistency checker also detects the missing-object relationship. This is the simplest recoverable strategy available without a Phase 3 schema/outbox migration.

Account-wide deletion and automatic orphan cleanup are not implemented.
