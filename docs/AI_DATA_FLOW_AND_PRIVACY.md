# AI Data Flow and Privacy Boundary

This document describes behavior visible in repository source. It is not a compliance certification.

## Inputs Sent to Gemini

Only documents stored with `documentType=REPORT` are eligible for the `report-analysis` queue. Queue producer and worker boundaries reject records stored as `PRESCRIPTION`. The upload type is selected in client metadata and validated only against the allowed enum; the API does not independently detect prescription content, so a prescription mislabeled as `REPORT` can enter report analysis. Supported report media types are PDF, JPEG, PNG, and WebP.

The worker retrieves the complete object bytes from the private Supabase Storage path recorded for the authenticated user's report. `GeminiReportExtractionAdapter` base64-encodes the complete bytes and sends them to the configured Gemini model with the detected MIME type and a fixed fact-extraction instruction. The adapter does not deliberately send the patient database ID, Auth user ID, original filename, storage path, profile, or bearer token. Those identifiers may still appear inside the report image/PDF itself.

The prompt directs the model to extract only printed facts, use null for absent fields, preserve source flags only when printed, and never diagnose, interpret health status, or recommend treatment. Temperature is zero and a JSON response schema is supplied.

## Output and Persistence

Gemini returns one structured JSON object containing report type, test name, normalized name, report date, hospital name, category, patient name printed on the report, and measurement fields. The response is untrusted until it passes the shared Zod schema. The worker normalizes names and validates the current document version/status again at the transaction boundary.

Successful output is stored in PostgreSQL as a `ReportExtraction`, its `ReportMeasurement` rows, and the validated structured `rawOutput`. The document moves to `NEEDS_REVIEW`; it is not treated as verified until the authenticated patient explicitly verifies the extraction. The repository does not persist the fixed prompt separately, and application logging rules prohibit AI prompts/responses and medical content.

## Excluded Data and Actions

- Records stored as `PRESCRIPTION` never enter report analysis; mislabeled content is an unresolved classification risk.
- Gemini is not asked to diagnose, interpret, or recommend treatment.
- A stale worker cannot overwrite a newer document version.
- Invalid or malformed provider output is not persisted as a completed extraction.
- Signed URLs, service-role keys, Gemini keys, Redis credentials, and bearer tokens are not part of the model request.

## What Source Code Cannot Prove

Repository code cannot prove provider retention duration, training use, processing/data-residency region, subprocessors, staff access, deletion guarantees, legal basis, contractual safeguards, breach procedures, or whether a particular deployment meets HIPAA, GDPR, or another regulatory regime. Those require current provider terms/configuration, contracts, organizational controls, a data-protection assessment, and legal/security approval before production medical-data use.
