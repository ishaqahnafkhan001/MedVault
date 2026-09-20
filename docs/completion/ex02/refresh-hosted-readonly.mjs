// Fresh EX-02 hosted metadata/count snapshot. SELECT-only and no medical values.
// Never dumps data, changes a hosted object, or prints credentials/row contents.
// Requires process-only MEDVAULT_EX02_SOURCE_DATABASE_URL; never reads shared DATABASE_URL.
import { existsSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  Client,
  runRoot,
  tables,
  sourceConfig,
  sourceEnvironment,
  protection,
  invariant,
  saveJson,
  safeFailure,
} from "./recovery-common.mjs";

const folder = `${runRoot}/snapshot-20260912T055058Z`;
const evidenceArgument = process.argv[3];
const evidenceId = evidenceArgument?.startsWith("--evidence-id=")
  ? evidenceArgument.slice("--evidence-id=".length)
  : "refresh-20260919";
const evidencePath = `${folder}/hosted-readonly-${evidenceId}.json`;
let source;
let stage = "preflight";
try {
  invariant(
    (process.argv.length === 3 || process.argv.length === 4) &&
      process.argv[2] === "--refresh-reviewed-hosted-metadata" &&
      (process.argv.length === 3 || evidenceArgument?.startsWith("--evidence-id=")),
    "EXPLICIT_REFRESH_FLAG_REQUIRED",
  );
  invariant(/^[a-z0-9][a-z0-9-]{0,63}$/.test(evidenceId), "INVALID_EVIDENCE_ID");
  invariant(!existsSync(evidencePath), "HOSTED_REFRESH_ALREADY_RECORDED_INSPECT_FIRST");
  protection();
  const original = JSON.parse(readFileSync(`${folder}/source-baseline.json`, "utf8"));
  const config = sourceConfig(sourceEnvironment());
  source = new Client({ ...config, application_name: "medvault_ex02_readonly_refresh" });
  source.on("error", () => {});
  await source.connect();
  invariant(source.connection.stream.authorized === true, "CLIENT_TLS_NOT_AUTHORIZED");
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await source.query("SET LOCAL search_path=pg_catalog,public");
  await source.query("SET LOCAL idle_in_transaction_session_timeout='60s'");
  const {
    rows: [identity],
  } = await source.query(
    "SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::int AS version,current_setting('transaction_read_only') AS readonly",
  );
  invariant(
    identity.database === "postgres" &&
      identity.role === "postgres" &&
      identity.version >= 170000 &&
      identity.version < 180000 &&
      identity.readonly === "on",
    "HOSTED_IDENTITY_FAILED",
  );
  stage = "application-metadata";
  const {
    rows: [{ evidence: current }],
  } = await source.query(
    readFileSync(new URL("application-verification.sql", import.meta.url), "utf8"),
  );
  invariant(
    Object.values(current.integrity_counts).every((count) => count === 0),
    "CURRENT_APPLICATION_INTEGRITY_FAILED",
  );
  invariant(
    isDeepStrictEqual(current.schema_inventory, original.schema_inventory),
    "HOSTED_SCHEMA_DRIFTED_SINCE_BACKUP",
  );
  invariant(
    isDeepStrictEqual(current.migration_history, original.migration_history),
    "HOSTED_HISTORY_DRIFTED_SINCE_BACKUP",
  );
  const { rows: relations } = await source.query(
    "SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') ORDER BY c.relname",
  );
  invariant(
    isDeepStrictEqual(
      relations.map((row) => row.relname),
      tables,
    ),
    "HOSTED_RELATION_SET_CHANGED",
  );
  stage = "auth-storage-security-metadata";
  const {
    rows: [{ evidence: coverage }],
  } = await source.query(readFileSync(new URL("verification.sql", import.meta.url), "utf8"));
  invariant(
    Object.entries(coverage.integrity_counts).every(
      ([name, count]) => name === "storage_metadata_orphan_candidate" || count === 0,
    ),
    "HOSTED_EXTERNAL_INTEGRITY_FAILED",
  );
  invariant(
    coverage.summary_table_exists === false &&
      coverage.private_schema_exists === false &&
      coverage.public_policy_count === 0 &&
      coverage.public_routine_count === 0 &&
      coverage.public_user_trigger_count === 0 &&
      coverage.public_relations.every((relation) => relation.rls === false) &&
      coverage.effective_table_privileges.every(
        (grant) => grant.select && grant.insert && grant.update && grant.delete && grant.truncate,
      ) &&
      !coverage.roles.some((role) => role.name === "medvault_runtime"),
    "HOSTED_SECURITY_STATE_CHANGED_REVIEW_REQUIRED",
  );
  await source.query("ROLLBACK");
  await source.end();
  source = undefined;
  const evidence = {
    result: "PASS_HOSTED_READONLY_PREMUTATION_REFRESH",
    evidenceId,
    capturedAt: new Date().toISOString(),
    project: "ginzrzcgjmkrpkdywfds",
    database: "postgres",
    postgresMajor: 17,
    tlsCertificateAndHostnameVerified: true,
    transactionReadOnly: true,
    relationCount: relations.length,
    migrationCount: current.migration_history.length,
    schemaMatchesProtectedBackup: true,
    historyMatchesProtectedBackup: true,
    currentRowCounts: current.row_counts,
    applicationIntegrityCounts: current.integrity_counts,
    hostedCoverage: coverage,
    securityState: "UNCHANGED_UNSAFE_PREDEPLOY",
    hostedMutation: false,
    rowContentsCaptured: false,
  };
  saveJson(evidencePath, evidence);
  protection();
  console.log(
    JSON.stringify({
      result: evidence.result,
      relationCount: evidence.relationCount,
      migrationCount: evidence.migrationCount,
      schemaMatchesProtectedBackup: true,
      historyMatchesProtectedBackup: true,
      securityState: evidence.securityState,
      hostedMutation: false,
    }),
  );
} catch (error) {
  safeFailure(error, stage);
} finally {
  if (source) {
    await source.query("ROLLBACK").catch(() => {});
    await source.end().catch(() => {});
  }
}
