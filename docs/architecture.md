# MVP implementation architecture

This document describes the implemented MVP code path. The configured development topology is currently hybrid: local PostgreSQL is selected for structured data while Supabase Auth/Storage and the effective Redis target are hosted. Hosted PostgreSQL is the target production system of record, but cutover and cross-device persistence are not verified.

```text
Next.js web --Supabase access token--> Express API --ownership-scoped queries--> PostgreSQL
                                               |--> private Supabase Storage
                                               |--> BullMQ / Redis
                                                        |
                                                        v
                                              worker -> Gemini structured output
                                                        |
                                                        v
                                              Zod validation -> NEEDS_REVIEW
                                                        |
                                                        v
                                              patient correction -> VERIFIED
```

The browser authenticates through Supabase. The API independently verifies every bearer token and resolves an internal patient from the Supabase user ID. Resource identifiers never establish ownership; every profile, document, extraction, signed-file, verification, retry, and search query is scoped to that patient.

Documents are uploaded through the API after magic-byte, MIME, size, and allowed-enum document-type validation. The type is selected in client metadata; file semantics are not independently classified. The storage adapter writes to a private bucket at `<auth-user-id>/<document-id>/<sanitized-name>`. The API returns only short-lived signed access URLs after another ownership check.

For documents stored as `REPORT`, the API attempts queue publication after Storage and database creation. BullMQ job IDs include the document ID and version. Publication can fail, and the current publish-before-status ordering has a stranded-`UPLOADED` window plus a fast-worker race that can regress `PROCESSING` to `QUEUED`; these are recorded code gaps. When a job runs, the worker makes an atomic processing-state claim, verifies that the stored document type is `REPORT`, validates its path, downloads privately on the server, calls the Gemini adapter, validates strict structured output, and transactionally replaces only that version's draft extraction. Transient failures are retried by BullMQ; final failures store a safe reason code.

Documents stored as `PRESCRIPTION` take a separate terminal path: they use processing `NOT_APPLICABLE`, have no extraction, and cannot be accepted by the queue producer or worker. Because the client selects the stored type and there is no content-based classifier, a prescription mislabeled as `REPORT` can still reach report analysis; this remains a safety gap.

AI output is extraction, not medical advice. It remains `NEEDS_REVIEW` and is excluded from latest results. Verification stores patient-confirmed fields without deleting model provenance or the original Storage object. Latest reports are verified-only and ordered by `documentDate DESC, createdAt DESC`; upload date never substitutes for an unknown report date.

Adapters isolate Supabase Storage, Supabase Auth, BullMQ, and Gemini so unit and API tests run without external services. Sentry is optional and sanitizes request data when configured.

## REST resources

- `GET|PUT /v1/profile`
- `POST|GET /v1/documents`, `GET /v1/documents/:id`, `GET /v1/documents/:id/file`, `DELETE /v1/documents/:id`
- `GET /v1/reports`, `GET /v1/reports/latest`, `GET /v1/reports/:id`
- `PUT /v1/reports/:id/verify`, `POST /v1/reports/:id/retry`
- `GET /v1/dashboard`

All `/v1` resources require a Supabase bearer token. Missing and cross-owner records use the same `404` response so resource existence is not disclosed.
