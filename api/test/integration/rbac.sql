-- Runs against the isolated PostgreSQL instance after the RBAC migration and seed.
INSERT INTO auth_gateway.user_roles(user_id, role)
VALUES ('44444444-4444-4444-8444-444444444444', 'admin');

DO $$
DECLARE
BEGIN
  IF NOT pg_has_role('api_test', 'app_runtime', 'USAGE')
     OR NOT pg_has_role('api_test', 'gateway_runtime', 'USAGE') THEN
    RAISE EXCEPTION 'the API login must inherit application and authentication permissions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'api_test'
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'the API login must remain restricted';
  END IF;
  IF NOT has_table_privilege('supabase_auth_admin', 'auth_gateway.user_roles', 'SELECT') THEN
    RAISE EXCEPTION 'auth hook role cannot read canonical roles';
  END IF;
  IF NOT has_function_privilege('supabase_auth_admin', 'auth_gateway.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'auth hook role cannot execute custom token hook';
  END IF;
  IF has_table_privilege('supabase_auth_admin', 'auth_gateway.user_roles', 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
    RAISE EXCEPTION 'auth hook must not change canonical roles';
  END IF;
  IF has_function_privilege('anon', 'auth_gateway.custom_access_token_hook(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'auth_gateway.custom_access_token_hook(jsonb)', 'EXECUTE')
     OR has_function_privilege('app_runtime', 'auth_gateway.custom_access_token_hook(jsonb)', 'EXECUTE')
     OR has_function_privilege('gateway_runtime', 'auth_gateway.custom_access_token_hook(jsonb)', 'EXECUTE')
     OR has_function_privilege('api_test', 'auth_gateway.custom_access_token_hook(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a client or runtime role can execute the auth hook';
  END IF;
  IF has_table_privilege('anon', 'auth_gateway.user_roles', 'SELECT')
     OR has_table_privilege('authenticated', 'auth_gateway.user_roles', 'SELECT') THEN
    RAISE EXCEPTION 'a client role can read canonical roles';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'auth_gateway.user_roles'::regclass) THEN
    RAISE EXCEPTION 'canonical roles table must have row level security enabled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'auth_gateway'
      AND proc.proname = 'custom_access_token_hook'
      AND proc.prosecdef
  ) THEN
    RAISE EXCEPTION 'custom token hook must remain SECURITY INVOKER';
  END IF;
END;
$$;

SET ROLE supabase_auth_admin;
DO $$
DECLARE
  result jsonb;
  claims jsonb;
BEGIN
  result := auth_gateway.custom_access_token_hook(jsonb_build_object(
    'user_id', '44444444-4444-4444-8444-444444444444',
    'claims', jsonb_build_object(
      'role', 'authenticated',
      'aud', 'authenticated',
      'sub', '44444444-4444-4444-8444-444444444444',
      'email', 'admin@example.test',
      'preserved_claim', 'keep-me',
      'user_metadata', jsonb_build_object('app_roles', jsonb_build_array('metadata-only'))
    )
  ));
  claims := result->'claims';
  IF claims->'app_roles' <> '["admin"]'::jsonb THEN
    RAISE EXCEPTION 'hook did not add canonical roles: %', claims->'app_roles';
  END IF;
  IF claims->>'role' <> 'authenticated' OR claims->>'preserved_claim' <> 'keep-me'
     OR claims->>'email' <> 'admin@example.test'
     OR claims#>'{user_metadata,app_roles}' <> '["metadata-only"]'::jsonb THEN
    RAISE EXCEPTION 'hook changed or dropped standard/custom claims: %', claims;
  END IF;
END;
$$;
RESET ROLE;

DELETE FROM auth_gateway.user_roles
 WHERE user_id = '44444444-4444-4444-8444-444444444444';

SET ROLE supabase_auth_admin;
DO $$
DECLARE
  result jsonb;
BEGIN
  result := auth_gateway.custom_access_token_hook(jsonb_build_object(
    'user_id', '44444444-4444-4444-8444-444444444444',
    'claims', jsonb_build_object('role', 'authenticated', 'app_roles', '["stale"]'::jsonb)
  ));
  IF result#>'{claims,app_roles}' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'removed roles remain in claims: %', result#>'{claims,app_roles}';
  END IF;
  IF result#>>'{claims,role}' <> 'authenticated' THEN
    RAISE EXCEPTION 'hook failed to preserve the standard authenticated role';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    EXECUTE 'SELECT 1 FROM auth_gateway.user_roles';
    RAISE EXCEPTION 'anon unexpectedly read canonical roles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    EXECUTE $query$SELECT auth_gateway.custom_access_token_hook('{}'::jsonb)$query$;
    RAISE EXCEPTION 'anon unexpectedly executed the auth hook';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;

SET ROLE authenticated;
DO $$
BEGIN
  BEGIN
    EXECUTE 'SELECT 1 FROM auth_gateway.user_roles';
    RAISE EXCEPTION 'authenticated unexpectedly read canonical roles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    EXECUTE $query$SELECT auth_gateway.custom_access_token_hook('{}'::jsonb)$query$;
    RAISE EXCEPTION 'authenticated unexpectedly executed the auth hook';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
RESET ROLE;
