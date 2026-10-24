-- A doctor never holds two overlapping slots. Cancelled and no-show appointments free their slot.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE appointments ADD CONSTRAINT appointments_doctor_no_overlap
  EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('scheduled', 'arrived', 'completed'));
