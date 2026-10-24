CREATE TABLE "consultation_addenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"appointment_id" uuid,
	"reason" text NOT NULL,
	"examination" text,
	"vitals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"consultation_id" uuid NOT NULL,
	"code" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "diagnoses_consultation_id_code_pk" PRIMARY KEY("consultation_id","code")
);
--> statement-breakpoint
CREATE TABLE "icd10_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultation_addenda" ADD CONSTRAINT "consultation_addenda_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_addenda" ADD CONSTRAINT "consultation_addenda_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_code_icd10_codes_code_fk" FOREIGN KEY ("code") REFERENCES "public"."icd10_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_addenda_consultation_id_index" ON "consultation_addenda" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "consultations_patient_id_index" ON "consultations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "consultations_organization_id_index" ON "consultations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diagnoses_one_primary" ON "diagnoses" USING btree ("consultation_id") WHERE "diagnoses"."is_primary";