-- Custom Access Token Hook: project-controlled role claims sourced from the
-- gateway's canonical role table. API authorization continues to read live rows.
BEGIN;

CREATE POLICY user_roles_auth_hook_read
  ON auth_gateway.user_roles
  FOR SELECT
  TO supabase_auth_admin
  USING (true);

GRANT USAGE ON SCHEMA auth_gateway TO supabase_auth_admin;
GRANT SELECT ON TABLE auth_gateway.user_roles TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION auth_gateway.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  claims jsonb := COALESCE(event->'claims', '{}'::jsonb);
  roles jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(user_role.role ORDER BY user_role.role), '[]'::jsonb)
    INTO roles
    FROM auth_gateway.user_roles AS user_role
   WHERE user_role.user_id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{app_roles}', roles, true);
  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;

REVOKE ALL ON FUNCTION auth_gateway.custom_access_token_hook(jsonb)
  FROM PUBLIC, anon, authenticated, app_runtime, gateway_runtime;
GRANT EXECUTE ON FUNCTION auth_gateway.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

COMMIT;
