# Database Security Plan

This plan describes the intended Phase 3 database security posture. Phase 2 did not change grants, schemas, RLS policies, or hosted database data. The 2026-08-30 Phase 3 attempt stopped before target inspection because the hosted PostgreSQL connection was unreachable from this client, so this plan has not yet been applied.

## Current Access Model

- The API and worker connect directly to PostgreSQL through Prisma, `@prisma/adapter-pg`, and the server-only `DATABASE_URL`.
- The browser calls the authenticated Express API. Repository code does not query application tables through Supabase Data API, `supabase-js`, or a browser database client.
- Supabase Auth establishes identity. API handlers derive the patient from the verified Auth user UUID; they do not accept a client-selected patient ID.
- Supabase Storage is a separate private-object service. Its policies and `storage.objects` metadata are not substitutes for application-table authorization.
- The current Prisma migration creates application tables in `public` and contains no RLS statements. The active structured development database is local PostgreSQL, not the hosted Supabase database.

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

Exact SQL must be generated and reviewed against the selected Phase 3 target and its existing grants. It is intentionally absent from this Phase 2 document.

Before generating SQL, inspect table owners, runtime/migration roles, `relrowsecurity`, policies, explicit grants, default ACLs, exposed schemas, and Data API settings. Blanket schema revokes can break Supabase-managed objects and are prohibited without that inventory. If possible, disable Data API exposure before applying the initial Prisma migration so there is no interval in which new medical tables inherit browser-accessible grants.

## Phase 3 Migration Sequence

1. Verify the local and hosted project identities, connectivity, PostgreSQL versions, and migration histories without changing either database.
2. Record local and hosted row counts per application table without printing row contents.
3. Create and verify restorable backups before any schema or data operation.
4. Rehearse schema creation, data transfer, grants, and rollback against an isolated non-production target.
5. Decide whether application tables will use a non-exposed schema or remain in `public` with restrictive grants and RLS defense in depth.
6. Rehearse the exact connection-role/RLS combination and prove Prisma CRUD still works without broad policies.
7. Apply schema and grants through a reviewed migration, then run database security/performance advisors.
8. Test that `anon`, `authenticated`, and service-role HTTP clients cannot access the five application tables.
9. Validate API ownership and IDOR tests using two identities. Confirm the browser has no direct table access.
10. Pause writes for the final transfer, verify row counts and integrity relationships, switch API and worker together, and keep the rollback checkpoint intact.
11. Observe errors and queue reconciliation before declaring the hosted database authoritative.

No security DDL in this sequence was executed during the blocked Phase 3 attempt. See `DATABASE_MIGRATION_RUNBOOK.md` for the resume gates.
