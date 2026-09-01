# Supabase Auth Account Lifecycle

`patients.auth_user_id` references a UUID managed by Supabase Auth, but PostgreSQL cannot enforce a foreign key across the local/hosted application database and Supabase Auth service. Deleting an Auth user therefore does not delete or invalidate the related patient row, profile, medical metadata, Storage objects, or queued work.

Phase 2 deliberately does not install an automatic deletion hook or webhook. Account deletion is a destructive medical-data decision that requires authenticated intent, retention/legal policy, retry protection, auditability, and a tested cross-service workflow. A fragile unsigned webhook would be unsafe, and a database cascade cannot remove Storage bytes.

Administrators can run `pnpm --filter @medvault/api check:consistency`. The command uses the server-only Supabase Admin API to test referenced Auth UUIDs, reports only patient IDs and hashed Auth identifiers, and performs no deletion. A reported orphan must be investigated before any action: verify the Supabase project, account event, retention obligations, backups, and whether recovery or reassociation is expected.

Any future account-wide deletion should reuse the per-document coordinator, record durable progress in an outbox/deletion table, revoke active sessions, remove all private objects through the Storage API, delete application rows only after recoverable checkpoints, and expose explicit retry/audit status. That workflow is outside Phase 2.
