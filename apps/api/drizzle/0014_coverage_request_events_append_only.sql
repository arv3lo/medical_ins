-- The history of a coverage request is evidence between a center and an insurer: an event, once
-- written, never changes. TRUNCATE (including a CASCADE from users) is rejected too.
CREATE FUNCTION coverage_request_events_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'coverage_request_events is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER coverage_request_events_append_only
  BEFORE UPDATE OR DELETE ON coverage_request_events
  FOR EACH ROW EXECUTE FUNCTION coverage_request_events_reject_change();
--> statement-breakpoint
CREATE TRIGGER coverage_request_events_no_truncate
  BEFORE TRUNCATE ON coverage_request_events
  FOR EACH STATEMENT EXECUTE FUNCTION coverage_request_events_reject_change();
