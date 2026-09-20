// Restores only the reviewed archive into a NEW database on the approved local PG17.
// Never loads .env or connects to a hosted service. No --clean/--create/ignored ACLs.
import { readFileSync, existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  Client,
  runRoot,
  tables,
  localConfig,
  assertLocal,
  protection,
  invariant,
  saveJson,
  digest,
  allowlistedRestoreToc,
  libpqEnvironment,
  pgCommand,
  safeFailure,
} from "./recovery-common.mjs";

const folder = `${runRoot}/snapshot-20260912T055058Z`;
const database = "medvault_ex02_restore_20260912";
const roles = ["postgres", "anon", "authenticated", "service_role", "supabase_admin"];
let admin, restored;
let stage = "preflight";
try {
  invariant(
    process.argv.length === 3 && process.argv[2] === "--restore-reviewed-backup",
    "EXPLICIT_RESTORE_FLAG_REQUIRED",
  );
  protection();
  const manifest = JSON.parse(readFileSync(`${folder}/backup-manifest.json`, "utf8"));
  invariant(
    manifest.project === "ginzrzcgjmkrpkdywfds" &&
      manifest.sourceDatabase === "postgres" &&
      manifest.result === "BACKUP_CREATED_RESTORE_PENDING" &&
      manifest.sharedSnapshot &&
      manifest.archive.name === "public-data.dump" &&
      manifest.schema.name === "public-schema.sql",
    "UNREVIEWED_MANIFEST",
  );
  // Immutable reviewed archive identity; changing the manifest alone cannot select another dump.
  invariant(
    digest(`${folder}/backup-manifest.json`) ===
      "d54efd62372f5ab1701b6270da59f303767c7dca60927476707a7edf7ab68cc3" &&
      manifest.archive.sha256 ===
        "2d849b5202255c66b49b27b3e421cd05c597e782840d70f63f2ec7d132a76fa5" &&
      digest(`${folder}/public-data.dump`) === manifest.archive.sha256 &&
      manifest.schema.sha256 ===
        "4ec676f7b2a0ae3b79c01f3dfd8398393ad14d98f6eb8e4731ff1d48c9c4e1b8" &&
      digest(`${folder}/public-schema.sql`) === manifest.schema.sha256 &&
      manifest.baselineSha256 ===
        "6a9315d87b3cddd0ac9bc8500bd19165ad1c74293a0861adb5ffb79b1d434e3c" &&
      digest(`${folder}/source-baseline.json`) === manifest.baselineSha256,
    "BACKUP_DIGEST_MISMATCH",
  );
  invariant(
    !existsSync(`${folder}/restore-result.json`) && !existsSync(`${folder}/restore-started.json`),
    "RESTORE_ALREADY_STARTED_INSPECT_OUTCOME",
  );
  const baseline = JSON.parse(readFileSync(`${folder}/source-baseline.json`, "utf8"));
  const config = localConfig(database);
  const env = libpqEnvironment(config, false);
  const toc = pgCommand("pg_restore", ["--list", `${folder}/public-data.dump`], env);
  invariant(allowlistedRestoreToc(toc), "ARCHIVE_TOC_NOT_ALLOWLISTED");
  const archived = [...toc.matchAll(/^\d+; \d+ \d+ TABLE DATA public (\S+) \S+$/gm)]
    .map((m) => m[1])
    .sort();
  invariant(isDeepStrictEqual(archived, tables), "ARCHIVE_TABLE_SET_CHANGED");
  admin = new Client(localConfig());
  await admin.connect();
  await assertLocal(admin, "postgres");
  const existing = await admin.query(
    "SELECT count(*)::int AS n FROM pg_database WHERE datname=$1",
    [database],
  );
  invariant(existing.rows[0].n === 0, "RESTORE_DATABASE_NOT_NEW");
  const { rows: existingRoles } = await admin.query(
    "SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])",
    [roles],
  );
  invariant(existingRoles.length === 0, "RESTORE_ACL_ROLES_ALREADY_EXIST_INSPECT_FIRST");
  saveJson(`${folder}/restore-started.json`, {
    startedAt: new Date().toISOString(),
    database,
    host: "127.0.0.1",
    port: 55441,
    archiveSha256: manifest.archive.sha256,
    state: "STARTED_NOT_PROOF_OF_SUCCESS",
  });
  stage = "local-role-and-database-preparation";
  for (const role of roles) {
    // Fixed local aliases only, not Supabase managed role provisioning.
    await admin.query(
      `CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
  }
  await admin.query(`CREATE DATABASE ${database} TEMPLATE template0`);
  await admin.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`);
  restored = new Client(config);
  await restored.connect();
  await assertLocal(restored, database);
  const {
    rows: [{ n }],
  } = await restored.query(
    "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname NOT IN('pg_catalog','information_schema') AND s.nspname NOT LIKE 'pg_toast%'",
  );
  invariant(n === 0, "RESTORE_DATABASE_NOT_EMPTY");
  // Retain the empty template schema rather than dropping anything. The archive
  // creates its own public schema and preserves its grants/default ACLs.
  await restored.query("ALTER SCHEMA public RENAME TO medvault_empty_template_public");
  await restored.end();
  restored = undefined;
  protection();
  stage = "isolated-restore";
  pgCommand(
    "pg_restore",
    [
      "--no-password",
      "--dbname",
      database,
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      `${folder}/public-data.dump`,
    ],
    env,
  );
  stage = "restored-verification";
  restored = new Client(config);
  await restored.connect();
  await assertLocal(restored, database);
  await restored.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await restored.query("SET LOCAL search_path=pg_catalog,public");
  const {
    rows: [{ evidence }],
  } = await restored.query(
    readFileSync(new URL("application-verification.sql", import.meta.url), "utf8"),
  );
  const fields = [
    "contract_version",
    "row_counts",
    "integrity_counts",
    "migration_history",
    "schema_inventory",
  ];
  const mismatches = fields.filter((field) => !isDeepStrictEqual(baseline[field], evidence[field]));
  saveJson(`${folder}/restored-baseline.json`, evidence);
  invariant(mismatches.length === 0, "RESTORE_COMPARISON_FAILED");
  invariant(
    Object.values(evidence.integrity_counts).every((n) => n === 0),
    "RESTORE_INTEGRITY_FAILED",
  );
  await restored.query("ROLLBACK");
  await restored.query("CHECKPOINT");
  await restored.end();
  restored = undefined;
  protection();
  const result = {
    result: "PASS_APPLICATION_LOGICAL_RESTORE",
    completedAt: new Date().toISOString(),
    archiveSha256: manifest.archive.sha256,
    database,
    listener: "127.0.0.1:55441",
    sourceMajor: 17,
    restoredMajor: 17,
    matchingFields: fields,
    matchedTableCounts: tables.length,
    integrityChecks: Object.keys(evidence.integrity_counts).length,
    rowCounts: evidence.row_counts,
    schemaCounts: evidence.schema_inventory.counts,
    ownershipMapping:
      "Restored public objects owned by medvault_restore_admin (--no-owner); source owners retained in archive; ACL/default-ACL commands executed against non-login local aliases, not production role equivalence",
    collation: {
      result: "REPORTED_SEPARATELY_NOT_WINDOWS_LINUX_EQUIVALENCE",
      source: baseline.collation_context.database,
      restored: evidence.collation_context.database,
    },
    physicalChecksumsAfterStop: "PENDING",
    durableKeyAndOffDeviceCustody: "PENDING_OPERATOR",
    hostedMutation: false,
    authAndStorageRecovery: "NOT_TESTED",
    applicationIntegration: "NOT_TESTED",
  };
  saveJson(`${folder}/restore-result.json`, result);
  protection();
  console.log(JSON.stringify(result));
} catch (error) {
  safeFailure(error, stage);
} finally {
  await restored?.end().catch(() => {});
  await admin?.end().catch(() => {});
}
