
CREATE TABLE public.accounts (
    id uuid NOT NULL,
    username text NOT NULL,
    username_lower text NOT NULL,
    position text NOT NULL DEFAULT 'CM'::text,
    team_id text NULL,
    image_url text NULL,
    pending_image_url text NULL,
    email text NULL,
    country text NULL,
    stats jsonb NOT NULL DEFAULT '{}'::jsonb,
    matches jsonb NOT NULL DEFAULT '[]'::jsonb,
    awards jsonb NOT NULL DEFAULT '[]'::jsonb,
    championships jsonb NOT NULL DEFAULT '[]'::jsonb,
    totw_until timestamp with time zone NULL,
    cheater boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    strikers_id text NULL,
    steam_url text NULL,
    CONSTRAINT "accounts_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT "accounts_pkey" PRIMARY KEY (id),
    CONSTRAINT "accounts_username_key" UNIQUE (username),
    CONSTRAINT "accounts_username_lower_key" UNIQUE (username_lower)
);

CREATE INDEX idx_accounts_team ON public.accounts USING btree (team_id);


CREATE TABLE public.teams (
    id text NOT NULL,
    name text NOT NULL,
    tag text NOT NULL,
    color text NULL,
    description text NULL,
    owner_username text NOT NULL,
    members jsonb NOT NULL DEFAULT '[]'::jsonb,
    pending_members jsonb NOT NULL DEFAULT '[]'::jsonb,
    totw boolean NOT NULL DEFAULT false,
    totw_set_at timestamp with time zone NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    logo_url text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    reviewed_at timestamp with time zone NULL,
    reviewed_by text NULL,
    rejection_reason text NULL,
    lineup jsonb NOT NULL DEFAULT '{}'::jsonb,
    formation text NOT NULL DEFAULT '2-1-2'::text,
    seasons text[] NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_teams_status ON public.teams USING btree (status);


CREATE TABLE public.articles (
    id text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    cover_image_url text NULL,
    author text NOT NULL,
    body text NOT NULL,
    excerpt text NULL,
    published_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "articles_pkey" PRIMARY KEY (id),
    CONSTRAINT "articles_slug_key" UNIQUE (slug)
);

CREATE INDEX idx_articles_published ON public.articles USING btree (published_at DESC);
CREATE INDEX idx_articles_slug ON public.articles USING btree (slug);


CREATE TABLE public.rules_sections (
    id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT ''::text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "rules_sections_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_rules_sort ON public.rules_sections USING btree (sort_order);


CREATE TABLE public.settings (
    key text NOT NULL,
    value text NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY (key)
);


CREATE TABLE public.scheduled_matches (
    id text NOT NULL,
    season text NOT NULL,
    week integer NOT NULL,
    home_team_id text NOT NULL,
    away_team_id text NOT NULL,
    scheduled_date timestamp with time zone NULL,
    stream_url text NULL,
    match_type text NOT NULL DEFAULT 'regular'::text,
    playoff_round text NULL,
    status text NOT NULL DEFAULT 'scheduled'::text,
    home_score integer NULL,
    away_score integer NULL,
    linked_match_id text NULL,
    notes text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "scheduled_matches_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_sched_date ON public.scheduled_matches USING btree (scheduled_date);
CREATE INDEX idx_sched_linked ON public.scheduled_matches USING btree (linked_match_id);
CREATE INDEX idx_sched_season_week ON public.scheduled_matches USING btree (season, week);
CREATE INDEX idx_sched_status ON public.scheduled_matches USING btree (status);


CREATE TABLE public.submissions (
    id text NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    submitted_by text NOT NULL,
    submitted_at timestamp with time zone NOT NULL DEFAULT now(),
    reviewed_by text NULL,
    reviewed_at timestamp with time zone NULL,
    rejection_reason text NULL,
    match_info jsonb NOT NULL,
    player_stats jsonb NOT NULL DEFAULT '[]'::jsonb,
    edits jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT "submissions_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_submissions_status ON public.submissions USING btree (status);


CREATE TABLE public.news (
    id text NOT NULL,
    type text NOT NULL,
    title text NULL,
    body text NULL,
    pinned boolean NOT NULL DEFAULT false,
    home_team_id text NULL,
    away_team_id text NULL,
    home_score integer NULL,
    away_score integer NULL,
    event_date timestamp with time zone NULL,
    notes text NULL,
    author text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    auto_from_submission text NULL,
    CONSTRAINT "news_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_news_type ON public.news USING btree (type);


CREATE TABLE public.position_change_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    username text NOT NULL,
    from_pos text NOT NULL,
    to_pos text NOT NULL,
    reason text NULL DEFAULT ''::text,
    status text NOT NULL DEFAULT 'pending'::text,
    reviewed_by text NULL,
    reviewed_at timestamp with time zone NULL,
    review_note text NULL DEFAULT ''::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "position_change_requests_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE,
    CONSTRAINT "position_change_requests_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_pcr_account ON public.position_change_requests USING btree (account_id, created_at DESC);
CREATE INDEX idx_pcr_status ON public.position_change_requests USING btree (status, created_at DESC);


CREATE TABLE public.totw_voting_periods (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    opens_at timestamp with time zone NOT NULL DEFAULT now(),
    closes_at timestamp with time zone NOT NULL,
    status text NOT NULL DEFAULT 'open'::text,
    eligible_players jsonb NOT NULL DEFAULT '[]'::jsonb,
    winners jsonb NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    resolved_at timestamp with time zone NULL,
    CONSTRAINT "totw_voting_periods_pkey" PRIMARY KEY (id)
);


CREATE TABLE public.totw_votes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    period_id uuid NOT NULL,
    voter_username text NOT NULL,
    position text NOT NULL,
    voted_for_username text NOT NULL,
    voted_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "totw_votes_period_id_fkey" FOREIGN KEY (period_id) REFERENCES public.totw_voting_periods(id) ON DELETE CASCADE,
    CONSTRAINT "totw_votes_period_id_voter_username_position_key" UNIQUE (period_id, voter_username, "position"),
    CONSTRAINT "totw_votes_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_totw_votes_period ON public.totw_votes USING btree (period_id);
CREATE INDEX idx_totw_votes_voter ON public.totw_votes USING btree (period_id, voter_username);


CREATE TABLE public.transfers (
    id text NOT NULL,
    season text NOT NULL,
    player_username text NOT NULL,
    from_team_id text NULL,
    to_team_id text NULL,
    kind text NOT NULL,
    window_type text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    created_by text NULL,
    CONSTRAINT "transfers_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_transfers_created ON public.transfers USING btree (created_at DESC);
CREATE INDEX idx_transfers_player ON public.transfers USING btree (player_username);
CREATE INDEX idx_transfers_season ON public.transfers USING btree (season);
