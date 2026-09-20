// READ-ONLY hosted source. Generated artifacts stay in the approved encrypted tree.
// Does not restore, migrate, alter Auth/Storage/queues, or edit environment files.
// Requires process-only MEDVAULT_EX02_SOURCE_DATABASE_URL; never reads shared DATABASE_URL.
import { mkdirSync, readFileSync, statSync } from "node:fs";
import {
  Client,
  runRoot,
  tables,
  sourceConfig,
  sourceEnvironment,
  protection,
  invariant,
  saveJson,
  digest,
  libpqEnvironment,
  pgCommand,
  safeFailure,
} from "./recovery-common.mjs";

let source;
let stage = "preflight";
try {
  invariant(
    process.argv.length === 3 && process.argv[2] === "--create-backup",
    "EXPLICIT_BACKUP_FLAG_REQUIRED",
  );
  protection();
  const config = sourceConfig(sourceEnvironment());
  source = new Client(config);
  source.on("error", () => {});
  await source.connect();
  invariant(source.connection.stream.authorized === true, "CLIENT_TLS_NOT_AUTHORIZED");
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await source.query("SET LOCAL search_path=pg_catalog,public");
  await source.query("SET LOCAL idle_in_transaction_session_timeout='120s'");
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
  const { rows: relations } = await source.query(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f') ORDER BY c.relname",
  );
  invariant(
    JSON.stringify(relations.map((r) => r.relname)) === JSON.stringify(tables),
    "SOURCE_TABLE_SET_CHANGED",
  );
  const {
    rows: [objects],
  } = await source.query(
    "SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')::int AS routines,(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal)::int AS triggers",
  );
  invariant(objects.routines === 0 && objects.triggers === 0, "SOURCE_EXECUTABLE_OBJECTS_CHANGED");
  const query = readFileSync(new URL("application-verification.sql", import.meta.url), "utf8");
  const {
    rows: [{ evidence: baseline }],
  } = await source.query(query);
  invariant(
    Object.values(baseline.integrity_counts).every((n) => n === 0),
    "SOURCE_INTEGRITY_FAILED",
  );
  invariant(
    Object.values(baseline.schema_inventory.unsupported_object_counts).every((n) => n === 0),
    "SOURCE_UNSUPPORTED_OBJECTS",
  );
  const {
    rows: [{ evidence: hosted }],
  } = await source.query(readFileSync(new URL("verification.sql", import.meta.url), "utf8"));
  invariant(
    Object.entries(hosted.integrity_counts).every(
      ([key, count]) => key === "storage_metadata_orphan_candidate" || count === 0,
    ),
    "EXTERNAL_RELATIONSHIP_FAILED",
  );
  const {
    rows: [{ snapshot }],
  } = await source.query("SELECT pg_export_snapshot() AS snapshot");
  invariant(/^[0-9A-F-]+$/.test(snapshot), "SNAPSHOT_FORMAT_FAILED");
  const captured = new Date().toISOString();
  const folder = `${runRoot}/snapshot-${captured.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`;
  mkdirSync(folder);
  protection();
  saveJson(`${folder}/source-baseline.json`, baseline);
  saveJson(`${folder}/source-hosted-coverage.json`, hosted);
  const env = libpqEnvironment(config, true);
  const common = [
    "--no-password",
    "--schema=public",
    "--strict-names",
    "--no-large-objects",
    "--no-publications",
    "--no-subscriptions",
    "--lock-wait-timeout=5000",
    `--snapshot=${snapshot}`,
  ];
  stage = "schema-export";
  pgCommand("pg_dump", [...common, "--schema-only", `--file=${folder}/public-schema.sql`], env);
  stage = "custom-backup";
  pgCommand("pg_dump", [...common, "--format=custom", `--file=${folder}/public-data.dump`], env);
  await source.query("ROLLBACK");
  await source.end();
  source = undefined;
  stage = "archive-verification";
  const dump = `${folder}/public-data.dump`;
  const schema = `${folder}/public-schema.sql`;
  invariant(statSync(dump).size > 0 && statSync(schema).size > 0, "EMPTY_BACKUP_FILE");
  const toc = pgCommand("pg_restore", ["--list", dump], env).replaceAll("\r", "");
  const archived = [...toc.matchAll(/^\d+; \d+ \d+ TABLE DATA public (\S+) \S+$/gm)]
    .map((m) => m[1])
    .sort();
  invariant(JSON.stringify(archived) === JSON.stringify(tables), "ARCHIVE_TABLE_DATA_SET_MISMATCH");
  const manifest = {
    formatVersion: 1,
    result: "BACKUP_CREATED_RESTORE_PENDING",
    capturedAt: captured,
    project: "ginzrzcgjmkrpkdywfds",
    sourceDatabase: "postgres",
    sourceMajor: 17,
    clientTlsVerified: true,
    sourceReadOnly: true,
    sharedSnapshot: true,
    scope:
      "public application schema and rows including Prisma history; excludes Auth accounts, Storage bytes, roles/passwords, Redis",
    archive: {
      name: "public-data.dump",
      bytes: statSync(dump).size,
      sha256: digest(dump),
      tableDataEntries: archived.length,
    },
    schema: { name: "public-schema.sql", bytes: statSync(schema).size, sha256: digest(schema) },
    baselineSha256: digest(`${folder}/source-baseline.json`),
    rowCounts: baseline.row_counts,
    restore: "NOT_RUN",
    efsKeyExportAndOffDeviceCustody: "PENDING_OPERATOR",
  };
  saveJson(`${folder}/backup-manifest.json`, manifest);
  protection();
  console.log(JSON.stringify({ ...manifest, folder }));
} catch (error) {
  safeFailure(error, stage);
} finally {
  if (source) {
    await source.query("ROLLBACK").catch(() => {});
    await source.end().catch(() => {});
  }
}
