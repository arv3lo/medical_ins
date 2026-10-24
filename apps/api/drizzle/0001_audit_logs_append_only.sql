-- The audit log is append-only: the application may insert, never change or remove an entry.
CREATE FUNCTION audit_logs_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_change();
