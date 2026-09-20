-- EX-02 application-only backup/restore verification, before additive migrations.
-- One SELECT-only statement; no medical values, credentials, owners or OIDs emitted.
-- Requires PostgreSQL 17 and all 14 existing public tables, including Prisma history.
-- The caller must use READ ONLY and the same search_path (pg_catalog, public) on
-- source and restore so pg_get_* definitions are deparsed identically. Export the
-- source snapshot in that transaction and pass it to pg_dump for count consistency.
-- Compare every top-level field EXCEPT collation_context; report that separately.
-- Native Windows libc does not certify Linux collation semantics, even if names match.
-- All unsupported_object_counts must be zero for this reviewed baseline. Nonzero
-- values require extending/reviewing this verifier, not accepting matching counts.
-- The 22 integrity checks are exactly verification.sql's 25 checks minus its three
-- Auth/Storage joins. This does NOT verify Auth accounts, object bytes, grants,
-- roles/default ACLs or Supabase services, and is not a whole-project recovery test.
WITH public_relations AS (
  SELECT c.*
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
), public_columns AS (
  SELECT c.relname AS table_name, a.attname AS column_name, a.attnum AS position,
    tn.nspname AS type_schema, t.typname AS type_name, a.atttypmod AS type_modifier,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
    a.attnotnull AS not_null, pg_catalog.pg_get_expr(d.adbin, d.adrelid, false) AS default_expression,
    a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
    a.attndims AS array_dimensions, a.attcollation AS collation_oid
  FROM public_relations c
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
  JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
), public_constraints AS (
  SELECT c.relname AS table_name, con.conname AS constraint_name,
    con.contype AS constraint_type, con.convalidated AS validated,
    con.condeferrable AS is_deferrable, con.condeferred AS initially_deferred,
    con.connoinherit AS no_inherit,
    pg_catalog.pg_get_constraintdef(con.oid, false) AS definition
  FROM public_relations c
  JOIN pg_catalog.pg_constraint con ON con.conrelid = c.oid
), public_indexes AS (
  SELECT t.relname AS table_name, c.relname AS index_name,
    pg_catalog.pg_get_indexdef(i.indexrelid, 0, false) AS definition,
    i.indisunique AS is_unique, i.indisprimary AS is_primary,
    i.indisexclusion AS is_exclusion, i.indimmediate AS is_immediate,
    i.indnullsnotdistinct AS nulls_not_distinct,
    i.indisvalid AS valid, i.indisready AS ready, i.indislive AS live,
    i.indisreplident AS replica_identity,
    i.indnatts AS total_columns, i.indnkeyatts AS key_columns
  FROM public_relations t
  JOIN pg_catalog.pg_index i ON i.indrelid = t.oid
  JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
), public_enums AS (
  SELECT t.typname AS enum_name, e.enumlabel AS label, e.enumsortorder AS sort_order
  FROM pg_catalog.pg_type t
  JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
  WHERE n.nspname = 'public'
)
SELECT pg_catalog.jsonb_build_object(
  'contract_version', 'medvault-ex02-application-verification-v1',
  'row_counts', (
    SELECT pg_catalog.jsonb_object_agg(table_name, rows) FROM (
      SELECT '_prisma_migrations' AS table_name, count(*) AS rows FROM public._prisma_migrations
      UNION ALL SELECT 'patients', count(*) FROM public.patients
      UNION ALL SELECT 'patient_profiles', count(*) FROM public.patient_profiles
      UNION ALL SELECT 'medical_documents', count(*) FROM public.medical_documents
      UNION ALL SELECT 'report_extractions', count(*) FROM public.report_extractions
      UNION ALL SELECT 'report_measurements', count(*) FROM public.report_measurements
      UNION ALL SELECT 'episodes', count(*) FROM public.episodes
      UNION ALL SELECT 'episode_memberships', count(*) FROM public.episode_memberships
      UNION ALL SELECT 'episode_analyses', count(*) FROM public.episode_analyses
      UNION ALL SELECT 'medications', count(*) FROM public.medications
      UNION ALL SELECT 'medication_schedules', count(*) FROM public.medication_schedules
      UNION ALL SELECT 'schedule_occurrences', count(*) FROM public.schedule_occurrences
      UNION ALL SELECT 'intake_logs', count(*) FROM public.intake_logs
      UNION ALL SELECT 'reminder_deliveries', count(*) FROM public.reminder_deliveries
    ) counts
  ),
  'integrity_counts', (
    SELECT pg_catalog.jsonb_object_agg(check_name, rows) FROM (
      SELECT 'profile_missing_patient' AS check_name, count(*) AS rows
      FROM public.patient_profiles c LEFT JOIN public.patients p ON p.id = c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'document_missing_patient', count(*)
      FROM public.medical_documents c LEFT JOIN public.patients p ON p.id = c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'extraction_missing_document', count(*)
      FROM public.report_extractions c LEFT JOIN public.medical_documents p ON p.id = c.document_id WHERE p.id IS NULL
      UNION ALL SELECT 'measurement_missing_extraction', count(*)
      FROM public.report_measurements c LEFT JOIN public.report_extractions p ON p.id = c.extraction_id WHERE p.id IS NULL
      UNION ALL SELECT 'episode_missing_patient', count(*)
      FROM public.episodes c LEFT JOIN public.patients p ON p.id = c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'membership_missing_parent', count(*)
      FROM public.episode_memberships c LEFT JOIN public.episodes e ON e.id = c.episode_id
      LEFT JOIN public.medical_documents d ON d.id = c.document_id WHERE e.id IS NULL OR d.id IS NULL
      UNION ALL SELECT 'analysis_missing_parent', count(*)
      FROM public.episode_analyses c LEFT JOIN public.episodes e ON e.id = c.episode_id
      LEFT JOIN public.patients p ON p.id = c.patient_id WHERE e.id IS NULL OR p.id IS NULL
      UNION ALL SELECT 'medication_missing_patient', count(*)
      FROM public.medications c LEFT JOIN public.patients p ON p.id = c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'schedule_missing_medication', count(*)
      FROM public.medication_schedules c LEFT JOIN public.medications p ON p.id = c.medication_id WHERE p.id IS NULL
      UNION ALL SELECT 'occurrence_missing_schedule', count(*)
      FROM public.schedule_occurrences c LEFT JOIN public.medication_schedules p ON p.id = c.schedule_id WHERE p.id IS NULL
      UNION ALL SELECT 'intake_missing_occurrence', count(*)
      FROM public.intake_logs c LEFT JOIN public.schedule_occurrences p ON p.id = c.occurrence_id WHERE p.id IS NULL
      UNION ALL SELECT 'delivery_missing_occurrence', count(*)
      FROM public.reminder_deliveries c LEFT JOIN public.schedule_occurrences p ON p.id = c.occurrence_id WHERE p.id IS NULL
      UNION ALL SELECT 'duplicate_auth_mapping', count(*)
      FROM (SELECT auth_user_id FROM public.patients GROUP BY auth_user_id HAVING count(*) > 1) duplicates
      UNION ALL SELECT 'empty_storage_path', count(*)
      FROM public.medical_documents WHERE storage_path IS NULL OR btrim(storage_path) = ''
      UNION ALL SELECT 'extraction_version_mismatch', count(*)
      FROM public.report_extractions e JOIN public.medical_documents d ON d.id = e.document_id
      WHERE e.document_version <> d.document_version
      UNION ALL SELECT 'foreign_or_wrong_type_prescription_link', count(*)
      FROM public.medications m LEFT JOIN public.medical_documents d ON d.id = m.prescription_id
      WHERE m.prescription_id IS NOT NULL AND (d.id IS NULL OR d.patient_id <> m.patient_id OR d.document_type <> 'PRESCRIPTION')
      UNION ALL SELECT 'episode_member_patient_mismatch', count(*)
      FROM public.episode_memberships m JOIN public.episodes e ON e.id = m.episode_id
      JOIN public.medical_documents d ON d.id = m.document_id WHERE e.patient_id <> d.patient_id
      UNION ALL SELECT 'episode_analysis_patient_mismatch', count(*)
      FROM public.episode_analyses a JOIN public.episodes e ON e.id = a.episode_id WHERE a.patient_id <> e.patient_id
      UNION ALL SELECT 'schedule_patient_mismatch', count(*)
      FROM public.medication_schedules s JOIN public.medications m ON m.id = s.medication_id WHERE s.patient_id <> m.patient_id
      UNION ALL SELECT 'occurrence_patient_mismatch', count(*)
      FROM public.schedule_occurrences o JOIN public.medication_schedules s ON s.id = o.schedule_id WHERE o.patient_id <> s.patient_id
      UNION ALL SELECT 'intake_patient_mismatch', count(*)
      FROM public.intake_logs i JOIN public.schedule_occurrences o ON o.id = i.occurrence_id WHERE i.patient_id <> o.patient_id
      UNION ALL SELECT 'delivery_patient_mismatch', count(*)
      FROM public.reminder_deliveries i JOIN public.schedule_occurrences o ON o.id = i.occurrence_id WHERE i.patient_id <> o.patient_id
    ) checks
  ),
  'migration_history', (
    SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', migration_name, 'checksum', checksum,
      'finished', finished_at IS NOT NULL, 'rolled_back', rolled_back_at IS NOT NULL,
      'applied_steps', applied_steps_count
    ) ORDER BY migration_name COLLATE "C", id COLLATE "C"), '[]'::jsonb)
    FROM public._prisma_migrations
  ),
  'schema_inventory', pg_catalog.jsonb_build_object(
    'counts', pg_catalog.jsonb_build_object(
      'relations', (SELECT count(*) FROM public_relations),
      'columns', (SELECT count(*) FROM public_columns),
      'constraints', (SELECT count(*) FROM public_constraints),
      'indexes', (SELECT count(*) FROM public_indexes),
      'enum_types', (SELECT count(DISTINCT enum_name) FROM public_enums),
      'enum_labels', (SELECT count(*) FROM public_enums)
    ),
    'relations', (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', relname, 'kind', relkind, 'persistence', relpersistence,
        'partition', relispartition, 'rls', relrowsecurity,
        'force_rls', relforcerowsecurity, 'replica_identity', relreplident
      ) ORDER BY relname COLLATE "C"), '[]'::jsonb) FROM public_relations
    ),
    'columns', (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'table', table_name, 'column', column_name, 'position', position,
        'type_schema', type_schema, 'type_name', type_name,
        'type_modifier', type_modifier, 'formatted_type', formatted_type,
        'not_null', not_null, 'default', default_expression,
        'identity', identity_kind, 'generated', generated_kind,
        'array_dimensions', array_dimensions
      ) ORDER BY table_name COLLATE "C", position), '[]'::jsonb) FROM public_columns
    ),
    'constraints', (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'table', table_name, 'name', constraint_name, 'type', constraint_type,
        'validated', validated, 'deferrable', is_deferrable,
        'initially_deferred', initially_deferred, 'no_inherit', no_inherit,
        'definition', definition
      ) ORDER BY table_name COLLATE "C", constraint_name COLLATE "C"), '[]'::jsonb) FROM public_constraints
    ),
    'indexes', (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'table', table_name, 'name', index_name, 'definition', definition,
        'unique', is_unique, 'primary', is_primary, 'exclusion', is_exclusion,
        'immediate', is_immediate, 'nulls_not_distinct', nulls_not_distinct,
        'valid', valid, 'ready', ready, 'live', live,
        'replica_identity', replica_identity, 'total_columns', total_columns,
        'key_columns', key_columns
      ) ORDER BY table_name COLLATE "C", index_name COLLATE "C"), '[]'::jsonb) FROM public_indexes
    ),
    'enums', (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', enum_name, 'label', label, 'order', sort_order
      ) ORDER BY enum_name COLLATE "C", sort_order), '[]'::jsonb) FROM public_enums
    ),
    'unsupported_object_counts', pg_catalog.jsonb_build_object(
      'nonordinary_relations', (SELECT count(*) FROM public_relations WHERE relkind <> 'r' OR relispartition),
      'inheritance_links', (SELECT count(*) FROM pg_catalog.pg_inherits i JOIN public_relations c ON c.oid = i.inhrelid),
      'user_triggers', (SELECT count(*) FROM pg_catalog.pg_trigger t JOIN public_relations c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal),
      'policies', (SELECT count(*) FROM pg_catalog.pg_policy p JOIN public_relations c ON c.oid = p.polrelid),
      'routines', (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'),
      'sequences', (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S'),
      'standalone_composites', (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'c'),
      'other_scalar_types', (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype NOT IN ('e', 'c') AND t.typelem = 0),
      'explicit_column_collations', (SELECT count(*) FROM public_columns a JOIN pg_catalog.pg_collation c ON c.oid = a.collation_oid JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace WHERE n.nspname <> 'pg_catalog' OR c.collname <> 'default')
    )
  ),
  'collation_context', pg_catalog.jsonb_build_object(
    'comparison_scope', 'REPORT_SEPARATELY_NOT_NATIVE_WINDOWS_LINUX_EQUIVALENCE',
    'server_version', pg_catalog.current_setting('server_version'),
    'database', (
      SELECT pg_catalog.jsonb_build_object(
        'encoding', pg_catalog.pg_encoding_to_char(d.encoding),
        'provider', d.datlocprovider, 'lc_collate', d.datcollate,
        'lc_ctype', d.datctype, 'locale', d.datlocale,
        'icu_rules', d.daticurules, 'stored_version', d.datcollversion
      ) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database()
    ),
    'column_collations', (
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'table', a.table_name, 'column', a.column_name,
        'schema', n.nspname, 'name', c.collname, 'provider', c.collprovider,
        'deterministic', c.collisdeterministic,
        'lc_collate', c.collcollate, 'lc_ctype', c.collctype,
        'locale', c.colllocale, 'icu_rules', c.collicurules,
        'stored_version', c.collversion
      ) ORDER BY a.table_name COLLATE "C", a.position), '[]'::jsonb)
      FROM public_columns a
      JOIN pg_catalog.pg_collation c ON c.oid = a.collation_oid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.collnamespace
    )
  )
) AS evidence;
