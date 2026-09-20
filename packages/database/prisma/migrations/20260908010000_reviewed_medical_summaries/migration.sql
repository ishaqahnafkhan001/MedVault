BEGIN;
SET LOCAL lock_timeout = '5s';
-- CreateTable
CREATE TABLE "medical_summaries" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "scope_key" VARCHAR(80) NOT NULL,
    "episode_id" UUID,
    "document_id" UUID,
    "input_fingerprint" CHAR(64) NOT NULL,
    "source_snapshot" JSONB NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "result" JSONB,
    "model" VARCHAR(120) NOT NULL,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'google',
    "prompt_version" VARCHAR(80) NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" UUID NOT NULL,
    "claim_token" UUID,
    "lease_until" TIMESTAMP(3),
    "failure_code" VARCHAR(80),
    "analyzed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_summaries_scope_key_key" ON "medical_summaries"("scope_key");

-- CreateIndex
CREATE INDEX "medical_summaries_patient_id_status_idx" ON "medical_summaries"("patient_id", "status");

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "medical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.medical_summaries ADD CONSTRAINT medical_summary_scope_check CHECK (
  (episode_id IS NOT NULL AND document_id IS NULL AND scope_key = 'EPISODE-' || episode_id::text)
  OR (document_id IS NOT NULL AND episode_id IS NULL AND scope_key = 'REPORT-' || document_id::text)
);
ALTER TABLE public.medical_summaries ADD CONSTRAINT medical_summary_status_check CHECK (status IN ('QUEUED','PROCESSING','COMPLETED','FAILED','STALE'));
ALTER TABLE public.medical_summaries ADD CONSTRAINT medical_summary_attempts_check CHECK (attempts BETWEEN 0 AND 4 AND generation > 0);

CREATE SCHEMA IF NOT EXISTS medvault_private;
REVOKE ALL ON SCHEMA medvault_private FROM PUBLIC, anon, authenticated;

-- Source writes, snapshot capture and final publication share a patient-row fence.
-- No lock is held across an AI/Redis request. Invalidation is conservatively patient-wide.
CREATE FUNCTION medvault_private.invalidate_medical_summaries() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE source_row jsonb; owner_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN source_row := to_jsonb(OLD); ELSE source_row := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME IN ('medical_documents', 'episodes') THEN
    owner_id := (source_row ->> 'patient_id')::uuid;
  ELSIF TG_TABLE_NAME = 'episode_memberships' THEN
    SELECT patient_id INTO owner_id FROM public.episodes WHERE id = (source_row ->> 'episode_id')::uuid;
  ELSIF TG_TABLE_NAME = 'report_extractions' THEN
    SELECT patient_id INTO owner_id FROM public.medical_documents WHERE id = (source_row ->> 'document_id')::uuid;
  ELSIF TG_TABLE_NAME = 'report_measurements' THEN
    SELECT d.patient_id INTO owner_id FROM public.medical_documents d JOIN public.report_extractions e ON e.document_id=d.id WHERE e.id=(source_row ->> 'extraction_id')::uuid;
  END IF;
  IF owner_id IS NOT NULL THEN
    PERFORM id FROM public.patients WHERE id=owner_id FOR UPDATE;
    UPDATE public.medical_summaries SET status='STALE', claim_token=NULL, lease_until=NULL, updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    WHERE patient_id=owner_id AND status <> 'STALE';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
REVOKE ALL ON FUNCTION medvault_private.invalidate_medical_summaries() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER medvault_summary_document_change BEFORE UPDATE OR DELETE ON public.medical_documents FOR EACH ROW EXECUTE FUNCTION medvault_private.invalidate_medical_summaries();
CREATE TRIGGER medvault_summary_extraction_change BEFORE INSERT OR UPDATE OR DELETE ON public.report_extractions FOR EACH ROW EXECUTE FUNCTION medvault_private.invalidate_medical_summaries();
CREATE TRIGGER medvault_summary_measurement_change BEFORE INSERT OR UPDATE OR DELETE ON public.report_measurements FOR EACH ROW EXECUTE FUNCTION medvault_private.invalidate_medical_summaries();
CREATE TRIGGER medvault_summary_episode_change BEFORE UPDATE OR DELETE ON public.episodes FOR EACH ROW EXECUTE FUNCTION medvault_private.invalidate_medical_summaries();
CREATE TRIGGER medvault_summary_membership_change BEFORE INSERT OR UPDATE OR DELETE ON public.episode_memberships FOR EACH ROW EXECUTE FUNCTION medvault_private.invalidate_medical_summaries();

-- Browser access is through authenticated Express, not table-level Data API access.
ALTER TABLE public.medical_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_analyses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medical_summaries, public.episodes, public.episode_memberships, public.episode_analyses FROM PUBLIC, anon, authenticated;
COMMIT;
