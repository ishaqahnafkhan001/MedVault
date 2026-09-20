// Synthetic-only probe. Never loads .env or connects to a hosted service.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(new URL("../../../packages/database/package.json", import.meta.url));
const { Client } = require("pg");
const root = "C:/Users/user/MedVault-Recovery/ex02-20260911";
const config = {
  host: "127.0.0.1",
  port: 55441,
  user: "medvault_restore_admin",
  password: readFileSync(`${root}/restore-admin.password`, "utf8"),
  database: "postgres",
  ssl: false,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
};
function protection() {
  const result = spawnSync(
    "pwsh.exe",
    [
      "-NoProfile",
      "-File",
      fileURLToPath(new URL("assert-recovery-protection.ps1", import.meta.url)),
      "-Quiet",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  if (result.status !== 0) throw new Error("PROTECTION_CHECK_FAILED");
}
async function identity(client) {
  const {
    rows: [row],
  } = await client.query(
    "SELECT current_setting('data_directory') AS data, current_setting('server_version_num')::int AS version, host(inet_server_addr()) AS host, inet_server_port() AS port, current_user AS role, current_setting('data_checksums') AS checksums",
  );
  if (
    row.data.replaceAll("\\", "/") !== `${root}/pgdata` ||
    row.version < 170000 ||
    row.version >= 180000 ||
    row.host !== "127.0.0.1" ||
    row.port !== 55441 ||
    row.role !== config.user ||
    row.checksums !== "on"
  )
    throw new Error("ISOLATION_IDENTITY_FAILED");
}
let admin, client;
try {
  protection();
  const wrong = new Client({ ...config, password: "synthetic-deliberately-invalid" });
  try {
    await wrong.connect();
    throw new Error("WRONG_PASSWORD_ACCEPTED");
  } catch (error) {
    if (error.code !== "28P01") throw error;
  } finally {
    await wrong.end();
  }
  admin = new Client(config);
  await admin.connect();
  await identity(admin);
  const hba = await admin.query(
    "SELECT count(*)::int AS unsafe FROM pg_hba_file_rules WHERE error IS NOT NULL OR auth_method <> 'scram-sha-256'",
  );
  if (hba.rows[0].unsafe !== 0) throw new Error("HBA_NOT_SCRAM_ONLY");
  const existing = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname='medvault_ex02_synthetic'",
  );
  if (existing.rowCount) throw new Error("SYNTHETIC_DATABASE_ALREADY_EXISTS_INSPECT_FIRST");
  await admin.query("CREATE DATABASE medvault_ex02_synthetic TEMPLATE template0");
  client = new Client({ ...config, database: "medvault_ex02_synthetic" });
  await client.connect();
  await identity(client);
  await client.query(
    "CREATE TABLE public.encryption_probe (id integer PRIMARY KEY, payload text NOT NULL)",
  );
  protection();
  await client.query(
    "ALTER TABLE public.encryption_probe ALTER COLUMN payload SET STORAGE EXTERNAL",
  );
  await client.query(
    "INSERT INTO public.encryption_probe SELECT n, repeat(md5(n::text), 256) FROM generate_series(1,1024) n",
  );
  await client.query(
    "UPDATE public.encryption_probe SET payload=payload || 'synthetic' WHERE id%2=0",
  );
  await client.query("CHECKPOINT");
  await client.query("VACUUM public.encryption_probe");
  await client.query("SET work_mem='64kB'");
  await client.query(
    "SELECT count(*) FROM (SELECT n,md5(n::text) FROM generate_series(1,50000) n ORDER BY md5(n::text)) synthetic_sort",
  );
  protection();
  await client.end();
  client = new Client({ ...config, database: "medvault_ex02_synthetic" });
  await client.connect();
  await identity(client);
  const {
    rows: [result],
  } = await client.query(
    "SELECT count(*)::int AS rows, count(*) FILTER(WHERE length(payload) NOT IN(8192,8201))::int AS invalid FROM public.encryption_probe",
  );
  if (result.rows !== 1024 || result.invalid !== 0) throw new Error("SYNTHETIC_RELOAD_FAILED");
  console.log(
    JSON.stringify({
      result: "PASS",
      syntheticRows: 1024,
      wrongPasswordDenied: true,
      scramOnly: true,
      pageChecksums: true,
      freshConnectionReload: true,
      encryptedTreeScans: 3,
      hostedConnections: 0,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      result: "FAIL",
      code: /^[A-Z0-9_]+$/.test(error.code ?? "") ? error.code : "LOCAL_PROBE_FAILED",
      stage: /^[A-Z0-9_]+$/.test(error.message) ? error.message : "REDACTED",
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
  await admin?.end();
}
