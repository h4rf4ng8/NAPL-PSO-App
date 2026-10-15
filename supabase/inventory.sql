-- Read-only. Do not select provider credentials or application row contents.
SELECT n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth_gateway') ORDER BY 1,2;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('public','auth_gateway') ORDER BY 1,2,3;
SELECT n.nspname,p.proname,p.prosecdef,p.proacl,pg_get_function_identity_arguments(p.oid) args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','auth_gateway') ORDER BY 1,2;
SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls
FROM pg_roles WHERE rolname IN ('app_runtime','gateway_runtime','anon','authenticated');
SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage') ORDER BY 1,2,3;
SELECT count(*) AS conflicting_strikers_ids FROM (
  SELECT lower(strikers_id) FROM public.accounts WHERE strikers_id IS NOT NULL AND strikers_id<>''
  GROUP BY lower(strikers_id) HAVING count(*)>1
) conflicts;
