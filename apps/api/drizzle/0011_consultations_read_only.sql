-- A signed consultation is a medical record: neither it nor its diagnoses change afterwards.
-- Corrections go to consultation_addenda, which is itself append-only.
CREATE FUNCTION consultations_reject_signed_change() RETURNS trigger AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'consultation % is signed (% rejected)', OLD.id, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER consultations_read_only_once_signed
  BEFORE UPDATE OR DELETE ON consultations
  FOR EACH ROW EXECUTE FUNCTION consultations_reject_signed_change();
--> statement-breakpoint
CREATE FUNCTION diagnoses_reject_signed_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1 FROM consultations WHERE id = OLD.consultation_id AND signed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'consultation % is signed (% on diagnoses rejected)', OLD.consultation_id, TG_OP;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND EXISTS (
    SELECT 1 FROM consultations WHERE id = NEW.consultation_id AND signed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'consultation % is signed (% on diagnoses rejected)', NEW.consultation_id, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER diagnoses_read_only_once_signed
  BEFORE INSERT OR UPDATE OR DELETE ON diagnoses
  FOR EACH ROW EXECUTE FUNCTION diagnoses_reject_signed_change();
--> statement-breakpoint
CREATE FUNCTION consultation_addenda_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'consultation_addenda is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER consultation_addenda_append_only
  BEFORE UPDATE OR DELETE ON consultation_addenda
  FOR EACH ROW EXECUTE FUNCTION consultation_addenda_reject_change();
