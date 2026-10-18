-- Additive cutover: public remains the recovery copy. Replay inside one transaction.
BEGIN;

CREATE SCHEMA IF NOT EXISTS asl;

CREATE TABLE asl.accounts (
    id uuid NOT NULL,
    username text NOT NULL,
    username_lower text GENERATED ALWAYS AS (lower(username)) STORED NOT NULL,
    position text NOT NULL DEFAULT 'CM',
    team_id text NULL,
    image_url text NULL,
    pending_image_url text NULL,
    email text NULL,
    country text NULL,
    stats jsonb NOT NULL DEFAULT '{}'::jsonb,
    matches jsonb NOT NULL DEFAULT '[]'::jsonb,
    awards jsonb NOT NULL DEFAULT '[]'::jsonb,
    championships jsonb NOT NULL DEFAULT '[]'::jsonb,
    totw_until timestamptz NULL,
    cheater boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    strikers_id text NULL,
    steam_url text NULL,
    CONSTRAINT accounts_pkey PRIMARY KEY (id),
    CONSTRAINT accounts_id_fkey FOREIGN KEY (id)
        REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT accounts_username_lower_key UNIQUE (username_lower)
);

CREATE INDEX idx_accounts_team ON asl.accounts (team_id);
CREATE UNIQUE INDEX accounts_strikers_id_unique ON asl.accounts(lower(strikers_id)) WHERE strikers_id IS NOT NULL AND strikers_id<>'';


CREATE TABLE asl.teams (
    id text NOT NULL,
    name text NOT NULL,
    tag text NOT NULL,
    color text NULL,
    description text NULL,
    owner_account_id uuid NOT NULL,
    totw boolean NOT NULL DEFAULT false,
    totw_set_at timestamptz NULL,
    status text NOT NULL DEFAULT 'pending',
    logo_url text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz NULL,
    reviewed_by text NULL,
    reviewed_by_account_id uuid NULL,
    rejection_reason text NULL,
    lineup jsonb NOT NULL DEFAULT '{}'::jsonb,
    formation text NOT NULL DEFAULT '2-1-2',
    CONSTRAINT teams_pkey PRIMARY KEY (id),
    CONSTRAINT teams_owner_account_id_fkey FOREIGN KEY (owner_account_id)
        REFERENCES asl.accounts (id) ON DELETE RESTRICT,
    CONSTRAINT teams_reviewed_by_account_id_fkey FOREIGN KEY (reviewed_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL
);

CREATE INDEX idx_teams_status ON asl.teams (status);
CREATE INDEX idx_teams_owner ON asl.teams (owner_account_id);
CREATE INDEX idx_teams_reviewer ON asl.teams (reviewed_by_account_id);

ALTER TABLE asl.accounts
    ADD CONSTRAINT accounts_team_id_fkey FOREIGN KEY (team_id)
    REFERENCES asl.teams (id) ON DELETE SET NULL;

CREATE TABLE asl.team_join_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    team_id text NOT NULL,
    account_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz NULL,
    reviewed_by_account_id uuid NULL,
    review_note text NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT team_join_requests_pkey PRIMARY KEY (id),
    CONSTRAINT team_join_requests_team_id_fkey FOREIGN KEY (team_id)
        REFERENCES asl.teams (id) ON DELETE CASCADE,
    CONSTRAINT team_join_requests_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES asl.accounts (id) ON DELETE CASCADE,
    CONSTRAINT team_join_requests_reviewer_fkey FOREIGN KEY (reviewed_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX team_join_requests_pending_key
    ON asl.team_join_requests (team_id, account_id)
    WHERE status = 'pending';
CREATE INDEX idx_team_join_requests_team ON asl.team_join_requests (team_id);
CREATE INDEX idx_team_join_requests_account ON asl.team_join_requests (account_id);
CREATE INDEX idx_team_join_requests_reviewer
    ON asl.team_join_requests (reviewed_by_account_id);

CREATE TABLE asl.seasons (
    id text NOT NULL,
    CONSTRAINT seasons_pkey PRIMARY KEY (id)
);

CREATE TABLE asl.team_seasons (
    team_id text NOT NULL,
    season_id text NOT NULL,
    CONSTRAINT team_seasons_pkey PRIMARY KEY (team_id, season_id),
    CONSTRAINT team_seasons_team_id_fkey FOREIGN KEY (team_id)
        REFERENCES asl.teams (id) ON DELETE CASCADE,
    CONSTRAINT team_seasons_season_id_fkey FOREIGN KEY (season_id)
        REFERENCES asl.seasons (id) ON DELETE RESTRICT
);

CREATE INDEX idx_team_seasons_season ON asl.team_seasons (season_id);


CREATE TABLE asl.articles (
    id text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    cover_image_url text NULL,
    author text NOT NULL,
    body text NOT NULL,
    excerpt text NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT articles_pkey PRIMARY KEY (id),
    CONSTRAINT articles_slug_key UNIQUE (slug)
);

CREATE INDEX idx_articles_published ON asl.articles (published_at DESC);


CREATE TABLE asl.rules_sections (
    id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rules_sections_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_rules_sort ON asl.rules_sections (sort_order);


CREATE TABLE asl.settings (
    key text NOT NULL,
    value text NULL,
    CONSTRAINT settings_pkey PRIMARY KEY (key)
);


CREATE TABLE asl.scheduled_matches (
    id text NOT NULL,
    season_id text NOT NULL,
    week integer NOT NULL,
    home_team_id text NOT NULL,
    away_team_id text NOT NULL,
    scheduled_date timestamptz NULL,
    stream_url text NULL,
    match_type text NOT NULL DEFAULT 'regular',
    playoff_round text NULL,
    status text NOT NULL DEFAULT 'scheduled',
    home_score integer NULL,
    away_score integer NULL,
    linked_match_id text NULL,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT scheduled_matches_pkey PRIMARY KEY (id),
    CONSTRAINT scheduled_matches_season_id_fkey FOREIGN KEY (season_id)
        REFERENCES asl.seasons (id) ON DELETE RESTRICT,
    CONSTRAINT scheduled_matches_home_team_id_fkey FOREIGN KEY (home_team_id)
        REFERENCES asl.teams (id) ON DELETE RESTRICT,
    CONSTRAINT scheduled_matches_away_team_id_fkey FOREIGN KEY (away_team_id)
        REFERENCES asl.teams (id) ON DELETE RESTRICT,
    CONSTRAINT scheduled_matches_different_teams CHECK (home_team_id <> away_team_id),
    CONSTRAINT scheduled_matches_home_score_check CHECK (home_score >= 0),
    CONSTRAINT scheduled_matches_away_score_check CHECK (away_score >= 0)
);

CREATE INDEX idx_sched_date ON asl.scheduled_matches (scheduled_date);
CREATE INDEX idx_sched_linked ON asl.scheduled_matches (linked_match_id);
CREATE INDEX idx_sched_season_week ON asl.scheduled_matches (season_id, week);
CREATE INDEX idx_sched_status ON asl.scheduled_matches (status);
CREATE INDEX idx_sched_home_team ON asl.scheduled_matches (home_team_id);
CREATE INDEX idx_sched_away_team ON asl.scheduled_matches (away_team_id);


CREATE TABLE asl.submissions (
    id text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    submitted_by text NOT NULL,
    submitted_by_account_id uuid NULL,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    reviewed_by text NULL,
    reviewed_by_account_id uuid NULL,
    reviewed_at timestamptz NULL,
    rejection_reason text NULL,
    match_info jsonb NOT NULL,
    player_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
    edits jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT submissions_pkey PRIMARY KEY (id),
    CONSTRAINT submissions_submitted_by_account_id_fkey FOREIGN KEY (submitted_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL,
    CONSTRAINT submissions_reviewed_by_account_id_fkey FOREIGN KEY (reviewed_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL
);

CREATE INDEX idx_submissions_status ON asl.submissions (status);
CREATE INDEX idx_submissions_submitter ON asl.submissions (submitted_by_account_id);
CREATE INDEX idx_submissions_reviewer ON asl.submissions (reviewed_by_account_id);


CREATE TABLE asl.news (
    id text NOT NULL,
    type text NOT NULL,
    title text NULL,
    body text NULL,
    pinned boolean NOT NULL DEFAULT false,
    home_team_id text NULL,
    away_team_id text NULL,
    home_score integer NULL,
    away_score integer NULL,
    event_date timestamptz NULL,
    notes text NULL,
    author text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    auto_from_submission text NULL,
    CONSTRAINT news_pkey PRIMARY KEY (id),
    CONSTRAINT news_home_team_id_fkey FOREIGN KEY (home_team_id)
        REFERENCES asl.teams (id) ON DELETE RESTRICT,
    CONSTRAINT news_away_team_id_fkey FOREIGN KEY (away_team_id)
        REFERENCES asl.teams (id) ON DELETE RESTRICT,
    CONSTRAINT news_auto_from_submission_fkey FOREIGN KEY (auto_from_submission)
        REFERENCES asl.submissions (id) ON DELETE SET NULL,
    CONSTRAINT news_different_teams CHECK (home_team_id <> away_team_id),
    CONSTRAINT news_home_score_check CHECK (home_score >= 0),
    CONSTRAINT news_away_score_check CHECK (away_score >= 0)
);

CREATE INDEX idx_news_type ON asl.news (type);
CREATE INDEX idx_news_home_team ON asl.news (home_team_id);
CREATE INDEX idx_news_away_team ON asl.news (away_team_id);
CREATE INDEX idx_news_submission ON asl.news (auto_from_submission);


CREATE TABLE asl.position_change_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    username text NOT NULL,
    from_pos text NOT NULL,
    to_pos text NOT NULL,
    reason text NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending',
    reviewed_by text NULL,
    reviewed_by_account_id uuid NULL,
    reviewed_at timestamptz NULL,
    review_note text NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT position_change_requests_pkey PRIMARY KEY (id),
    CONSTRAINT position_change_requests_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES asl.accounts (id) ON DELETE CASCADE,
    CONSTRAINT position_change_requests_reviewer_fkey FOREIGN KEY (reviewed_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL
);

CREATE INDEX idx_pcr_account ON asl.position_change_requests (account_id, created_at DESC);
CREATE INDEX idx_pcr_status ON asl.position_change_requests (status, created_at DESC);
CREATE INDEX idx_pcr_reviewer ON asl.position_change_requests (reviewed_by_account_id);


CREATE TABLE asl.totw_voting_periods (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    opens_at timestamptz NOT NULL DEFAULT now(),
    closes_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'open',
    created_by text NOT NULL,
    created_by_account_id uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz NULL,
    CONSTRAINT totw_voting_periods_pkey PRIMARY KEY (id),
    CONSTRAINT totw_voting_periods_creator_fkey FOREIGN KEY (created_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL,
    CONSTRAINT totw_voting_periods_dates_check CHECK (closes_at > opens_at)
);

CREATE INDEX idx_totw_periods_creator ON asl.totw_voting_periods (created_by_account_id);

CREATE TABLE asl.totw_candidates (
    period_id uuid NOT NULL,
    account_id uuid NOT NULL,
    position text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT totw_candidates_pkey PRIMARY KEY (period_id, account_id, position),
    CONSTRAINT totw_candidates_period_id_fkey FOREIGN KEY (period_id)
        REFERENCES asl.totw_voting_periods (id) ON DELETE CASCADE,
    CONSTRAINT totw_candidates_account_id_fkey FOREIGN KEY (account_id)
        REFERENCES asl.accounts (id) ON DELETE RESTRICT
);

CREATE INDEX idx_totw_candidates_account ON asl.totw_candidates (account_id);

CREATE TABLE asl.totw_winners (
    period_id uuid NOT NULL,
    account_id uuid NOT NULL,
    position text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT totw_winners_pkey PRIMARY KEY (period_id, account_id, position),
    CONSTRAINT totw_winners_period_id_fkey FOREIGN KEY (period_id)
        REFERENCES asl.totw_voting_periods (id) ON DELETE CASCADE,
    CONSTRAINT totw_winners_candidate_fkey FOREIGN KEY (period_id, account_id, position)
        REFERENCES asl.totw_candidates (period_id, account_id, position)
        ON DELETE NO ACTION
);


CREATE TABLE asl.totw_votes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    period_id uuid NOT NULL,
    voter_account_id uuid NOT NULL,
    position text NOT NULL,
    voted_for_account_id uuid NOT NULL,
    voted_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT totw_votes_pkey PRIMARY KEY (id),
    CONSTRAINT totw_votes_period_id_fkey FOREIGN KEY (period_id)
        REFERENCES asl.totw_voting_periods (id) ON DELETE CASCADE,
    CONSTRAINT totw_votes_voter_account_id_fkey FOREIGN KEY (voter_account_id)
        REFERENCES asl.accounts (id) ON DELETE RESTRICT,
    CONSTRAINT totw_votes_candidate_fkey FOREIGN KEY (period_id, voted_for_account_id, position)
        REFERENCES asl.totw_candidates (period_id, account_id, position)
        ON DELETE NO ACTION,
    CONSTRAINT totw_votes_period_voter_position_key
        UNIQUE (period_id, voter_account_id, position)
);

CREATE INDEX idx_totw_votes_voter_account ON asl.totw_votes (voter_account_id);
CREATE INDEX idx_totw_votes_candidate
    ON asl.totw_votes (period_id, voted_for_account_id, position);


CREATE TABLE asl.transfers (
    id text NOT NULL,
    season_id text NOT NULL,
    player_account_id uuid NOT NULL,
    player_username_snapshot text NOT NULL,
    from_team_id text NULL,
    to_team_id text NULL,
    kind text NOT NULL,
    window_type text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text NULL,
    created_by_account_id uuid NULL,
    CONSTRAINT transfers_pkey PRIMARY KEY (id),
    CONSTRAINT transfers_season_id_fkey FOREIGN KEY (season_id)
        REFERENCES asl.seasons (id) ON DELETE RESTRICT,
    CONSTRAINT transfers_player_account_id_fkey FOREIGN KEY (player_account_id)
        REFERENCES asl.accounts (id) ON DELETE RESTRICT,
    CONSTRAINT transfers_from_team_id_fkey FOREIGN KEY (from_team_id)
        REFERENCES asl.teams (id) ON DELETE RESTRICT,
    CONSTRAINT transfers_to_team_id_fkey FOREIGN KEY (to_team_id)
        REFERENCES asl.teams (id) ON DELETE RESTRICT,
    CONSTRAINT transfers_created_by_account_id_fkey FOREIGN KEY (created_by_account_id)
        REFERENCES asl.accounts (id) ON DELETE SET NULL
);

CREATE INDEX idx_transfers_created ON asl.transfers (created_at DESC);
CREATE INDEX idx_transfers_player ON asl.transfers (player_account_id);
CREATE INDEX idx_transfers_season ON asl.transfers (season_id);
CREATE INDEX idx_transfers_from_team ON asl.transfers (from_team_id);
CREATE INDEX idx_transfers_to_team ON asl.transfers (to_team_id);
CREATE INDEX idx_transfers_creator ON asl.transfers (created_by_account_id);

-- Only explicitly reviewed IDs may be excluded; their source rows remain in public.
CREATE TEMP TABLE asl_excluded_teams(id text PRIMARY KEY) ON COMMIT DROP;
CREATE TEMP TABLE asl_excluded_votes(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO asl_excluded_teams SELECT jsonb_array_elements_text(COALESCE(NULLIF(current_setting('asl_migration.excluded_team_ids',true),''),'[]')::jsonb);
INSERT INTO asl_excluded_votes SELECT jsonb_array_elements_text(COALESCE(NULLIF(current_setting('asl_migration.excluded_vote_ids',true),''),'[]')::jsonb)::uuid;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM asl_excluded_teams e LEFT JOIN public.teams t ON t.id=e.id WHERE t.id IS NULL)
    OR EXISTS(SELECT 1 FROM asl_excluded_votes e LEFT JOIN public.totw_votes v ON v.id=e.id WHERE v.id IS NULL) THEN
    RAISE EXCEPTION 'asl preflight: an explicitly excluded team or vote ID does not exist';
  END IF;
END $$;
CREATE TEMP TABLE asl_source_teams ON COMMIT DROP AS SELECT * FROM public.teams WHERE id NOT IN (SELECT id FROM asl_excluded_teams);
CREATE TEMP TABLE asl_source_votes ON COMMIT DROP AS SELECT * FROM public.totw_votes WHERE id NOT IN (SELECT id FROM asl_excluded_votes);
-- Verified aliases are supplied by the operator, never guessed from Discord names.
-- SET asl_migration.account_aliases = '{"old-name":"verified-account-uuid"}';
CREATE TEMP TABLE asl_account_aliases(username_lower text PRIMARY KEY, account_id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO asl_account_aliases SELECT lower(username),id FROM public.accounts;
DO $$ BEGIN
  IF EXISTS(
    SELECT 1 FROM jsonb_each_text(COALESCE(NULLIF(current_setting('asl_migration.account_aliases',true),''),'{}')::jsonb) m
    JOIN public.accounts a ON lower(a.username)=lower(m.key)
    WHERE a.id<>m.value::uuid
  ) THEN RAISE EXCEPTION 'asl preflight: alias conflicts with an existing canonical username'; END IF;
END $$;
INSERT INTO asl_account_aliases
SELECT lower(key),value::uuid FROM jsonb_each_text(COALESCE(NULLIF(current_setting('asl_migration.account_aliases',true),''),'{}')::jsonb)
ON CONFLICT(username_lower) DO UPDATE SET account_id=EXCLUDED.account_id;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM asl_account_aliases m LEFT JOIN public.accounts a ON a.id=m.account_id WHERE a.id IS NULL) THEN
    RAISE EXCEPTION 'asl preflight: alias must reference an existing public.accounts UUID';
  END IF;
END $$;
CREATE FUNCTION pg_temp.asl_account(name text, required boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result uuid;
BEGIN
  SELECT account_id INTO result FROM asl_account_aliases WHERE username_lower=lower(name);
  IF required AND result IS NULL THEN
    RAISE EXCEPTION 'asl preflight: unresolved required account "%"; supply a verified asl_migration.account_aliases entry',name;
  END IF;
  RETURN result;
END $$;

-- Copy shared scalar columns without depending on the legacy column order.
DO $$ DECLARE t text; cols text; BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','articles','rules_sections','settings','submissions','position_change_requests','totw_voting_periods'] LOOP
    SELECT string_agg(quote_ident(n.column_name),',' ORDER BY n.ordinal_position) INTO cols
    FROM information_schema.columns n JOIN information_schema.columns o ON o.table_schema='public' AND o.table_name=n.table_name AND o.column_name=n.column_name
    WHERE n.table_schema='asl' AND n.table_name=t AND n.is_generated='NEVER';
    -- accounts.team_id is installed after teams to resolve the circular FK.
    IF t='accounts' THEN cols=replace(cols,'team_id,',''); END IF;
    IF t='settings' THEN
      EXECUTE format('INSERT INTO asl.%I(%s) SELECT %s FROM public.%I WHERE key NOT IN (''admin_list'',''discord_webhook'',''discord_webhook_url'',''discord_transfer_webhook'')',t,cols,cols,t);
    ELSE
      EXECUTE format('INSERT INTO asl.%I(%s) SELECT %s FROM public.%I',t,cols,cols,t);
    END IF;
  END LOOP;
END $$;
INSERT INTO asl.teams(id,name,tag,color,description,owner_account_id,totw,totw_set_at,status,logo_url,created_at,reviewed_at,reviewed_by,reviewed_by_account_id,rejection_reason,lineup,formation)
SELECT id,name,tag,color,description,pg_temp.asl_account(owner_username,true),totw,totw_set_at,status,logo_url,created_at,reviewed_at,reviewed_by,pg_temp.asl_account(reviewed_by),rejection_reason,lineup,formation FROM asl_source_teams;
INSERT INTO asl.news SELECT * FROM public.news;
UPDATE asl.accounts a SET team_id=o.team_id FROM public.accounts o WHERE a.id=o.id;
INSERT INTO asl.team_join_requests(team_id,account_id,status,reviewed_at,details)
SELECT t.id,pg_temp.asl_account(CASE jsonb_typeof(e) WHEN 'string' THEN e#>>'{}' ELSE e->>'username' END,true),
CASE jsonb_typeof(e) WHEN 'string' THEN 'pending' ELSE COALESCE(e->>'status','pending') END,
CASE WHEN jsonb_typeof(e->'respondedAt')='number' THEN to_timestamp((e->>'respondedAt')::numeric/1000)
     WHEN jsonb_typeof(e->'respondedAt')='string' AND e->>'respondedAt'<>'' THEN (e->>'respondedAt')::timestamptz ELSE NULL END,
CASE jsonb_typeof(e) WHEN 'string' THEN jsonb_build_object('username',e#>>'{}') ELSE e END
FROM asl_source_teams t CROSS JOIN LATERAL jsonb_array_elements(t.pending_members) e;
INSERT INTO asl.seasons(id)
SELECT DISTINCT season FROM (
  SELECT season FROM public.scheduled_matches UNION ALL SELECT season FROM public.transfers
  UNION ALL SELECT value FROM public.settings WHERE key='current_season'
  UNION ALL SELECT jsonb_array_elements_text(COALESCE(to_jsonb(seasons),'[]')) FROM asl_source_teams
  UNION ALL SELECT COALESCE(NULLIF(m->>'season',''),'S1') FROM public.accounts a CROSS JOIN LATERAL jsonb_array_elements(a.matches) m
) s WHERE season IS NOT NULL AND season<>'';
-- Legacy teams.seasons lists exclusions. The normalized relation lists participation.
INSERT INTO asl.team_seasons SELECT t.id,s.id FROM asl_source_teams t CROSS JOIN asl.seasons s
WHERE NOT COALESCE(to_jsonb(t.seasons),'[]') ? s.id;
INSERT INTO asl.scheduled_matches
SELECT id,season,week,home_team_id,away_team_id,scheduled_date,stream_url,match_type,playoff_round,status,home_score,away_score,linked_match_id,notes,created_at,updated_at FROM public.scheduled_matches;
INSERT INTO asl.transfers
SELECT id,season,pg_temp.asl_account(player_username,true),player_username,from_team_id,to_team_id,kind,window_type,created_at,created_by,pg_temp.asl_account(created_by) FROM public.transfers;
UPDATE asl.submissions SET submitted_by_account_id=pg_temp.asl_account(submitted_by), reviewed_by_account_id=pg_temp.asl_account(reviewed_by);
UPDATE asl.position_change_requests SET reviewed_by_account_id=pg_temp.asl_account(reviewed_by);
UPDATE asl.totw_voting_periods SET created_by_account_id=pg_temp.asl_account(created_by);
INSERT INTO asl.totw_candidates(period_id,account_id,position,details)
SELECT p.id,a.id,CASE WHEN a.position IN ('CB','LB','RB','DEF') THEN 'DEF' ELSE a.position END,jsonb_build_object('legacyEligiblePlayer',e.value,'legacyOrdinal',e.ordinality)
FROM public.totw_voting_periods p CROSS JOIN LATERAL jsonb_array_elements(p.eligible_players) WITH ORDINALITY e(value,ordinality)
JOIN asl.accounts a ON a.id=pg_temp.asl_account(CASE jsonb_typeof(e.value) WHEN 'string' THEN e.value#>>'{}' ELSE e.value->>'username' END,true);
INSERT INTO asl.totw_candidates(period_id,account_id,position)
SELECT DISTINCT period_id,pg_temp.asl_account(voted_for_username,true),position FROM asl_source_votes
ON CONFLICT DO NOTHING;
INSERT INTO asl.totw_votes
SELECT id,period_id,pg_temp.asl_account(voter_username,true),position,pg_temp.asl_account(voted_for_username,true),voted_at FROM asl_source_votes;
-- Winner keys are the legacy positional slots; retain their exact payload.
INSERT INTO asl.totw_winners(period_id,account_id,position,details)
SELECT p.id,pg_temp.asl_account(CASE jsonb_typeof(w.value) WHEN 'string' THEN w.value#>>'{}' ELSE w.value->>'username' END,true),
CASE lower(w.key) WHEN 'gk' THEN 'GK' WHEN 'def1' THEN 'DEF' WHEN 'def2' THEN 'DEF' WHEN 'cm' THEN 'CM' WHEN 'st' THEN 'ST' WHEN 'st1' THEN 'ST' WHEN 'st2' THEN 'ST' ELSE upper(w.key) END,
jsonb_build_object('key',w.key,'value',w.value)
FROM public.totw_voting_periods p CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.winners)='object' THEN p.winners WHEN p.winners IS NULL OR p.winners='null'::jsonb THEN '{}'::jsonb ELSE p.winners END) w;

REVOKE ALL ON SCHEMA asl FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA asl TO app_runtime;
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='asl' LOOP
    EXECUTE format('ALTER TABLE asl.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON asl.%I FROM PUBLIC,anon,authenticated,gateway_runtime',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON asl.%I TO app_runtime',t);
    EXECUTE format('CREATE POLICY api_runtime ON asl.%I FOR ALL TO app_runtime USING (true) WITH CHECK (true)',t);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA asl REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated;
COMMIT;
