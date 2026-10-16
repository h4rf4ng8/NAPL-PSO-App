-- Runs as the migration owner after the role-audit migration and test seed.
DO $$
BEGIN
  IF NOT has_table_privilege(current_user, 'auth_gateway.role_audit_events', 'SELECT') THEN
    RAISE EXCEPTION 'migration owner cannot inspect role audit history';
  END IF;
  IF NOT has_table_privilege('app_runtime', 'auth_gateway.role_audit_events', 'INSERT') THEN
    RAISE EXCEPTION 'API runtime cannot append role audit events';
  END IF;
  IF NOT has_table_privilege('api_test', 'auth_gateway.role_audit_events', 'INSERT')
     OR has_table_privilege('api_test', 'auth_gateway.role_audit_events', 'SELECT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'the shared API login must only append role audit events';
  END IF;
  IF has_table_privilege('app_runtime', 'auth_gateway.role_audit_events', 'SELECT')
     OR has_table_privilege('app_runtime', 'auth_gateway.role_audit_events', 'UPDATE')
     OR has_table_privilege('app_runtime', 'auth_gateway.role_audit_events', 'DELETE')
     OR has_table_privilege('app_runtime', 'auth_gateway.role_audit_events', 'TRUNCATE') THEN
    RAISE EXCEPTION 'API runtime can read or alter role audit history';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['gateway_runtime','anon','authenticated']) AS user_name
    WHERE has_table_privilege(user_name, 'auth_gateway.role_audit_events', 'SELECT')
       OR has_table_privilege(user_name, 'auth_gateway.role_audit_events', 'INSERT')
       OR has_table_privilege(user_name, 'auth_gateway.role_audit_events', 'UPDATE')
       OR has_table_privilege(user_name, 'auth_gateway.role_audit_events', 'DELETE')
       OR has_table_privilege(user_name, 'auth_gateway.role_audit_events', 'TRUNCATE')
  ) THEN
    RAISE EXCEPTION 'non-API runtime can access role audit history';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'auth_gateway.role_audit_events'::regclass) THEN
    RAISE EXCEPTION 'role audit table must have row-level security enabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'auth_gateway.role_audit_events'::regclass AND contype = 'f'
  ) THEN
    RAISE EXCEPTION 'role audit history must survive account deletion';
  END IF;
END;
$$;

SET ROLE app_runtime;
DO $$
BEGIN
  BEGIN
    EXECUTE 'SELECT * FROM auth_gateway.role_audit_events';
    RAISE EXCEPTION 'app_runtime unexpectedly read role audit history';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'DELETE FROM auth_gateway.role_audit_events';
    RAISE EXCEPTION 'app_runtime unexpectedly deleted role audit history';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
