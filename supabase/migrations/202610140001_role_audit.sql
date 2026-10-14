-- Preserve who changed the live administrator set and the exact transition.
BEGIN;

CREATE TABLE auth_gateway.role_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  previous_admin_user_ids jsonb NOT NULL CHECK (jsonb_typeof(previous_admin_user_ids) = 'array'),
  next_admin_user_ids jsonb NOT NULL CHECK (jsonb_typeof(next_admin_user_ids) = 'array')
);

ALTER TABLE auth_gateway.role_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_audit_runtime_insert
  ON auth_gateway.role_audit_events
  FOR INSERT TO app_runtime
  WITH CHECK (true);

REVOKE ALL ON TABLE auth_gateway.role_audit_events FROM PUBLIC, anon, authenticated, app_runtime, gateway_runtime;
GRANT INSERT ON TABLE auth_gateway.role_audit_events TO app_runtime;

COMMIT;
