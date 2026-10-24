CREATE TYPE "public"."coverage_request_status" AS ENUM('draft', 'submitted', 'under_review', 'granted', 'rejected', 'info_requested', 'used', 'billed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "coverage_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coverage_request_id" uuid NOT NULL,
	"from_status" "coverage_request_status",
	"to_status" "coverage_request_status" NOT NULL,
	"actor_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coverage_request_id" uuid NOT NULL,
	"act_code" text NOT NULL,
	"act_label" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_amount" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "coverage_request_items_quantity" CHECK ("coverage_request_items"."quantity" >= 1),
	CONSTRAINT "coverage_request_items_unit_price" CHECK ("coverage_request_items"."unit_price" > 0),
	CONSTRAINT "coverage_request_items_line_amount" CHECK ("coverage_request_items"."line_amount" = "coverage_request_items"."quantity" * "coverage_request_items"."unit_price")
);
--> statement-breakpoint
CREATE TABLE "coverage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"affiliation_id" uuid NOT NULL,
	"diagnosis_code" text NOT NULL,
	"estimated_amount" integer NOT NULL,
	"granted_amount" integer,
	"patient_share" integer,
	"valid_until" date,
	"status" "coverage_request_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coverage_requests_estimated_not_negative" CHECK ("coverage_requests"."estimated_amount" >= 0),
	CONSTRAINT "coverage_requests_granted_in_range" CHECK ("coverage_requests"."granted_amount" IS NULL OR ("coverage_requests"."granted_amount" > 0 AND "coverage_requests"."granted_amount" <= "coverage_requests"."estimated_amount")),
	CONSTRAINT "coverage_requests_patient_share" CHECK ("coverage_requests"."granted_amount" IS NULL OR "coverage_requests"."patient_share" = "coverage_requests"."estimated_amount" - "coverage_requests"."granted_amount"),
	CONSTRAINT "coverage_requests_grant_complete" CHECK (("coverage_requests"."granted_amount" IS NULL) = ("coverage_requests"."patient_share" IS NULL) AND ("coverage_requests"."granted_amount" IS NULL) = ("coverage_requests"."valid_until" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "medical_acts" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"reference_price" integer NOT NULL,
	CONSTRAINT "medical_acts_reference_price_positive" CHECK ("medical_acts"."reference_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "coverage_request_events" ADD CONSTRAINT "coverage_request_events_coverage_request_id_coverage_requests_id_fk" FOREIGN KEY ("coverage_request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_request_events" ADD CONSTRAINT "coverage_request_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_request_items" ADD CONSTRAINT "coverage_request_items_coverage_request_id_coverage_requests_id_fk" FOREIGN KEY ("coverage_request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_request_items" ADD CONSTRAINT "coverage_request_items_act_code_medical_acts_code_fk" FOREIGN KEY ("act_code") REFERENCES "public"."medical_acts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_center_id_organizations_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_insurer_id_organizations_id_fk" FOREIGN KEY ("insurer_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_affiliation_id_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "public"."affiliations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_diagnosis_code_icd10_codes_code_fk" FOREIGN KEY ("diagnosis_code") REFERENCES "public"."icd10_codes"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coverage_request_events_coverage_request_id_created_at_index" ON "coverage_request_events" USING btree ("coverage_request_id","created_at");--> statement-breakpoint
CREATE INDEX "coverage_request_items_coverage_request_id_index" ON "coverage_request_items" USING btree ("coverage_request_id");--> statement-breakpoint
CREATE INDEX "coverage_requests_center_id_status_index" ON "coverage_requests" USING btree ("center_id","status");--> statement-breakpoint
CREATE INDEX "coverage_requests_insurer_id_status_index" ON "coverage_requests" USING btree ("insurer_id","status");--> statement-breakpoint
CREATE INDEX "coverage_requests_patient_id_index" ON "coverage_requests" USING btree ("patient_id");