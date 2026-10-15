-- Apply only after capturing and replaying the actual deployment baseline.
-- This migration extends existing application tables; it is not that baseline.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='gateway_runtime') THEN
    CREATE ROLE gateway_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth_gateway;
REVOKE ALL ON SCHEMA auth_gateway FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA auth_gateway TO app_runtime, gateway_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
REVOKE CREATE ON SCHEMA public FROM app_runtime, gateway_runtime;

CREATE TABLE auth_gateway.memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id text NOT NULL,
  eligible boolean NOT NULL,
  valid_until timestamptz NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_gateway.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','super_admin')),
  PRIMARY KEY (user_id,role)
);
ALTER TABLE auth_gateway.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON auth_gateway.memberships FOR SELECT TO app_runtime USING (true);
CREATE POLICY membership_update ON auth_gateway.memberships FOR ALL TO gateway_runtime USING (true) WITH CHECK (true);
CREATE POLICY roles_runtime ON auth_gateway.user_roles FOR ALL TO app_runtime USING (true) WITH CHECK (true);
GRANT SELECT ON auth_gateway.memberships TO app_runtime;
GRANT SELECT,INSERT,UPDATE ON auth_gateway.memberships TO gateway_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_gateway.user_roles TO app_runtime;

CREATE FUNCTION auth_gateway.session_active(session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM auth.sessions WHERE id=session AND (not_after IS NULL OR not_after>now())) $$;
REVOKE ALL ON FUNCTION auth_gateway.session_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION auth_gateway.session_active(uuid) TO app_runtime;

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS seasons jsonb;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS formation text DEFAULT '2-1-2';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS lineup jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS accounts_strikers_id_unique ON public.accounts(lower(strikers_id)) WHERE strikers_id IS NOT NULL AND strikers_id<>'';

CREATE TABLE IF NOT EXISTS public.articles (
  id text PRIMARY KEY, slug text UNIQUE NOT NULL, title text NOT NULL,
  cover_image_url text, author text, body text NOT NULL DEFAULT '', excerpt text,
  published_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.scheduled_matches (
  id text PRIMARY KEY, season text, week integer, home_team_id text, away_team_id text,
  scheduled_date timestamptz, stream_url text, match_type text DEFAULT 'regular',
  playoff_round text, status text DEFAULT 'scheduled', home_score integer, away_score integer,
  linked_match_id text, notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.transfers (
  id text PRIMARY KEY, season text, player_username text, from_team_id text, to_team_id text,
  kind text, window_type text, created_at timestamptz DEFAULT now(), created_by text
);
CREATE TABLE IF NOT EXISTS public.totw_voting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opens_at timestamptz DEFAULT now(),
  closes_at timestamptz, status text, eligible_players jsonb NOT NULL DEFAULT '[]',
  winners jsonb, created_by text, created_at timestamptz DEFAULT now(), resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.totw_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period_id uuid REFERENCES public.totw_voting_periods(id) ON DELETE CASCADE,
  voter_username text NOT NULL, position text NOT NULL, voted_for_username text NOT NULL,
  voted_at timestamptz DEFAULT now(), UNIQUE(period_id,voter_username,position)
);
CREATE TABLE IF NOT EXISTS public.position_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  username text, from_pos text, to_pos text, reason text, status text, reviewed_by text,
  reviewed_at timestamptz, review_note text, created_at timestamptz DEFAULT now()
);
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['accounts','teams','submissions','news','settings','rules_sections','articles','scheduled_matches','transfers','totw_voting_periods','totw_votes','position_change_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO app_runtime',name);
    EXECUTE format('CREATE POLICY api_runtime ON public.%I FOR ALL TO app_runtime USING (true) WITH CHECK (true)',name);
  END LOOP;
END $$;
COMMIT;
