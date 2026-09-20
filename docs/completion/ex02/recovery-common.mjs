// One approved EX-02 recovery location, not a general migration utility.
import { spawnSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const repository = fileURLToPath(new URL("../../../", import.meta.url));
export const runRoot = "C:/Users/user/MedVault-Recovery/ex02-20260911";
export const pgBin = "C:/Users/user/MedVault-Recovery/tools/postgresql-17.11-3/pgsql/bin";
export const caPath = "C:/Users/user/MedVault-Recovery/certificates/supabase-prod-ca-2021.crt";
export const tables = [
  "_prisma_migrations",
  "episode_analyses",
  "episode_memberships",
  "episodes",
  "intake_logs",
  "medical_documents",
  "medication_schedules",
  "medications",
  "patient_profiles",
  "patients",
  "reminder_deliveries",
  "report_extractions",
  "report_measurements",
  "schedule_occurrences",
];
export const { Client } = createRequire(
  new URL("../../../packages/database/package.json", import.meta.url),
)("pg");
export function invariant(condition, code) {
  if (!condition) throw new Error(code);
}
export function protection() {
  const check = spawnSync(
    "pwsh.exe",
    [
      "-NoProfile",
      "-File",
      fileURLToPath(new URL("assert-recovery-protection.ps1", import.meta.url)),
      "-Quiet",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  invariant(check.status === 0, "PROTECTION_CHECK_FAILED");
}
export function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function archiveTocRecords(toc) {
  return toc
    .replaceAll("\r", "")
    .split("\n")
    .filter((line) => /^\d+; \d+ \d+ /.test(line))
    .map((line) => line.replace(/^\d+; \d+ \d+ /, ""));
}
export function allowlistedRestoreToc(toc) {
  const records = archiveTocRecords(toc);
  const allowed = (record) =>
    /^SCHEMA - public pg_database_owner$/.test(record) ||
    /^(COMMENT|ACL) - SCHEMA public pg_database_owner$/.test(record) ||
    /^TYPE public \S+ postgres$/.test(record) ||
    /^TABLE public \S+ postgres$/.test(record) ||
    /^ACL public TABLE \S+ postgres$/.test(record) ||
    /^TABLE DATA public \S+ postgres$/.test(record) ||
    /^CONSTRAINT public \S+ \S+ postgres$/.test(record) ||
    /^INDEX public \S+ postgres$/.test(record) ||
    /^FK CONSTRAINT public \S+ \S+ postgres$/.test(record) ||
    /^DEFAULT ACL public DEFAULT PRIVILEGES FOR (SEQUENCES|FUNCTIONS|TABLES) (postgres|supabase_admin)$/.test(
      record,
    );
  return records.length > 0 && records.every(allowed);
}
export function saveJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
export function sourceConfig(values) {
  const sourceDatabaseUrl = values.MEDVAULT_EX02_SOURCE_DATABASE_URL?.trim();
  invariant(sourceDatabaseUrl, "PROCESS_SOURCE_DATABASE_URL_REQUIRED");
  const url = new URL(sourceDatabaseUrl);
  invariant(
    url.protocol === "postgresql:" || url.protocol === "postgres:",
    "SOURCE_PROTOCOL_MISMATCH",
  );
  invariant(
    url.hostname === "aws-0-ap-south-1.pooler.supabase.com" &&
      url.port === "5432" &&
      url.pathname === "/postgres" &&
      decodeURIComponent(url.username) === "postgres.ginzrzcgjmkrpkdywfds" &&
      !url.search &&
      !url.hash,
    "SOURCE_IDENTITY_MISMATCH",
  );
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    invariant(
      new URL(values[key]).origin === "https://ginzrzcgjmkrpkdywfds.supabase.co",
      "AUTH_STORAGE_ALIGNMENT_FAILED",
    );
  }
  const ca = readFileSync(caPath, "utf8");
  const cert = new X509Certificate(ca);
  invariant(
    cert.ca &&
      cert.fingerprint256 ===
        "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA" &&
      Date.parse(cert.validTo) > Date.now() &&
      Date.parse(cert.validFrom) < Date.now(),
    "TRUSTED_CA_CHECK_FAILED",
  );
  return {
    host: url.hostname,
    port: Number(url.port),
    database: "postgres",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    application_name: "medvault_ex02_readonly_backup",
  };
}
export function sourceEnvironment() {
  try {
    statSync(`${repository}/.env.local`);
    throw new Error("LOCAL_ENV_REAPPEARED");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  invariant(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "TLS_BYPASS_ENVIRONMENT_FORBIDDEN");
  const applicationEnvironment = parseEnv(readFileSync(`${repository}/.env`, "utf8"));
  invariant(
    !applicationEnvironment.MIGRATION_DATABASE_URL?.trim(),
    "MIGRATION_CREDENTIAL_IN_SHARED_ENV_FORBIDDEN",
  );
  return {
    MEDVAULT_EX02_SOURCE_DATABASE_URL: process.env.MEDVAULT_EX02_SOURCE_DATABASE_URL,
    SUPABASE_URL: applicationEnvironment.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: applicationEnvironment.NEXT_PUBLIC_SUPABASE_URL,
  };
}
export function localConfig(database = "postgres") {
  invariant(
    ["postgres", "medvault_ex02_restore_20260912"].includes(database),
    "RESTORE_DATABASE_NOT_ALLOWLISTED",
  );
  return {
    host: "127.0.0.1",
    port: 55441,
    database,
    user: "medvault_restore_admin",
    password: readFileSync(`${runRoot}/restore-admin.password`, "utf8"),
    ssl: false,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  };
}
export async function assertLocal(client, expectedDatabase) {
  const {
    rows: [r],
  } = await client.query(
    "SELECT current_database() AS database,current_setting('data_directory') AS data,current_setting('server_version_num')::int AS version,host(inet_server_addr()) AS host,inet_server_port() AS port,current_user AS role,current_setting('data_checksums') AS checksums,current_setting('listen_addresses') AS listen_addresses,pg_is_in_recovery() AS recovery",
  );
  invariant(
    r.database === expectedDatabase &&
      r.data.replaceAll("\\", "/") === `${runRoot}/pgdata` &&
      r.version >= 170000 &&
      r.version < 180000 &&
      r.host === "127.0.0.1" &&
      r.port === 55441 &&
      r.role === "medvault_restore_admin" &&
      r.checksums === "on" &&
      r.listen_addresses === "127.0.0.1" &&
      r.recovery === false,
    "RESTORE_IDENTITY_FAILED",
  );
}
export function libpqEnvironment(config, remote) {
  const env = {};
  // No inherited PG* service/default options or unrelated application secrets.
  for (const key of ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    PGHOST: config.host,
    PGPORT: String(config.port),
    PGDATABASE: config.database,
    PGUSER: config.user,
    PGPASSWORD: config.password,
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "medvault_ex02_recovery",
    PGSSLMODE: remote ? "verify-full" : "disable",
    PGOPTIONS: remote
      ? "-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000"
      : "-c statement_timeout=60000 -c lock_timeout=5000",
  });
  if (remote) env.PGSSLROOTCERT = caPath;
  return env;
}
export function pgCommand(binary, args, env) {
  const result = spawnSync(`${pgBin}/${binary}.exe`, args, {
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  invariant(result.status === 0, `${binary.toUpperCase()}_FAILED`);
  // Never echo stderr: COPY errors can include medical values. Retain archive on failure.
  invariant(!result.stderr?.trim(), `${binary.toUpperCase()}_UNREVIEWED_WARNING`);
  return result.stdout;
}
export function safeFailure(error, stage) {
  console.error(
    JSON.stringify({
      result: "FAIL",
      stage,
      code: /^[A-Z0-9_]+$/.test(error.code ?? "")
        ? error.code
        : /^[A-Z0-9_]+$/.test(error.message ?? "")
          ? error.message
          : "REDACTED_ERROR",
      hostedMutation: false,
    }),
  );
  process.exitCode = 1;
}
