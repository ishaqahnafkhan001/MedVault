-- EX-02 read-only preflight for the existing hosted project, not a backup.
-- Run only as an authorized inspector. All results are metadata or aggregate counts.
-- medical_summaries checks must be added AFTER it actually exists.
SELECT jsonb_build_object(
  'captured_at_utc', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
  'database', current_database(),
  'inspection_role', current_user,
  'server_version', current_setting('server_version'),
  'migration_history', (
    SELECT jsonb_agg(jsonb_build_object(
      'name', migration_name, 'checksum', checksum,
      'finished', finished_at IS NOT NULL, 'rolled_back', rolled_back_at IS NOT NULL,
      'applied_steps', applied_steps_count) ORDER BY migration_name)
    FROM public._prisma_migrations
  ),
  'row_counts', (
    SELECT jsonb_object_agg(table_name, rows) FROM (
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
    SELECT jsonb_object_agg(check_name, rows) FROM (
      SELECT 'profile_missing_patient' AS check_name, count(*) AS rows FROM public.patient_profiles c LEFT JOIN public.patients p ON p.id=c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'document_missing_patient', count(*) FROM public.medical_documents c LEFT JOIN public.patients p ON p.id=c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'extraction_missing_document', count(*) FROM public.report_extractions c LEFT JOIN public.medical_documents p ON p.id=c.document_id WHERE p.id IS NULL
      UNION ALL SELECT 'measurement_missing_extraction', count(*) FROM public.report_measurements c LEFT JOIN public.report_extractions p ON p.id=c.extraction_id WHERE p.id IS NULL
      UNION ALL SELECT 'episode_missing_patient', count(*) FROM public.episodes c LEFT JOIN public.patients p ON p.id=c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'membership_missing_parent', count(*) FROM public.episode_memberships c LEFT JOIN public.episodes e ON e.id=c.episode_id LEFT JOIN public.medical_documents d ON d.id=c.document_id WHERE e.id IS NULL OR d.id IS NULL
      UNION ALL SELECT 'analysis_missing_parent', count(*) FROM public.episode_analyses c LEFT JOIN public.episodes e ON e.id=c.episode_id LEFT JOIN public.patients p ON p.id=c.patient_id WHERE e.id IS NULL OR p.id IS NULL
      UNION ALL SELECT 'medication_missing_patient', count(*) FROM public.medications c LEFT JOIN public.patients p ON p.id=c.patient_id WHERE p.id IS NULL
      UNION ALL SELECT 'schedule_missing_medication', count(*) FROM public.medication_schedules c LEFT JOIN public.medications p ON p.id=c.medication_id WHERE p.id IS NULL
      UNION ALL SELECT 'occurrence_missing_schedule', count(*) FROM public.schedule_occurrences c LEFT JOIN public.medication_schedules p ON p.id=c.schedule_id WHERE p.id IS NULL
      UNION ALL SELECT 'intake_missing_occurrence', count(*) FROM public.intake_logs c LEFT JOIN public.schedule_occurrences p ON p.id=c.occurrence_id WHERE p.id IS NULL
      UNION ALL SELECT 'delivery_missing_occurrence', count(*) FROM public.reminder_deliveries c LEFT JOIN public.schedule_occurrences p ON p.id=c.occurrence_id WHERE p.id IS NULL
      UNION ALL SELECT 'patient_missing_auth_user', count(*) FROM public.patients p LEFT JOIN auth.users u ON u.id=p.auth_user_id WHERE u.id IS NULL
      UNION ALL SELECT 'duplicate_auth_mapping', count(*) FROM (SELECT auth_user_id FROM public.patients GROUP BY auth_user_id HAVING count(*)>1) duplicates
      UNION ALL SELECT 'empty_storage_path', count(*) FROM public.medical_documents WHERE storage_path IS NULL OR btrim(storage_path)=''
      UNION ALL SELECT 'extraction_version_mismatch', count(*) FROM public.report_extractions e JOIN public.medical_documents d ON d.id=e.document_id WHERE e.document_version<>d.document_version
      UNION ALL SELECT 'foreign_or_wrong_type_prescription_link', count(*) FROM public.medications m LEFT JOIN public.medical_documents d ON d.id=m.prescription_id WHERE m.prescription_id IS NOT NULL AND (d.id IS NULL OR d.patient_id<>m.patient_id OR d.document_type<>'PRESCRIPTION')
      UNION ALL SELECT 'episode_member_patient_mismatch', count(*) FROM public.episode_memberships m JOIN public.episodes e ON e.id=m.episode_id JOIN public.medical_documents d ON d.id=m.document_id WHERE e.patient_id<>d.patient_id
      UNION ALL SELECT 'episode_analysis_patient_mismatch', count(*) FROM public.episode_analyses a JOIN public.episodes e ON e.id=a.episode_id WHERE a.patient_id<>e.patient_id
      UNION ALL SELECT 'schedule_patient_mismatch', count(*) FROM public.medication_schedules s JOIN public.medications m ON m.id=s.medication_id WHERE s.patient_id<>m.patient_id
      UNION ALL SELECT 'occurrence_patient_mismatch', count(*) FROM public.schedule_occurrences o JOIN public.medication_schedules s ON s.id=o.schedule_id WHERE o.patient_id<>s.patient_id
      UNION ALL SELECT 'intake_patient_mismatch', count(*) FROM public.intake_logs i JOIN public.schedule_occurrences o ON o.id=i.occurrence_id WHERE i.patient_id<>o.patient_id
      UNION ALL SELECT 'delivery_patient_mismatch', count(*) FROM public.reminder_deliveries i JOIN public.schedule_occurrences o ON o.id=i.occurrence_id WHERE i.patient_id<>o.patient_id
      UNION ALL SELECT 'document_missing_storage_metadata', count(*) FROM public.medical_documents d LEFT JOIN storage.objects o ON o.bucket_id='medical-documents' AND o.name=d.storage_path WHERE o.id IS NULL
      UNION ALL SELECT 'storage_metadata_orphan_candidate', count(*) FROM storage.objects o LEFT JOIN public.medical_documents d ON d.storage_path=o.name WHERE o.bucket_id='medical-documents' AND d.id IS NULL
    ) checks
  ),
  'public_relations', (
    SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
  ),
  'effective_table_privileges', (
    SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'table',c.relname,
      'select',has_table_privilege(r.oid,c.oid,'SELECT'),
      'insert',has_table_privilege(r.oid,c.oid,'INSERT'),
      'update',has_table_privilege(r.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,c.oid,'DELETE'),
      'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE')) ORDER BY r.rolname,c.relname)
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND r.rolname IN ('anon','authenticated','service_role')
  ),
  'roles', (
    SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypass_rls',rolbypassrls,'create_db',rolcreatedb,'create_role',rolcreaterole) ORDER BY rolname)
    FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role') OR rolname LIKE 'medvault%'
  ),
  'default_acl', (
    SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'object_type',d.defaclobjtype,'acl',d.defaclacl::text) ORDER BY d.defaclrole,d.defaclobjtype)
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE n.nspname='public' OR d.defaclnamespace=0
  ),
  'public_policy_count', (SELECT count(*) FROM pg_policies WHERE schemaname='public'),
  'public_routine_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
  'public_user_trigger_count', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal),
  'summary_table_exists', to_regclass('public.medical_summaries') IS NOT NULL,
  'private_schema_exists', to_regnamespace('medvault_private') IS NOT NULL,
  'storage_bucket_private', (SELECT NOT public FROM storage.buckets WHERE id='medical-documents')
) AS evidence;
