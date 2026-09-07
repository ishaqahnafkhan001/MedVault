# Database Security Plan

This plan describes the intended hosted-database security posture. No grant, schema, policy, or hosted row was changed during the 2026-09-02 centralized-development audit. The plan has not yet been applied because it is an authorization-gated external database operation and the Prisma runtime-role behavior must be proven first.

## Current Access Model

- The API and worker connect directly to PostgreSQL through Prisma, `@prisma/adapter-pg`, and the server-only `DATABASE_URL`.
- The browser calls the authenticated Express API. Repository code does not query application tables through Supabase Data API, `supabase-js`, or a browser database client.
- Supabase Auth establishes identity. API handlers derive the patient from the verified Auth user UUID; they do not accept a client-selected patient ID.
- Supabase Storage is a separate private-object service. Its policies and `storage.objects` metadata are not substitutes for application-table authorization.
- The committed Prisma migration creates application tables in `public` and contains no RLS statements. The intended and only application system of record is the hosted Supabase PostgreSQL database; old local databases are unused legacy artifacts and must not be imported or deleted automatically.

## Read-only hosted audit — 2026-09-02

- The hosted project contains `patients`, `patient_profiles`, `medical_documents`, `report_extractions`, `report_measurements`, and `_prisma_migrations`.
- The hosted initial migration history and checksum match the committed `20260807000000_initial` migration.
- RLS is disabled and there are no policies on the five application tables.
- `anon`, `authenticated`, and `service_role` currently hold broad application-table privileges. Supabase's security advisor flags RLS-disabled tables in the exposed `public` schema, including the migration table.
- Repository browser code does not use the Data API for these tables, so those browser-role privileges are unnecessary.
- The `medical-documents` Storage bucket is private. Storage access is server-side through the service-role client after Express ownership checks; no direct browser object policy is required by the implemented architecture.

This is a remaining security risk, not an implemented protection. Until it is remediated, possession of a valid project public key/session may provide a path to the exposed Data API that bypasses Express authorization, depending on active grants and API schema settings.

## Recommended Phase 3 Posture

Browser access to application tables is unnecessary, so the preferred posture is to keep them out of the Supabase Data API entirely. Use a dedicated backend database role for Prisma, grant only the required table/sequence/schema privileges to that role, and do not grant application-table access to `anon` or `authenticated`.

If the tables must remain in an exposed schema, enable RLS as defense in depth before granting any Data API role access. Do not add permissive policies. Any future browser policy must bind the row owner to `(select auth.uid())`; `TO authenticated` alone is not ownership authorization. UPDATE policies require both `USING` and `WITH CHECK`.

Avoid using the Supabase `service_role` key for Prisma connectivity. It is an HTTP API credential, whereas Prisma uses a PostgreSQL connection role. Do not use user-editable Auth `user_metadata` for authorization.

RLS and the Prisma connection role must be designed together. Enabling RLS with no policies blocks an ordinary `NOBYPASSRLS` role, so that change alone would break the API and worker. Adding a broad backend `USING (true)` policy is not acceptable. For the current API-authorized architecture, the smallest code-neutral candidate is a dedicated, non-owner Prisma runtime role with narrowly granted access to only the five application tables and `BYPASSRLS`, combined with disabled/minimized Data API exposure and explicit revocation from browser/HTTP roles. The role must have no DDL, superuser, `CREATEDB`, `CREATEROLE`, replication, or unrelated-schema privileges.

A future stronger design could use a `NOBYPASSRLS` runtime role and transaction-local verified identity with ownership policies. That requires deliberate API/worker role and transaction changes; it must not be improvised during migration.

## Recommended Grants

- Revoke application-table privileges from `anon`, `authenticated`, and `PUBLIC` after confirming they are not required.
- Confirm whether `service_role` has application-table HTTP privileges and revoke those privileges when the server uses it only for Auth/Storage operations.
- Grant the dedicated Prisma backend role only the schema usage and table/sequence operations exercised by API and worker code.
- Keep migration ownership separate from normal runtime access where the hosting model permits it.
- Keep `auth`, `storage`, and `realtime` service schemas managed by Supabase. Do not directly delete Storage metadata rows; use the Storage API.
- Verify default privileges so newly created tables do not silently become Data API-accessible.

Exact SQL must be generated and reviewed against the selected target and its existing grants. It is intentionally absent because blindly enabling RLS can break Prisma and blanket schema revocation can break Supabase-managed objects.

Before generating SQL, inspect table owners, runtime/migration roles, `relrowsecurity`, policies, explicit grants, default ACLs, exposed schemas, and Data API settings. Blanket schema revokes can break Supabase-managed objects and are prohibited without that inventory. If possible, disable Data API exposure before applying the initial Prisma migration so there is no interval in which new medical tables inherit browser-accessible grants.

## Authorization-gated hardening sequence

1. Confirm the Data API exposed schemas and current default privileges in the Supabase Dashboard.
2. Create and test a dedicated least-privilege Prisma runtime role, separate from the migration owner where supported.
3. In an isolated environment, revoke application-table access from `anon`, `authenticated`, `PUBLIC`, and HTTP `service_role` where it is not needed.
4. Decide whether to move application tables out of an exposed schema or keep them in `public` with RLS defense in depth.
5. Rehearse the exact connection-role/RLS combination and prove API/worker CRUD still works. Never add blanket `USING (true)` policies.
6. Apply reviewed, idempotent DDL only after explicit authorization, then rerun security/performance advisors.
7. Prove public/anonymous and authenticated Data API clients cannot read or mutate the five application tables.
8. Rerun two-user API IDOR tests and live profile/document/worker flows.

No security DDL in this sequence has been executed.
