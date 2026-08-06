-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('REPORT', 'PRESCRIPTION');
CREATE TYPE "ProcessingStatus" AS ENUM ('NOT_APPLICABLE', 'UPLOADED', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'VERIFIED', 'FAILED');
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'VERIFIED');
CREATE TYPE "ReportCategory" AS ENUM ('HEMATOLOGY', 'BIOCHEMISTRY', 'IMMUNOLOGY', 'MICROBIOLOGY', 'ENDOCRINOLOGY', 'CARDIOLOGY', 'RADIOLOGY', 'PATHOLOGY', 'URINALYSIS', 'OTHER');
CREATE TYPE "ExtractionStatus" AS ENUM ('DRAFT', 'VERIFIED');

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "patient_profiles" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "date_of_birth" DATE,
    "gender" VARCHAR(40),
    "blood_group" VARCHAR(3),
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "chronic_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emergency_contact_name" VARCHAR(120),
    "emergency_contact_phone" VARCHAR(40),
    "emergency_contact_relation" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "medical_documents" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_path" VARCHAR(600) NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "document_version" INTEGER NOT NULL DEFAULT 1,
    "document_date" DATE,
    "hospital_name" VARCHAR(180),
    "test_name" VARCHAR(180),
    "normalized_test_name" VARCHAR(180),
    "category" "ReportCategory",
    "processing_status" "ProcessingStatus" NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL,
    "processing_attempts" INTEGER NOT NULL DEFAULT 0,
    "processing_started_at" TIMESTAMP(3),
    "failure_code" VARCHAR(80),
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "medical_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_extractions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version" INTEGER NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'DRAFT',
    "document_report_type" VARCHAR(120) NOT NULL,
    "extracted_test_name" VARCHAR(180) NOT NULL,
    "normalized_test_name" VARCHAR(180) NOT NULL,
    "extracted_report_date" DATE,
    "extracted_hospital_name" VARCHAR(180),
    "extracted_category" "ReportCategory" NOT NULL,
    "patient_name_on_report" VARCHAR(120),
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(120) NOT NULL,
    "schema_version" VARCHAR(40) NOT NULL,
    "raw_output" JSONB NOT NULL,
    "analyzed_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_extractions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_measurements" (
    "id" UUID NOT NULL,
    "extraction_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "normalized_name" VARCHAR(180) NOT NULL,
    "text_value" VARCHAR(240),
    "numeric_value" DOUBLE PRECISION,
    "unit" VARCHAR(80),
    "reference_range" VARCHAR(160),
    "source_flag" VARCHAR(40),
    "verified_name" VARCHAR(180),
    "verified_normalized_name" VARCHAR(180),
    "verified_text_value" VARCHAR(240),
    "verified_numeric_value" DOUBLE PRECISION,
    "verified_unit" VARCHAR(80),
    "verified_reference_range" VARCHAR(160),
    "verified_source_flag" VARCHAR(40),
    "patient_corrected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_auth_user_id_key" ON "patients"("auth_user_id");
CREATE UNIQUE INDEX "patient_profiles_patient_id_key" ON "patient_profiles"("patient_id");
CREATE UNIQUE INDEX "medical_documents_storage_path_key" ON "medical_documents"("storage_path");
CREATE INDEX "medical_documents_patient_id_created_at_idx" ON "medical_documents"("patient_id", "created_at" DESC);
CREATE INDEX "medical_documents_patient_id_document_type_processing_statu_idx" ON "medical_documents"("patient_id", "document_type", "processing_status");
CREATE INDEX "medical_documents_patient_id_verification_status_normalized_idx" ON "medical_documents"("patient_id", "verification_status", "normalized_test_name", "document_date" DESC, "created_at" DESC);
CREATE UNIQUE INDEX "report_extractions_document_id_key" ON "report_extractions"("document_id");
CREATE UNIQUE INDEX "report_extractions_document_id_document_version_key" ON "report_extractions"("document_id", "document_version");
CREATE UNIQUE INDEX "report_measurements_extraction_id_sort_order_key" ON "report_measurements"("extraction_id", "sort_order");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medical_documents" ADD CONSTRAINT "medical_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_extractions" ADD CONSTRAINT "report_extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "medical_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_measurements" ADD CONSTRAINT "report_measurements_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "report_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
