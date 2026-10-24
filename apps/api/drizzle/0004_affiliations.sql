CREATE TYPE "public"."affiliation_status" AS ENUM('pending', 'validated', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."holder_status" AS ENUM('holder', 'dependent');--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"member_number" text NOT NULL,
	"holder_status" "holder_status" NOT NULL,
	"plan_name" text,
	"employer" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"status" "affiliation_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"declared_by_organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliations_dates_check" CHECK ("affiliations"."ends_on" IS NULL OR "affiliations"."ends_on" >= "affiliations"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_insurer_id_organizations_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_declared_by_organization_id_organizations_id_fk" FOREIGN KEY ("declared_by_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliations_holder_member_number_unique" ON "affiliations" USING btree ("insurer_id","member_number") WHERE "affiliations"."holder_status" = 'holder';--> statement-breakpoint
CREATE INDEX "affiliations_patient_id_index" ON "affiliations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "affiliations_insurer_id_status_index" ON "affiliations" USING btree ("insurer_id","status");