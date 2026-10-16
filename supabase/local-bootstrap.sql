-- Only for the isolated Compose database. GoTrue creates its own real auth tables.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE supabase_auth_admin LOGIN PASSWORD 'local_auth_only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;

CREATE ROLE napl_local LOGIN PASSWORD 'napl_local_only'
  NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
