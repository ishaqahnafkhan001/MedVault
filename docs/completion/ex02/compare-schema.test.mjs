import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { compareSchemas, migrationPaths, parseMigrations } from "./compare-schema.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sources = migrationPaths.map((path) => readFileSync(resolve(root, path), "utf8"));
const baseline = JSON.parse(readFileSync(new URL("./hosted-schema.json", import.meta.url), "utf8"));

function mutate(change) {
  const snapshot = structuredClone(baseline);
  change(snapshot);
  return compareSchemas(sources, snapshot);
}

function changed(change, section, field) {
  const result = mutate(change);
  assert.equal(result.status, "DIFFERENT");
  assert.ok(result.differences.some((row) => row.section === section && row.field === field));
}

test("both baseline migration definitions match the captured metadata, not just names", () => {
  const result = compareSchemas(sources, baseline);
  assert.equal(result.status, "MATCH_WITHIN_CAPTURED_SCOPE");
  assert.deepEqual(result.differences, []);
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.counts).map(([key, value]) => [key, value.snapshot])),
    {
      columns: 159,
      constraints: 28,
      indexes: 35,
      enums: 50,
      tables: 13,
      enumTypes: 10,
    },
  );
});

test("integer default drift is detected", () => {
  changed(
    (s) => {
      s.columns.find(
        (c) => c.table === "medical_documents" && c.column === "document_version",
      ).default = "2";
    },
    "columns",
    "default",
  );
});

test("boolean default drift is detected", () => {
  changed(
    (s) => {
      s.columns.find((c) => c.column === "patient_corrected").default = "true";
    },
    "columns",
    "default",
  );
});

test("default removal is detected", () => {
  changed(
    (s) => {
      s.columns.find((c) => c.column === "created_at").default = null;
    },
    "columns",
    "default",
  );
});

test("string default case is not normalized away", () => {
  changed(
    (s) => {
      s.columns.find((c) => c.column === "resolved_status").default =
        "'unresolved'::character varying";
    },
    "columns",
    "default",
  );
});

test("enum default drift is detected", () => {
  changed(
    (s) => {
      s.columns.find((c) => c.table === "medications" && c.column === "status").default =
        "'PAUSED'::\"MedicationStatus\"";
    },
    "columns",
    "default",
  );
});

test("nullable physical arrays are preserved, not inferred from Prisma", () => {
  const parsed = parseMigrations(sources);
  assert.equal(parsed.columns.find((c) => c.column === "allergies").not_null, false);
  changed(
    (s) => {
      s.columns.find((c) => c.column === "allergies").not_null = true;
    },
    "columns",
    "not_null",
  );
});

test("column type precision drift is detected", () => {
  changed(
    (s) => {
      s.columns.find((c) => c.column === "full_name").type = "character varying(121)";
    },
    "columns",
    "type",
  );
});

test("column ordinal drift is detected", () => {
  changed(
    (s) => {
      s.columns[0].position = 100;
    },
    "columns",
    "position",
  );
});

test("identity and generated metadata are not ignored", () => {
  changed(
    (s) => {
      s.columns[0].identity = "a";
    },
    "columns",
    "identity",
  );
  changed(
    (s) => {
      s.columns[0].generated = "s";
    },
    "columns",
    "generated",
  );
});

test("enum label order drift is detected", () => {
  changed(
    (s) => {
      s.enums[0].order = 2;
    },
    "enums",
    "order",
  );
});

test("renamed enum label produces missing and unexpected entries", () => {
  const result = mutate((s) => {
    s.enums[0].label = "DIFFERENT";
  });
  assert.ok(result.differences.some((d) => d.section === "enums" && d.kind === "missing"));
  assert.ok(result.differences.some((d) => d.section === "enums" && d.kind === "unexpected"));
});

test("foreign-key delete action drift is detected", () => {
  changed(
    (s) => {
      const c = s.constraints.find((c) => c.name === "medications_prescription_id_fkey");
      c.definition = c.definition.replace("ON DELETE SET NULL", "ON DELETE CASCADE");
    },
    "constraints",
    "delete",
  );
});

test("foreign-key update action and target drift are detected", () => {
  changed(
    (s) => {
      const c = s.constraints.find((c) => c.kind === "f");
      c.definition = c.definition.replace("ON UPDATE CASCADE", "ON UPDATE RESTRICT");
    },
    "constraints",
    "update",
  );
  changed(
    (s) => {
      const c = s.constraints.find((c) => c.kind === "f");
      c.definition = c.definition.replace("REFERENCES episodes(id)", "REFERENCES patients(id)");
    },
    "constraints",
    "target",
  );
});

test("constraint validation and timing flags are checked", () => {
  changed(
    (s) => {
      s.constraints[0].validated = false;
    },
    "constraints",
    "validated",
  );
  changed(
    (s) => {
      s.constraints[0].deferrable = true;
    },
    "constraints",
    "deferrable",
  );
  changed(
    (s) => {
      s.constraints[0].initially_deferred = true;
    },
    "constraints",
    "initially_deferred",
  );
});

test("composite primary-key order is checked", () => {
  changed(
    (s) => {
      const c = s.constraints.find((c) => c.name === "episode_memberships_pkey");
      c.definition = "PRIMARY KEY (document_id, episode_id)";
    },
    "constraints",
    "columns",
  );
});

test("index sort, null ordering, uniqueness and readiness drift are detected", () => {
  changed(
    (s) => {
      s.indexes[0].definition = s.indexes[0].definition.replace(" DESC", " ASC");
    },
    "indexes",
    "columns",
  );
  changed(
    (s) => {
      s.indexes[0].definition = s.indexes[0].definition.replace(" DESC", " DESC NULLS LAST");
    },
    "indexes",
    "columns",
  );
  changed(
    (s) => {
      s.indexes[0].definition = s.indexes[0].definition.replace(
        "CREATE INDEX",
        "CREATE UNIQUE INDEX",
      );
    },
    "indexes",
    "unique",
  );
  changed(
    (s) => {
      s.indexes[0].valid = false;
    },
    "indexes",
    "valid",
  );
  changed(
    (s) => {
      s.indexes[0].ready = false;
    },
    "indexes",
    "ready",
  );
});

test("extra and missing objects in every captured section are detected", () => {
  for (const section of ["columns", "constraints", "indexes", "enums"]) {
    const missing = mutate((s) => {
      s[section].pop();
    });
    assert.ok(missing.differences.some((d) => d.section === section && d.kind === "missing"));
    const extra = mutate((s) => {
      const row = structuredClone(s[section][0]);
      if (section === "columns") row.column = "unexpected_column";
      else if (section === "enums") row.label = "UNEXPECTED_LABEL";
      else {
        const oldName = row.name;
        row.name = "unexpected_object";
        if (section === "indexes") row.definition = row.definition.replace(oldName, row.name);
      }
      s[section].push(row);
    });
    assert.ok(extra.differences.some((d) => d.section === section && d.kind === "unexpected"));
  }
});

test("missing and added whole tables are not concealed", () => {
  const missing = mutate((s) => {
    for (const section of ["columns", "constraints", "indexes"])
      s[section] = s[section].filter((row) => row.table !== "patients");
  });
  assert.equal(missing.counts.tables.snapshot, 12);
  assert.ok(missing.differences.some((d) => d.key === "patients.id" && d.kind === "missing"));
  const extra = mutate((s) => {
    s.columns.push({ ...s.columns[0], table: "unexpected_table" });
  });
  assert.equal(extra.counts.tables.snapshot, 14);
  assert.ok(
    extra.differences.some((d) => d.key === "unexpected_table.id" && d.kind === "unexpected"),
  );
});

test("duplicate metadata, missing fields and unsupported fields fail closed", () => {
  assert.throws(
    () =>
      mutate((s) => {
        s.columns.push({ ...s.columns[0] });
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        delete s.columns[0].not_null;
      }),
    /metadata shape/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.columns[0].collation = "new";
      }),
    /metadata shape/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.indexes[0].valid = "true";
      }),
    /boolean/,
  );
});

test("unsupported default casts and expressions fail closed", () => {
  assert.throws(
    () =>
      mutate((s) => {
        s.columns.find((c) => c.column === "resolved_status").default = "'UNRESOLVED'::text";
      }),
    /cast/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.columns[0].default = "gen_random_uuid()";
      }),
    /default/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.columns.find((c) => c.column === "allergies").default = "ARRAY['x']::text[]";
      }),
    /Expected/,
  );
});

test("partial, expression, non-btree and cross-schema indexes fail closed", () => {
  assert.throws(
    () =>
      mutate((s) => {
        s.indexes[0].definition += " WHERE patient_id IS NOT NULL";
      }),
    /trailing/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.indexes[0].definition = s.indexes[0].definition.replace(
          "episode_id,",
          "lower(episode_id),",
        );
      }),
    /Expected/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.indexes[0].definition = s.indexes[0].definition.replace("btree", "hash");
      }),
    /BTREE/,
  );
  assert.throws(
    () =>
      mutate((s) => {
        s.indexes[0].definition = s.indexes[0].definition.replace("public.", "private.");
      }),
    /public/,
  );
});

test("unknown DDL, unfinished SQL and nonallowlisted session settings fail closed", () => {
  assert.throws(() => parseMigrations([...sources, "DROP TABLE patients;"]), /Unsupported/);
  assert.throws(
    () => parseMigrations([...sources, "CREATE TABLE unknown (id UUID NOT NULL)"]),
    /Expected/,
  );
  assert.throws(
    () => parseMigrations(["BEGIN; SET LOCAL search_path = 'other'; COMMIT;"]),
    /LOCK_TIMEOUT/,
  );
  assert.throws(() => parseMigrations(["BEGIN;"]), /Unclosed/);
  assert.throws(() => parseMigrations(["COMMIT;"]), /without BEGIN/);
});

test("comments cannot hide trailing DDL, quoted literal text is preserved", () => {
  assert.throws(
    () => parseMigrations([...sources, "-- comment\nDROP TABLE patients;"]),
    /Unsupported/,
  );
  const altered = sources.map((sql) =>
    sql.replace("DEFAULT 'UNRESOLVED'", "DEFAULT 'UNRESOLVED--not-comment'"),
  );
  const result = compareSchemas(altered, baseline);
  assert.ok(
    result.differences.some(
      (d) => d.key === "medications.resolved_status" && d.field === "default",
    ),
  );
});

test("duplicate or unsupported source declarations are rejected", () => {
  assert.throws(() => parseMigrations([...sources, sources[0]]), /Duplicate/);
  assert.throws(
    () =>
      parseMigrations([sources[0].replace('"allergies" TEXT[]', '"allergies" TEXT[] COLLATE "C"')]),
    /Expected/,
  );
  assert.throws(
    () =>
      compareSchemas(
        [sources[0].replace('"id" UUID NOT NULL,', '"id" UUID NOT NULL, "id" UUID,')],
        baseline,
      ),
    /Duplicate/,
  );
});
