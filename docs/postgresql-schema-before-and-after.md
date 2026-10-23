```sql
-- OLD: asl.accounts

CREATE TABLE asl.accounts (
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

CREATE INDEX idx_accounts_team ON asl.accounts USING btree (team_id);
```

```sql
-- NEW: asl.accounts

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
```

---

```sql
-- OLD: asl.teams

CREATE TABLE asl.teams (
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

CREATE INDEX idx_teams_status ON asl.teams USING btree (status);
```

```sql
-- NEW: asl.teams

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
```

---

```sql
-- OLD: asl.articles

CREATE TABLE asl.articles (
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

CREATE INDEX idx_articles_published ON asl.articles USING btree (published_at DESC);
CREATE INDEX idx_articles_slug ON asl.articles USING btree (slug);
```

```sql
-- NEW: asl.articles

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
```

---

```sql
-- OLD: asl.rules_sections

CREATE TABLE asl.rules_sections (
    id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT ''::text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "rules_sections_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_rules_sort ON asl.rules_sections USING btree (sort_order);
```

```sql
-- NEW: asl.rules_sections

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
```

---

```sql
-- OLD: asl.settings

CREATE TABLE asl.settings (
    key text NOT NULL,
    value text NULL,
    CONSTRAINT "settings_pkey" PRIMARY KEY (key)
);
```

```sql
-- NEW: asl.settings

CREATE TABLE asl.settings (
    key text NOT NULL,
    value text NULL,
    CONSTRAINT settings_pkey PRIMARY KEY (key)
);
```

---

```sql
-- OLD: asl.scheduled_matches

CREATE TABLE asl.scheduled_matches (
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

CREATE INDEX idx_sched_date ON asl.scheduled_matches USING btree (scheduled_date);
CREATE INDEX idx_sched_linked ON asl.scheduled_matches USING btree (linked_match_id);
CREATE INDEX idx_sched_season_week ON asl.scheduled_matches USING btree (season, week);
CREATE INDEX idx_sched_status ON asl.scheduled_matches USING btree (status);
```

```sql
-- NEW: asl.scheduled_matches

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
```

---

```sql
-- OLD: asl.submissions

CREATE TABLE asl.submissions (
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

CREATE INDEX idx_submissions_status ON asl.submissions USING btree (status);
```

```sql
-- NEW: asl.submissions

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
```

---

```sql
-- OLD: asl.news

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
    event_date timestamp with time zone NULL,
    notes text NULL,
    author text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    auto_from_submission text NULL,
    CONSTRAINT "news_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_news_type ON asl.news USING btree (type);
```

```sql
-- NEW: asl.news

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
```

---

```sql
-- OLD: asl.position_change_requests

CREATE TABLE asl.position_change_requests (
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
    CONSTRAINT "position_change_requests_account_id_fkey" FOREIGN KEY (account_id) REFERENCES asl.accounts(id) ON DELETE CASCADE,
    CONSTRAINT "position_change_requests_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_pcr_account ON asl.position_change_requests USING btree (account_id, created_at DESC);
CREATE INDEX idx_pcr_status ON asl.position_change_requests USING btree (status, created_at DESC);
```

```sql
-- NEW: asl.position_change_requests

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
```

---

```sql
-- OLD: asl.totw_voting_periods

CREATE TABLE asl.totw_voting_periods (
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
```

```sql
-- NEW: asl.totw_voting_periods

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
```

---

```sql
-- OLD: asl.totw_votes

CREATE TABLE asl.totw_votes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    period_id uuid NOT NULL,
    voter_username text NOT NULL,
    position text NOT NULL,
    voted_for_username text NOT NULL,
    voted_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "totw_votes_period_id_fkey" FOREIGN KEY (period_id) REFERENCES asl.totw_voting_periods(id) ON DELETE CASCADE,
    CONSTRAINT "totw_votes_period_id_voter_username_position_key" UNIQUE (period_id, voter_username, "position"),
    CONSTRAINT "totw_votes_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_totw_votes_period ON asl.totw_votes USING btree (period_id);
CREATE INDEX idx_totw_votes_voter ON asl.totw_votes USING btree (period_id, voter_username);
```

```sql
-- NEW: asl.totw_votes

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
```

---

```sql
-- OLD: asl.transfers

CREATE TABLE asl.transfers (
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

CREATE INDEX idx_transfers_created ON asl.transfers USING btree (created_at DESC);
CREATE INDEX idx_transfers_player ON asl.transfers USING btree (player_username);
CREATE INDEX idx_transfers_season ON asl.transfers USING btree (season);
```

```sql
-- NEW: asl.transfers

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
```
