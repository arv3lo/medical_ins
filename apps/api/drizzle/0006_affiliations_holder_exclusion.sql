-- One holder number at one insurer belongs to one patient, not to one row: the same patient may
-- declare several periods, and a rejected or withdrawn declaration holds nothing. Dependents carry
-- their holder's number. btree_gist provides the = and <> operators on uuid and text for gist.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_holder_member_number_excl"
  EXCLUDE USING gist ("insurer_id" WITH =, "member_number" WITH =, "patient_id" WITH <>)
  WHERE ("holder_status" = 'holder' AND "status" IN ('pending', 'validated'));
