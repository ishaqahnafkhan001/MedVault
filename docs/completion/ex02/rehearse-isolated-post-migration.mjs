// One-time EX-02 post-migration rehearsal against the approved local restore.
// Never loads .env, contacts hosted services, or prints medical/source row values.
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  Client,
  runRoot,
  tables,
  localConfig,
  assertLocal,
  protection,
  invariant,
  saveJson,
  safeFailure,
} from "./recovery-common.mjs";

const folder = `${runRoot}/snapshot-20260912T055058Z`;
const database = "medvault_ex02_restore_20260912";
const evidencePath = `${folder}/migration-rehearsal-result.json`;
const applicationTables = [
  ...tables.filter((name) => name !== "_prisma_migrations"),
  "medical_summaries",
].sort();
const protectedTables = [...applicationTables, "_prisma_migrations"].sort();
const apiRoles = ["anon", "authenticated", "service_role"];
const migrationHashes = new Map([
  ["20260807000000_initial", "b7bf19338333b70fdba8ecaf3906b362824bc0389124964c7cf69d687f19cf32"],
  [
    "20260908000000_capture_existing_episode_medication_schema",
    "23f8ed918d6f1eb815ec480a32fc2885acfa74e3d5a002c30e349fc631416290",
  ],
  [
    "20260908010000_reviewed_medical_summaries",
    "cba57bfb92ec1f5781ad4c43a6c12b87c96eb2ad847cacfae741c82f4d37b329",
  ],
  [
    "20260919000000_harden_application_database_access",
    "fca1962c08f6cbfea01f645cf55398eb4cfbb844255097a50c7d82140b673051",
  ],
]);

function sorted(values) {
  return [...values].sort();
}

async function expectPermissionDenied(client, sql) {
  await client.query("SAVEPOINT medvault_denial_check");
  try {
    await client.query(sql);
    throw new Error("EXPECTED_PERMISSION_DENIAL_MISSING");
  } catch (error) {
    invariant(error.code === "42501", "UNEXPECTED_DENIAL_RESULT");
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT medvault_denial_check");
    await client.query("RELEASE SAVEPOINT medvault_denial_check");
  }
}

async function assertRuntimeIdentity(client) {
  const {
    rows: [row],
  } = await client.query(
    "SELECT current_database() AS database,current_user AS role,current_setting('server_version_num')::int AS version,host(inet_server_addr()) AS host,inet_server_port() AS port,pg_is_in_recovery() AS recovery",
  );
  invariant(
    row.database === database &&
      row.role === "medvault_runtime" &&
      row.version >= 170000 &&
      row.version < 180000 &&
      row.host === "127.0.0.1" &&
      row.port === 55441 &&
      row.recovery === false,
    "RUNTIME_IDENTITY_FAILED",
  );
}

async function verifyMetadata(admin, baseline) {
  const { rows: history } = await admin.query(
    "SELECT migration_name,checksum,finished_at IS NOT NULL AS finished,rolled_back_at IS NOT NULL AS rolled_back,applied_steps_count AS steps FROM public._prisma_migrations ORDER BY migration_name",
  );
  invariant(history.length === migrationHashes.size, "MIGRATION_COUNT_MISMATCH");
  for (const row of history) {
    invariant(
      migrationHashes.get(row.migration_name) === row.checksum &&
        row.finished === true &&
        row.rolled_back === false &&
        row.steps === (row.migration_name.includes("capture_existing") ? 0 : 1),
      "MIGRATION_HISTORY_MISMATCH",
    );
  }

  const countSql = protectedTables
    .map((table) => `SELECT '${table}' AS table_name,count(*)::int AS rows FROM public."${table}"`)
    .join(" UNION ALL ");
  const { rows: counts } = await admin.query(countSql);
  for (const { table_name: table, rows } of counts) {
    const expected =
      table === "_prisma_migrations"
        ? migrationHashes.size
        : table === "medical_summaries"
          ? 0
          : Number(baseline.row_counts[table]);
    invariant(rows === expected, "PREEXISTING_ROW_COUNT_CHANGED");
  }

  const {
    rows: [{ evidence }],
  } = await admin.query(
    readFileSync(new URL("application-verification.sql", import.meta.url), "utf8"),
  );
  invariant(
    Object.values(evidence.integrity_counts).every((value) => value === 0),
    "PREEXISTING_INTEGRITY_FAILED",
  );

  const { rows: relations } = await admin.query(
    "SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[]) ORDER BY c.relname",
    [protectedTables],
  );
  invariant(
    relations.length === protectedTables.length &&
      relations.every((row) => row.rls === true) &&
      JSON.stringify(relations.map((row) => row.name)) === JSON.stringify(protectedTables),
    "RLS_COVERAGE_FAILED",
  );
  const {
    rows: [{ policies }],
  } = await admin.query(
    "SELECT count(*)::int AS policies FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",
    [protectedTables],
  );
  invariant(policies === 0, "UNREVIEWED_POLICY_FOUND");

  const { rows: apiAccess } = await admin.query(
    "SELECT role_name,table_name,has_table_privilege(role_name,format('public.%I',table_name),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_access,has_any_column_privilege(role_name,format('public.%I',table_name),'SELECT,INSERT,UPDATE,REFERENCES') AS column_access FROM unnest($1::text[]) role_name CROSS JOIN unnest($2::text[]) table_name",
    [apiRoles, protectedTables],
  );
  invariant(
    apiAccess.length === apiRoles.length * protectedTables.length &&
      apiAccess.every((row) => row.table_access === false && row.column_access === false),
    "DATA_API_EFFECTIVE_GRANT_REMAINS",
  );

  const {
    rows: [runtime],
  } = await admin.query(
    "SELECT rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='medvault_runtime'",
  );
  invariant(
    runtime &&
      runtime.rolcanlogin === false &&
      runtime.rolsuper === false &&
      runtime.rolinherit === false &&
      runtime.rolcreaterole === false &&
      runtime.rolcreatedb === false &&
      runtime.rolreplication === false &&
      runtime.rolbypassrls === true,
    "RUNTIME_ROLE_ATTRIBUTES_FAILED",
  );
  const { rows: runtimeAccess } = await admin.query(
    "SELECT table_name,has_table_privilege('medvault_runtime',format('public.%I',table_name),'SELECT') AS can_select,has_table_privilege('medvault_runtime',format('public.%I',table_name),'INSERT') AS can_insert,has_table_privilege('medvault_runtime',format('public.%I',table_name),'UPDATE') AS can_update,has_table_privilege('medvault_runtime',format('public.%I',table_name),'DELETE') AS can_delete,has_table_privilege('medvault_runtime',format('public.%I',table_name),'TRUNCATE,REFERENCES,TRIGGER') AS extra FROM unnest($1::text[]) table_name",
    [applicationTables],
  );
  invariant(
    runtimeAccess.length === applicationTables.length &&
      runtimeAccess.every(
        (row) => row.can_select && row.can_insert && row.can_update && row.can_delete && !row.extra,
      ),
    "RUNTIME_DML_GRANTS_FAILED",
  );
  const {
    rows: [runtimeBoundary],
  } = await admin.query(
    "SELECT has_table_privilege('medvault_runtime','public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS migration_access,has_schema_privilege('medvault_runtime','public','CREATE') AS public_create,has_schema_privilege('medvault_runtime','medvault_private','USAGE') AS private_usage,has_function_privilege('medvault_runtime','medvault_private.invalidate_medical_summaries()','EXECUTE') AS private_execute",
  );
  invariant(
    !runtimeBoundary.migration_access &&
      !runtimeBoundary.public_create &&
      !runtimeBoundary.private_usage &&
      !runtimeBoundary.private_execute,
    "RUNTIME_BOUNDARY_FAILED",
  );

  const { rows: defaultLeaks } = await admin.query(
    "SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,n.nspname AS schema_name,d.defaclobjtype AS object_type,coalesce(r.rolname,'PUBLIC') AS grantee,e.privilege_type FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) e LEFT JOIN pg_catalog.pg_roles r ON r.oid=e.grantee WHERE pg_catalog.pg_get_userbyid(d.defaclrole) IN (current_user,'postgres') AND n.nspname IN ('public','medvault_private') AND (e.grantee=0 OR r.rolname=ANY($1::text[]))",
    [apiRoles],
  );
  invariant(defaultLeaks.length === 0, "APPLICATION_OWNER_DEFAULT_ACL_LEAK");

  const { rows: triggers } = await admin.query(
    "SELECT t.tgname AS name FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY t.tgname",
  );
  invariant(
    JSON.stringify(triggers.map((row) => row.name)) ===
      JSON.stringify(
        sorted([
          "medvault_summary_document_change",
          "medvault_summary_episode_change",
          "medvault_summary_extraction_change",
          "medvault_summary_measurement_change",
          "medvault_summary_membership_change",
        ]),
      ),
    "SUMMARY_TRIGGER_SET_FAILED",
  );
  const {
    rows: [routine],
  } = await admin.query(
    "SELECT p.prosecdef AS security_definer,p.proconfig FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='medvault_private' AND p.proname='invalidate_medical_summaries'",
  );
  invariant(
    routine &&
      routine.security_definer === false &&
      routine.proconfig?.includes("search_path=pg_catalog, public"),
    "SUMMARY_FUNCTION_SECURITY_FAILED",
  );
  const { rows: summaryConstraints } = await admin.query(
    "SELECT conname AS name FROM pg_catalog.pg_constraint WHERE conrelid='public.medical_summaries'::regclass ORDER BY conname",
  );
  invariant(
    JSON.stringify(summaryConstraints.map((row) => row.name)) ===
      JSON.stringify(
        sorted([
          "medical_summaries_document_id_fkey",
          "medical_summaries_episode_id_fkey",
          "medical_summaries_patient_id_fkey",
          "medical_summaries_pkey",
          "medical_summary_attempts_check",
          "medical_summary_scope_check",
          "medical_summary_status_check",
        ]),
      ),
    "SUMMARY_CONSTRAINT_SET_FAILED",
  );

  return { counts, history, relationCount: relations.length, triggerCount: triggers.length };
}

async function verifyApiRoleDenials(admin) {
  for (const role of apiRoles) {
    await admin.query(`SET ROLE "${role}"`);
    try {
      await admin.query("SELECT count(*) FROM public.patients");
      throw new Error("DATA_API_ROLE_QUERY_ALLOWED");
    } catch (error) {
      invariant(error.code === "42501", "DATA_API_ROLE_DENIAL_FAILED");
    } finally {
      await admin.query("RESET ROLE");
    }
  }
}

async function exerciseRuntime(admin) {
  const password = randomBytes(32).toString("hex");
  const ids = Object.fromEntries(
    [
      "patient",
      "auth",
      "profile",
      "document",
      "extraction",
      "measurement",
      "episode",
      "analysis",
      "medication",
      "schedule",
      "occurrence",
      "intake",
      "delivery",
      "summary",
      "correlation",
    ].map((name) => [name, randomUUID()]),
  );
  let runtime;
  let runtimeStep = "ROLE_PROVISION";
  try {
    await admin.query(
      `ALTER ROLE medvault_runtime LOGIN PASSWORD '${password}' VALID UNTIL '${new Date(Date.now() + 15 * 60_000).toISOString()}'`,
    );
    runtime = new Client({
      ...localConfig(database),
      user: "medvault_runtime",
      password,
      application_name: "medvault_ex02_runtime_rehearsal",
    });
    runtimeStep = "CONNECT";
    await runtime.connect();
    await assertRuntimeIdentity(runtime);
    await runtime.query("BEGIN");
    runtimeStep = "NEGATIVE_BOUNDARIES";
    await expectPermissionDenied(runtime, "SELECT count(*) FROM public._prisma_migrations");
    await expectPermissionDenied(
      runtime,
      "CREATE TABLE public.medvault_forbidden_probe(id integer)",
    );
    await expectPermissionDenied(runtime, "TRUNCATE TABLE public.patients");
    runtimeStep = "PATIENT_INSERT";
    await runtime.query(
      "INSERT INTO public.patients(id,auth_user_id,updated_at) VALUES($1,$2,now())",
      [ids.patient, ids.auth],
    );
    runtimeStep = "PROFILE_INSERT";
    await runtime.query(
      "INSERT INTO public.patient_profiles(id,patient_id,full_name,updated_at) VALUES($1,$2,'Synthetic EX-02 fixture',now())",
      [ids.profile, ids.patient],
    );
    runtimeStep = "DOCUMENT_INSERT";
    await runtime.query(
      "INSERT INTO public.medical_documents(id,patient_id,document_type,original_filename,mime_type,file_size,storage_path,checksum_sha256,processing_status,verification_status,updated_at) VALUES($1,$2,'REPORT','synthetic-no-file.pdf','application/pdf',1,$3,$4,'VERIFIED','VERIFIED',now())",
      [ids.document, ids.patient, `synthetic-ex02/${ids.document}`, "a".repeat(64)],
    );
    runtimeStep = "EXTRACTION_INSERT";
    await runtime.query(
      "INSERT INTO public.report_extractions(id,document_id,document_version,status,document_report_type,extracted_test_name,normalized_test_name,extracted_category,provider,model,schema_version,raw_output,analyzed_at,updated_at) VALUES($1,$2,1,'VERIFIED','Synthetic','Synthetic','synthetic','OTHER','fixture','fixture','fixture','{}'::jsonb,now(),now())",
      [ids.extraction, ids.document],
    );
    runtimeStep = "MEASUREMENT_INSERT";
    await runtime.query(
      "INSERT INTO public.report_measurements(id,extraction_id,sort_order,name,normalized_name,verified_name,verified_normalized_name,verified_numeric_value,verified_unit,updated_at) VALUES($1,$2,0,'Synthetic','synthetic','Synthetic','synthetic',1,'unit',now())",
      [ids.measurement, ids.extraction],
    );
    runtimeStep = "EPISODE_INSERT";
    await runtime.query(
      "INSERT INTO public.episodes(id,patient_id,title,updated_at) VALUES($1,$2,'Synthetic EX-02 episode',now())",
      [ids.episode, ids.patient],
    );
    runtimeStep = "MEMBERSHIP_INSERT";
    await runtime.query(
      "INSERT INTO public.episode_memberships(episode_id,document_id) VALUES($1,$2)",
      [ids.episode, ids.document],
    );
    runtimeStep = "ANALYSIS_INSERT";
    await runtime.query(
      "INSERT INTO public.episode_analyses(id,episode_id,patient_id,status,provider,model,prompt_version,source_versions,updated_at) VALUES($1,$2,$3,'COMPLETED','fixture','fixture','fixture','{}'::jsonb,now())",
      [ids.analysis, ids.episode, ids.patient],
    );
    runtimeStep = "MEDICATION_INSERT";
    await runtime.query(
      "INSERT INTO public.medications(id,patient_id,name,updated_at) VALUES($1,$2,'Synthetic fixture',now())",
      [ids.medication, ids.patient],
    );
    runtimeStep = "SCHEDULE_INSERT";
    await runtime.query(
      "INSERT INTO public.medication_schedules(id,medication_id,patient_id,frequency,administration_times,iana_timezone,start_date,updated_at) VALUES($1,$2,$3,'ONCE_DAILY','[]'::jsonb,'UTC',DATE '2026-01-01',now())",
      [ids.schedule, ids.medication, ids.patient],
    );
    runtimeStep = "OCCURRENCE_INSERT";
    await runtime.query(
      "INSERT INTO public.schedule_occurrences(id,schedule_id,patient_id,schedule_version,due_at,local_time_str,updated_at) VALUES($1,$2,$3,1,TIMESTAMP '2026-01-01 08:00:00','08:00',now())",
      [ids.occurrence, ids.schedule, ids.patient],
    );
    runtimeStep = "INTAKE_INSERT";
    await runtime.query(
      "INSERT INTO public.intake_logs(id,occurrence_id,patient_id,action,logged_at) VALUES($1,$2,$3,'TAKEN',TIMESTAMP '2026-01-01 08:00:00')",
      [ids.intake, ids.occurrence, ids.patient],
    );
    runtimeStep = "DELIVERY_INSERT";
    await runtime.query(
      "INSERT INTO public.reminder_deliveries(id,occurrence_id,patient_id,channel,updated_at) VALUES($1,$2,$3,'fixture',now())",
      [ids.delivery, ids.occurrence, ids.patient],
    );
    runtimeStep = "SUMMARY_INSERT";
    await runtime.query(
      "INSERT INTO public.medical_summaries(id,patient_id,scope_key,document_id,input_fingerprint,source_snapshot,status,model,prompt_version,correlation_id,updated_at) VALUES($1,$2,$3,$4,$5,'{}'::jsonb,'COMPLETED','fixture','fixture',$6,now())",
      [
        ids.summary,
        ids.patient,
        `REPORT-${ids.document}`,
        ids.document,
        "b".repeat(64),
        ids.correlation,
      ],
    );
    runtimeStep = "TRIGGER_INVALIDATION";
    await runtime.query(
      "UPDATE public.report_measurements SET verified_numeric_value=2,updated_at=now() WHERE id=$1",
      [ids.measurement],
    );
    const {
      rows: [invalidated],
    } = await runtime.query(
      "SELECT status,claim_token IS NULL AS claim_cleared,lease_until IS NULL AS lease_cleared FROM public.medical_summaries WHERE id=$1",
      [ids.summary],
    );
    invariant(
      invalidated?.status === "STALE" &&
        invalidated.claim_cleared === true &&
        invalidated.lease_cleared === true,
      "SUMMARY_INVALIDATION_FAILED",
    );
    runtimeStep = "DELETE_AND_COMMIT";
    await runtime.query("DELETE FROM public.reminder_deliveries WHERE id=$1", [ids.delivery]);
    await runtime.query("COMMIT");
    await runtime.end();
    runtime = undefined;

    runtime = new Client({
      ...localConfig(database),
      user: "medvault_runtime",
      password,
      application_name: "medvault_ex02_runtime_reload",
    });
    runtimeStep = "RELOAD_CONNECT";
    await runtime.connect();
    await assertRuntimeIdentity(runtime);
    const {
      rows: [reloaded],
    } = await runtime.query(
      "SELECT count(*)::int AS rows,bool_and(status='STALE') AS stale FROM public.medical_summaries WHERE patient_id=$1",
      [ids.patient],
    );
    invariant(reloaded.rows === 1 && reloaded.stale === true, "RUNTIME_RELOAD_FAILED");
    runtimeStep = "CASCADE_DELETE";
    const deleted = await runtime.query("DELETE FROM public.patients WHERE id=$1", [ids.patient]);
    invariant(deleted.rowCount === 1, "SYNTHETIC_CLEANUP_FAILED");
    const {
      rows: [remaining],
    } = await runtime.query(
      "SELECT (SELECT count(*) FROM public.patients WHERE id=$1)::int + (SELECT count(*) FROM public.medical_summaries WHERE patient_id=$1)::int + (SELECT count(*) FROM public.medical_documents WHERE patient_id=$1)::int AS rows",
      [ids.patient],
    );
    invariant(remaining.rows === 0, "SYNTHETIC_CASCADE_CLEANUP_FAILED");
    return { tableDmlCoverage: applicationTables.length, triggerInvalidation: true, reload: true };
  } catch (error) {
    if (error.code === "42501") throw new Error(`RUNTIME_PERMISSION_${runtimeStep}`);
    throw error;
  } finally {
    await runtime?.query("ROLLBACK").catch(() => {});
    await runtime?.end().catch(() => {});
    await admin.query("DELETE FROM public.patients WHERE id=$1", [ids.patient]).catch(() => {});
    await admin
      .query("ALTER ROLE medvault_runtime NOLOGIN PASSWORD NULL VALID UNTIL 'infinity'")
      .catch(() => {});
  }
}

let admin;
let stage = "preflight";
try {
  invariant(
    process.argv.length === 3 && process.argv[2] === "--run-reviewed-local-rehearsal",
    "EXPLICIT_REHEARSAL_FLAG_REQUIRED",
  );
  invariant(!existsSync(evidencePath), "REHEARSAL_ALREADY_RECORDED_INSPECT_FIRST");
  protection();
  const baseline = JSON.parse(readFileSync(`${folder}/restored-baseline.json`, "utf8"));
  admin = new Client(localConfig(database));
  await admin.connect();
  await assertLocal(admin, database);
  stage = "metadata-verification";
  const metadata = await verifyMetadata(admin, baseline);
  stage = "data-api-role-denial";
  await verifyApiRoleDenials(admin);
  stage = "runtime-role-rehearsal";
  const runtime = await exerciseRuntime(admin);
  stage = "post-cleanup-verification";
  const post = await verifyMetadata(admin, baseline);
  await admin.query("CHECKPOINT");
  protection();
  const result = {
    result: "PASS_LOCAL_MIGRATION_AND_SECURITY_REHEARSAL",
    completedAt: new Date().toISOString(),
    database,
    listener: "127.0.0.1:55441",
    migrationCount: metadata.history.length,
    protectedTableCount: metadata.relationCount,
    dataApiRolesDenied: apiRoles,
    policyCount: 0,
    summaryTriggerCount: metadata.triggerCount,
    runtime,
    preexistingCountsPreserved: true,
    syntheticRowsRetained: false,
    runtimeRoleReturnedToNoLogin: true,
    secondMetadataVerification: post.relationCount === metadata.relationCount,
    hostedConnections: 0,
    hostedMutation: false,
    authStorageRedisGeminiMutation: false,
    durableKeyAndOffDeviceCustody: "PENDING_OPERATOR",
  };
  saveJson(evidencePath, result);
  protection();
  console.log(JSON.stringify(result));
} catch (error) {
  safeFailure(error, stage);
} finally {
  await admin?.end().catch(() => {});
}
