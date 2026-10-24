CREATE TYPE "public"."sex" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TABLE "patient_center_links" (
	"patient_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_center_links_patient_id_organization_id_pk" PRIMARY KEY("patient_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_name" text NOT NULL,
	"first_names" text NOT NULL,
	"birth_date" date NOT NULL,
	"sex" "sex" NOT NULL,
	"national_id" text,
	"phone" text,
	"address" text,
	"region" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_center_links" ADD CONSTRAINT "patient_center_links_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_center_links" ADD CONSTRAINT "patient_center_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_center_links_organization_id_index" ON "patient_center_links" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_national_id_unique" ON "patients" USING btree ("national_id") WHERE "patients"."national_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "patients_last_name_birth_date_idx" ON "patients" USING btree (lower("last_name"),"birth_date");