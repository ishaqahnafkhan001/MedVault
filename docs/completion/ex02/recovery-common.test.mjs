import test from "node:test";
import assert from "node:assert/strict";
import {
  sourceConfig,
  localConfig,
  assertLocal,
  libpqEnvironment,
  pgCommand,
  allowlistedRestoreToc,
  archiveTocRecords,
  runRoot,
} from "./recovery-common.mjs";

const source = {
  MEDVAULT_EX02_SOURCE_DATABASE_URL:
    "postgresql://postgres.ginzrzcgjmkrpkdywfds:synthetic-not-a-credential@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
  SUPABASE_URL: "https://ginzrzcgjmkrpkdywfds.supabase.co",
  NEXT_PUBLIC_SUPABASE_URL: "https://ginzrzcgjmkrpkdywfds.supabase.co",
};
for (const [name, patch] of [
  [
    "localhost",
    {
      MEDVAULT_EX02_SOURCE_DATABASE_URL: source.MEDVAULT_EX02_SOURCE_DATABASE_URL.replace(
        "aws-0-ap-south-1.pooler.supabase.com",
        "localhost",
      ),
    },
  ],
  [
    "transaction pooler",
    {
      MEDVAULT_EX02_SOURCE_DATABASE_URL: source.MEDVAULT_EX02_SOURCE_DATABASE_URL.replace(
        ":5432/",
        ":6543/",
      ),
    },
  ],
  [
    "other database",
    {
      MEDVAULT_EX02_SOURCE_DATABASE_URL: source.MEDVAULT_EX02_SOURCE_DATABASE_URL.replace(
        "/postgres",
        "/other",
      ),
    },
  ],
  [
    "other project",
    {
      MEDVAULT_EX02_SOURCE_DATABASE_URL: source.MEDVAULT_EX02_SOURCE_DATABASE_URL.replace(
        "postgres.ginzrzcgjmkrpkdywfds",
        "postgres.other",
      ),
    },
  ],
  [
    "SSL override",
    {
      MEDVAULT_EX02_SOURCE_DATABASE_URL:
        source.MEDVAULT_EX02_SOURCE_DATABASE_URL + "?sslmode=disable",
    },
  ],
  [
    "fragment",
    { MEDVAULT_EX02_SOURCE_DATABASE_URL: source.MEDVAULT_EX02_SOURCE_DATABASE_URL + "#other" },
  ],
  [
    "wrong protocol",
    {
      MEDVAULT_EX02_SOURCE_DATABASE_URL: source.MEDVAULT_EX02_SOURCE_DATABASE_URL.replace(
        "postgresql:",
        "http:",
      ),
    },
  ],
  ["Auth mismatch", { SUPABASE_URL: "https://other.supabase.co" }],
  ["browser mismatch", { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }],
]) {
  test(`source rejects ${name} before connecting`, () =>
    assert.throws(() => sourceConfig({ ...source, ...patch })));
}
test("source requires a process-only database credential", () =>
  assert.throws(
    () => sourceConfig({ ...source, MEDVAULT_EX02_SOURCE_DATABASE_URL: undefined }),
    /PROCESS_SOURCE_DATABASE_URL_REQUIRED/,
  ));
test("unapproved restore database rejected before credential read", () =>
  assert.throws(() => localConfig("production"), /NOT_ALLOWLISTED/));
const identity = {
  database: "medvault_ex02_restore_20260912",
  data: `${runRoot}/pgdata`,
  version: 170011,
  host: "127.0.0.1",
  port: 55441,
  role: "medvault_restore_admin",
  checksums: "on",
  listen_addresses: "127.0.0.1",
  recovery: false,
};
for (const [key, value] of Object.entries({
  database: "postgres",
  data: "C:/legacy/pgdata",
  version: 180006,
  host: "192.168.1.1",
  port: 5432,
  role: "postgres",
  checksums: "off",
  listen_addresses: "*",
  recovery: true,
})) {
  test(`restore refuses wrong ${key}`, async () => {
    const fake = { query: async () => ({ rows: [{ ...identity, [key]: value }] }) };
    await assert.rejects(assertLocal(fake, identity.database), /RESTORE_IDENTITY_FAILED/);
  });
}
test("exact local identity accepted without issuing writes", async () => {
  let query;
  await assertLocal(
    {
      query: async (sql) => {
        query = sql;
        return { rows: [identity] };
      },
    },
    identity.database,
  );
  assert.match(query, /^SELECT /);
});
test("libpq remote connections require verified TLS and read-only defaults", () => {
  const env = libpqEnvironment(
    {
      host: "synthetic",
      port: 5432,
      user: "synthetic",
      password: "synthetic",
      database: "synthetic",
    },
    true,
  );
  assert.equal(env.PGSSLMODE, "verify-full");
  assert.ok(env.PGSSLROOTCERT.endsWith("supabase-prod-ca-2021.crt"));
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.equal(env.PGSERVICE, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined);
});
test("local libpq is explicit and does not inherit a service alias", () => {
  const env = libpqEnvironment(
    {
      host: "127.0.0.1",
      port: 55441,
      user: "synthetic",
      password: "synthetic",
      database: identity.database,
    },
    false,
  );
  assert.equal(env.PGHOST, "127.0.0.1");
  assert.equal(env.PGPORT, "55441");
  assert.equal(env.PGSSLMODE, "disable");
  assert.equal(env.PGSERVICEFILE, undefined);
});
test("the exact reviewed archive has only allowlisted TOC records", () => {
  const toc = pgCommand(
    "pg_restore",
    ["--list", `${runRoot}/snapshot-20260912T055058Z/public-data.dump`],
    {},
  );
  assert.equal(allowlistedRestoreToc(toc), true);
  assert.equal(archiveTocRecords(toc).length, 112);
});
test("unexpected executable TOC records are rejected", () => {
  assert.equal(allowlistedRestoreToc("1; 1255 42 FUNCTION public unsafe() postgres\n"), false);
});
