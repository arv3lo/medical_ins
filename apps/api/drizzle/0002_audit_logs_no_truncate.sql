-- Row-level triggers do not fire on TRUNCATE, including a TRUNCATE ... CASCADE from users or
-- organizations: reject it with a statement-level trigger.
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_reject_change();
