BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The browser reaches application data through Express, never PostgREST.
-- Keep the direct PostgreSQL runtime identity separate from the migration owner.
-- LOGIN/password provisioning is an operational cutover step and is deliberately
-- excluded from version control. BYPASSRLS is restricted to this non-login role;
-- it receives DML only on the exact application table set below.
DO $$
DECLARE
  existing_role record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
         rolreplication, rolbypassrls
  INTO existing_role
  FROM pg_catalog.pg_roles
  WHERE rolname = 'medvault_runtime';

  IF NOT FOUND THEN
    CREATE ROLE medvault_runtime
      NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE
      NOREPLICATION BYPASSRLS;
  ELSIF existing_role.rolcanlogin
     OR existing_role.rolsuper
     OR existing_role.rolinherit
     OR existing_role.rolcreaterole
     OR existing_role.rolcreatedb
     OR existing_role.rolreplication
     OR NOT existing_role.rolbypassrls THEN
    RAISE EXCEPTION 'Existing medvault_runtime role does not match the reviewed disabled runtime role';
  END IF;
END;
$$;

DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT CONNECT ON DATABASE %I TO medvault_runtime',
    pg_catalog.current_database()
  );
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role, medvault_runtime;
GRANT USAGE ON SCHEMA public TO medvault_runtime;

REVOKE ALL PRIVILEGES ON TABLE
  public.patients,
  public.patient_profiles,
  public.medical_documents,
  public.report_extractions,
  public.report_measurements,
  public.episodes,
  public.episode_memberships,
  public.episode_analyses,
  public.medications,
  public.medication_schedules,
  public.schedule_occurrences,
  public.intake_logs,
  public.reminder_deliveries,
  public.medical_summaries,
  public._prisma_migrations
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.patients,
  public.patient_profiles,
  public.medical_documents,
  public.report_extractions,
  public.report_measurements,
  public.episodes,
  public.episode_memberships,
  public.episode_analyses,
  public.medications,
  public.medication_schedules,
  public.schedule_occurrences,
  public.intake_logs,
  public.reminder_deliveries,
  public.medical_summaries
TO medvault_runtime;

REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM medvault_runtime;

REVOKE ALL ON SCHEMA medvault_private
FROM PUBLIC, anon, authenticated, service_role, medvault_runtime;
REVOKE ALL ON FUNCTION medvault_private.invalidate_medical_summaries()
FROM PUBLIC, anon, authenticated, service_role, medvault_runtime;

-- Existing Supabase projects automatically grant Data API roles access to new
-- objects created by postgres. Make application exposure opt-in. The first set
-- covers a non-postgres rehearsal/migration owner; the second pins production's
-- current postgres migration owner. Do not modify supabase_admin provider defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA medvault_private
  REVOKE ALL PRIVILEGES ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role, medvault_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA medvault_private
  REVOKE ALL PRIVILEGES ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role, medvault_runtime;

COMMIT;
