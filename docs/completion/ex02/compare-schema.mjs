// Offline, fail-closed comparison for the first two MedVault migrations only.
// No connection, environment loading, SQL execution or output-file writes.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const migrationPaths = [
  "packages/database/prisma/migrations/20260807000000_initial/migration.sql",
  "packages/database/prisma/migrations/20260908000000_capture_existing_episode_medication_schema/migration.sql",
];

function fail(message) {
  throw new Error(message);
}

// Tokens retain quoted identifiers and literal case. Comments are recognized only
// outside quoted text. Unknown syntax is an error, never silently discarded.
function lex(sql) {
  const tokens = [];
  let offset = 0;
  while (offset < sql.length) {
    const rest = sql.slice(offset);
    const match = /^(?:\s+|--[^\r\n]*(?:\r?\n|$))/.exec(rest);
    if (match) {
      offset += match[0].length;
      continue;
    }
    const token =
      /^(?:"(?:[^"]|"")*"|'(?:[^']|'')*'|::|[A-Za-z_][A-Za-z_0-9]*|[0-9]+|[(),;.[\]=])/.exec(rest);
    if (!token) fail(`Unsupported SQL token at offset ${offset}`);
    tokens.push(token[0]);
    offset += token[0].length;
  }
  return tokens;
}

class Parser {
  constructor(sql) {
    this.tokens = lex(sql);
    this.index = 0;
  }
  peek() {
    return this.tokens[this.index];
  }
  take() {
    if (this.index === this.tokens.length) fail("Unexpected SQL end");
    return this.tokens[this.index++];
  }
  eat(value) {
    if (this.peek()?.toUpperCase() !== value) return false;
    this.index++;
    return true;
  }
  need(value) {
    if (!this.eat(value)) fail(`Expected ${value} at token ${this.index}`);
  }
  done() {
    if (this.index !== this.tokens.length) fail("Unsupported trailing SQL syntax");
  }
  identifier() {
    const value = this.take();
    if (/^"[A-Za-z_][A-Za-z_0-9]*"$/.test(value)) return value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(value)) return value.toLowerCase();
    fail("Unsupported identifier syntax");
  }
  relation() {
    const first = this.identifier();
    if (!this.eat(".")) return first;
    if (first !== "public") fail("Only the public schema is supported");
    return this.identifier();
  }
  literal() {
    const token = this.take();
    if (!/^'(?:[^']|'')*'$/.test(token)) fail("Expected SQL string literal");
    return token.slice(1, -1).replaceAll("''", "'");
  }
  list(item) {
    this.need("(");
    const result = [item()];
    while (this.eat(",")) result.push(item());
    this.need(")");
    return result;
  }
  type() {
    const token = this.take();
    if (/^"[A-Za-z_][A-Za-z_0-9]*"$/.test(token)) return token;
    let type = token.toLowerCase();
    if (type === "double") {
      this.need("PRECISION");
      return "double precision";
    }
    if (type === "character" && this.eat("VARYING")) type = "varchar";
    if (type === "char") type = "character";
    if (["varchar", "character", "timestamp"].includes(type)) {
      let size = null;
      if (this.eat("(")) {
        size = this.take();
        if (!/^[1-9][0-9]*$/.test(size)) fail("Unsupported type precision");
        this.need(")");
      }
      if (type === "timestamp") {
        if (size === null) fail("Explicit timestamp precision required");
        if (this.eat("WITHOUT")) {
          this.need("TIME");
          this.need("ZONE");
        }
        return `timestamp(${size}) without time zone`;
      }
      return `${type === "varchar" ? "character varying" : type}${size === null ? "" : `(${size})`}`;
    }
    if (!["uuid", "date", "text", "integer", "boolean", "jsonb"].includes(type)) {
      fail("Unsupported SQL type");
    }
    if (this.eat("[")) {
      this.need("]");
      if (type !== "text") fail("Only text arrays supported");
      type += "[]";
    }
    return type;
  }
  defaultValue(type) {
    if (this.eat("CURRENT_TIMESTAMP")) return { expression: "CURRENT_TIMESTAMP" };
    if (this.eat("ARRAY")) {
      this.need("[");
      this.need("]");
      this.need("::");
      const cast = this.type();
      if (type !== "text[]" || cast !== type) fail("Unsupported array default");
      return { expression: "empty-text-array" };
    }
    let value;
    if (this.peek()?.startsWith("'")) {
      value = this.literal();
      // PostgreSQL annotates these untyped migration literals with a cast.
      const cast = this.eat("::") ? this.type() : type.replace(/\([0-9]+\)$/, "");
      if (cast !== type.replace(/\([0-9]+\)$/, "")) fail("Unexpected literal default cast");
      if (!type.startsWith('"') && !type.startsWith("character varying(")) {
        fail("Unsupported literal default type");
      }
      return { literal: value, type: cast };
    }
    value = this.take();
    if (type === "integer" && /^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value)))
      return { integer: Number(value) };
    if (type === "boolean" && /^(true|false)$/i.test(value))
      return { boolean: value.toLowerCase() === "true" };
    fail("Unsupported default expression");
  }
}

function parseConstraint(parser) {
  if (parser.eat("PRIMARY")) {
    parser.need("KEY");
    return { kind: "p", columns: parser.list(() => parser.identifier()) };
  }
  parser.need("FOREIGN");
  parser.need("KEY");
  const columns = parser.list(() => parser.identifier());
  parser.need("REFERENCES");
  const target = parser.relation();
  const targetColumns = parser.list(() => parser.identifier());
  const actions = { update: "NO ACTION", delete: "NO ACTION" };
  const seen = new Set();
  while (parser.eat("ON")) {
    const operation = parser.take().toLowerCase();
    if (!["update", "delete"].includes(operation) || seen.has(operation))
      fail("Unsupported FK action");
    seen.add(operation);
    let action = parser.take().toUpperCase();
    if (action === "SET" || action === "NO") action += ` ${parser.take().toUpperCase()}`;
    if (!["CASCADE", "RESTRICT", "SET NULL", "SET DEFAULT", "NO ACTION"].includes(action))
      fail("Unsupported FK action");
    actions[operation] = action;
  }
  return { kind: "f", columns, target, targetColumns, ...actions };
}

function parseIndex(parser) {
  parser.need("CREATE");
  const unique = parser.eat("UNIQUE");
  parser.need("INDEX");
  const name = parser.identifier();
  parser.need("ON");
  const table = parser.relation();
  if (parser.eat("USING")) parser.need("BTREE");
  const columns = parser.list(() => {
    const column = parser.identifier();
    let direction = "ASC";
    if (parser.eat("DESC")) direction = "DESC";
    else parser.eat("ASC");
    let nulls = direction === "DESC" ? "FIRST" : "LAST";
    if (parser.eat("NULLS")) {
      nulls = parser.take().toUpperCase();
      if (!["FIRST", "LAST"].includes(nulls)) fail("Unsupported index null ordering");
    }
    return { column, direction, nulls };
  });
  return { name, table, unique, method: "btree", columns };
}

function emptySchema() {
  return { columns: [], constraints: [], indexes: [], enums: [] };
}

export function parseMigrations(sources) {
  const result = emptySchema();
  const tables = new Set();
  const enumNames = new Set();
  for (const sql of sources) {
    const parser = new Parser(sql);
    let inTransaction = false;
    while (parser.peek()) {
      if (parser.eat("BEGIN")) {
        if (inTransaction) fail("Nested transaction");
        inTransaction = true;
      } else if (parser.eat("COMMIT")) {
        if (!inTransaction) fail("COMMIT without BEGIN");
        inTransaction = false;
      } else if (parser.eat("SET")) {
        parser.need("LOCAL");
        parser.need("LOCK_TIMEOUT");
        parser.need("=");
        if (!inTransaction || parser.literal() !== "5s") fail("Unsupported session statement");
      } else if (parser.eat("ALTER")) {
        parser.need("TABLE");
        const table = parser.relation();
        if (!tables.has(table)) fail("FK table missing from source");
        parser.need("ADD");
        parser.need("CONSTRAINT");
        const name = parser.identifier();
        const definition = parseConstraint(parser);
        if (definition.kind !== "f") fail("Only FK ALTER supported");
        result.constraints.push({
          table,
          name,
          ...definition,
          validated: true,
          deferrable: false,
          initially_deferred: false,
        });
      } else if (parser.eat("CREATE")) {
        if (parser.eat("SCHEMA")) {
          parser.need("IF");
          parser.need("NOT");
          parser.need("EXISTS");
          if (parser.identifier() !== "public") fail("Unexpected schema");
        } else if (parser.eat("TYPE")) {
          const name = parser.identifier();
          if (enumNames.has(name)) fail("Duplicate enum declaration");
          enumNames.add(name);
          parser.need("AS");
          parser.need("ENUM");
          parser
            .list(() => parser.literal())
            .forEach((label, index) => result.enums.push({ name, label, order: index + 1 }));
        } else if (parser.eat("TABLE")) {
          const table = parser.relation();
          if (tables.has(table)) fail("Duplicate table declaration");
          tables.add(table);
          let ordinal = 0;
          parser.list(() => {
            if (parser.eat("CONSTRAINT")) {
              const name = parser.identifier();
              const definition = parseConstraint(parser);
              if (definition.kind !== "p") fail("Only inline PK supported");
              result.constraints.push({
                table,
                name,
                ...definition,
                validated: true,
                deferrable: false,
                initially_deferred: false,
              });
              result.indexes.push({
                table,
                name,
                unique: true,
                method: "btree",
                columns: definition.columns.map((column) => ({
                  column,
                  direction: "ASC",
                  nulls: "LAST",
                })),
                valid: true,
                ready: true,
              });
            } else {
              const column = parser.identifier();
              const type = parser.type();
              const not_null = parser.eat("NOT");
              if (not_null) parser.need("NULL");
              const defaultValue = parser.eat("DEFAULT") ? parser.defaultValue(type) : null;
              result.columns.push({
                table,
                column,
                position: ++ordinal,
                type,
                not_null,
                default: defaultValue,
                identity: "",
                generated: "",
              });
            }
          });
        } else {
          parser.index--;
          result.indexes.push({ ...parseIndex(parser), valid: true, ready: true });
        }
      } else fail("Unsupported SQL statement");
      parser.need(";");
    }
    if (inTransaction) fail("Unclosed transaction");
  }
  return result;
}

function exactKeys(row, keys) {
  if (!row || typeof row !== "object" || Object.keys(row).sort().join() !== [...keys].sort().join())
    fail("Unexpected snapshot metadata shape");
}

function requireBoolean(value) {
  if (typeof value !== "boolean") fail("Expected boolean metadata");
}

export function parseSnapshot(snapshot) {
  const result = emptySchema();
  for (const section of Object.keys(result)) {
    if (!Array.isArray(snapshot[section])) fail(`Missing snapshot ${section}`);
  }
  for (const row of snapshot.columns) {
    exactKeys(row, [
      "table",
      "column",
      "position",
      "type",
      "not_null",
      "default",
      "identity",
      "generated",
    ]);
    const typeParser = new Parser(row.type);
    const type = typeParser.type();
    typeParser.done();
    requireBoolean(row.not_null);
    if (!Number.isInteger(row.position) || row.position < 1) fail("Invalid column ordinal");
    if (typeof row.identity !== "string" || typeof row.generated !== "string")
      fail("Invalid generated/identity metadata");
    let defaultValue = null;
    if (row.default !== null) {
      const parser = new Parser(row.default);
      defaultValue = parser.defaultValue(type);
      parser.done();
    }
    result.columns.push({ ...row, type, default: defaultValue });
  }
  for (const row of snapshot.constraints) {
    exactKeys(row, [
      "table",
      "name",
      "kind",
      "definition",
      "validated",
      "deferrable",
      "initially_deferred",
    ]);
    const parser = new Parser(row.definition);
    const definition = parseConstraint(parser);
    parser.done();
    if (definition.kind !== row.kind) fail("Constraint kind disagrees with definition");
    for (const key of ["validated", "deferrable", "initially_deferred"]) requireBoolean(row[key]);
    const { definition: ignored, ...rest } = row;
    void ignored;
    result.constraints.push({ ...rest, ...definition });
  }
  for (const row of snapshot.indexes) {
    exactKeys(row, ["table", "name", "definition", "valid", "ready"]);
    const parser = new Parser(row.definition);
    const definition = parseIndex(parser);
    parser.done();
    if (definition.name !== row.name || definition.table !== row.table)
      fail("Index metadata disagrees with definition");
    requireBoolean(row.valid);
    requireBoolean(row.ready);
    result.indexes.push({ ...definition, valid: row.valid, ready: row.ready });
  }
  for (const row of snapshot.enums) {
    exactKeys(row, ["name", "label", "order"]);
    if (
      typeof row.name !== "string" ||
      typeof row.label !== "string" ||
      !Number.isFinite(row.order)
    )
      fail("Invalid enum metadata");
    result.enums.push({ ...row });
  }
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  return value;
}

export function compareSchemas(sources, snapshot) {
  const expected = parseMigrations(sources);
  const actual = parseSnapshot(snapshot);
  const differences = [];
  const counts = {};
  for (const section of Object.keys(expected)) {
    const keyOf =
      section === "enums"
        ? (row) => `${row.name}.${row.label}`
        : section === "columns"
          ? (row) => `${row.table}.${row.column}`
          : (row) => `${row.table}.${row.name}`;
    const map = (rows) => {
      const entries = new Map();
      for (const row of rows) {
        const key = keyOf(row);
        if (entries.has(key)) fail(`Duplicate ${section} metadata key`);
        entries.set(key, row);
      }
      return entries;
    };
    const left = map(expected[section]);
    const right = map(actual[section]);
    counts[section] = { expected: left.size, snapshot: right.size };
    for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      if (!left.has(key)) differences.push({ section, key, kind: "unexpected" });
      else if (!right.has(key)) differences.push({ section, key, kind: "missing" });
      else {
        const expectedRow = left.get(key);
        const actualRow = right.get(key);
        for (const field of new Set([...Object.keys(expectedRow), ...Object.keys(actualRow)])) {
          if (
            JSON.stringify(stable(expectedRow[field])) !== JSON.stringify(stable(actualRow[field]))
          ) {
            differences.push({
              section,
              key,
              field,
              kind: "changed",
              expected: expectedRow[field],
              snapshot: actualRow[field],
            });
          }
        }
      }
    }
  }
  counts.tables = {
    expected: new Set(expected.columns.map((row) => row.table)).size,
    snapshot: new Set(actual.columns.map((row) => row.table)).size,
  };
  counts.enumTypes = {
    expected: new Set(expected.enums.map((row) => row.name)).size,
    snapshot: new Set(actual.enums.map((row) => row.name)).size,
  };
  return {
    status: differences.length ? "DIFFERENT" : "MATCH_WITHIN_CAPTURED_SCOPE",
    counts,
    differences,
  };
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function runComparison(
  root = resolve(fileURLToPath(new URL("../../../", import.meta.url))),
) {
  const sources = migrationPaths.map((path) => readFileSync(resolve(root, path), "utf8"));
  const snapshotPath = "docs/completion/ex02/hosted-schema.json";
  const rawSnapshot = readFileSync(resolve(root, snapshotPath), "utf8");
  const snapshot = JSON.parse(rawSnapshot);
  return {
    ...compareSchemas(sources, snapshot),
    snapshotCapturedAtUtc: snapshot.capturedAtUtc,
    comparedAtUtc: new Date().toISOString(),
    inputs: migrationPaths
      .map((path, i) => ({ path, sha256: sha256(sources[i]) }))
      .concat([{ path: snapshotPath, sha256: sha256(rawSnapshot) }]),
    limitations: [
      "Offline comparison of one sanitized snapshot, not a live freshness guarantee or authorization to resolve/deploy migrations.",
      "Exactly the initial and episode/medication capture migrations; the later medical-summary migration is not expected in this baseline.",
      "Only public ordinary-table columns, PK/FK constraints, indexes and enum labels captured by the parent metadata query; _prisma_migrations definitions are excluded.",
      "Only narrowly supported repository syntax; unsupported expressions, clauses and metadata shapes fail closed and require review, not SQL execution.",
      "No certification of relation kinds or empty tables omitted from the column inventory, collations, table/storage options, domains, sequences, routines, triggers, policies, grants, ownership, role inheritance, default ACLs, exposed schemas, data or migration history.",
      "No backup, restore, API/worker role access, Data API isolation, Auth or Storage verification. All EX-02 safety gates remain independent.",
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runComparison();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "MATCH_WITHIN_CAPTURED_SCOPE" ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ status: "UNSUPPORTED_OR_INVALID_INPUT", error: error.message }));
    process.exitCode = 1;
  }
}
