-- DO NOT DEPLOY BLINDLY: the current hosted database already has these objects,
-- without their migration history. See docs/PHASE2_MIGRATION_RUNBOOK.md.
-- This is a transparent schema capture, not evidence that a migration ran.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- CreateEnum
CREATE TYPE "MedicationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'DISCONTINUED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY', 'EVERY_X_HOURS', 'AS_NEEDED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MealTiming" AS ENUM ('BEFORE_MEAL', 'WITH_MEAL', 'AFTER_MEAL', 'NOT_SPECIFIED');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'DUE', 'OVERDUE', 'TAKEN', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_memberships" (
    "episode_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_memberships_pkey" PRIMARY KEY ("episode_id","document_id")
);

-- CreateTable
CREATE TABLE "episode_analyses" (
    "id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "summary_text" TEXT,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "prompt_version" VARCHAR(40) NOT NULL,
    "source_versions" JSONB NOT NULL,
    "input_fingerprint" CHAR(64),
    "analyzed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medications" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "resolved_generic" VARCHAR(200),
    "resolved_status" VARCHAR(40) NOT NULL DEFAULT 'UNRESOLVED',
    "strength" VARCHAR(80),
    "dose_amount" VARCHAR(80),
    "dose_unit" VARCHAR(40),
    "formulation" VARCHAR(80),
    "route" VARCHAR(80),
    "start_date" DATE,
    "end_date" DATE,
    "status" "MedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "prescription_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_schedules" (
    "id" UUID NOT NULL,
    "medication_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "frequency" "ScheduleFrequency" NOT NULL,
    "administration_times" JSONB NOT NULL,
    "meal_timing" "MealTiming" NOT NULL DEFAULT 'NOT_SPECIFIED',
    "iana_timezone" VARCHAR(80) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "stock_count" INTEGER,
    "refill_alert_at" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_occurrences" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "schedule_version" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "local_time_str" VARCHAR(20) NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_logs" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "channel" VARCHAR(40) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempted_at" TIMESTAMP(3),
    "failure_code" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "episodes_patient_id_start_date_idx" ON "episodes"("patient_id", "start_date" DESC);

-- CreateIndex
CREATE INDEX "episode_analyses_episode_id_created_at_idx" ON "episode_analyses"("episode_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "episode_analyses_episode_id_input_fingerprint_idx" ON "episode_analyses"("episode_id", "input_fingerprint");

-- CreateIndex
CREATE INDEX "medications_patient_id_status_idx" ON "medications"("patient_id", "status");

-- CreateIndex
CREATE INDEX "medication_schedules_medication_id_idx" ON "medication_schedules"("medication_id");

-- CreateIndex
CREATE INDEX "medication_schedules_patient_id_active_start_date_idx" ON "medication_schedules"("patient_id", "active", "start_date");

-- CreateIndex
CREATE INDEX "schedule_occurrences_patient_id_due_at_idx" ON "schedule_occurrences"("patient_id", "due_at");

-- CreateIndex
CREATE INDEX "schedule_occurrences_schedule_id_status_idx" ON "schedule_occurrences"("schedule_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_occurrences_schedule_id_due_at_key" ON "schedule_occurrences"("schedule_id", "due_at");

-- CreateIndex
CREATE INDEX "intake_logs_occurrence_id_idx" ON "intake_logs"("occurrence_id");

-- CreateIndex
CREATE INDEX "intake_logs_patient_id_logged_at_idx" ON "intake_logs"("patient_id", "logged_at" DESC);

-- CreateIndex
CREATE INDEX "reminder_deliveries_occurrence_id_idx" ON "reminder_deliveries"("occurrence_id");

-- CreateIndex
CREATE INDEX "reminder_deliveries_patient_id_status_idx" ON "reminder_deliveries"("patient_id", "status");

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_memberships" ADD CONSTRAINT "episode_memberships_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_memberships" ADD CONSTRAINT "episode_memberships_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "medical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_analyses" ADD CONSTRAINT "episode_analyses_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_analyses" ADD CONSTRAINT "episode_analyses_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "medical_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "medication_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_logs" ADD CONSTRAINT "intake_logs_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
