# Public Tables and Indexes

## `public`

### `public.accounts`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | `NOT NULL` | — | — | — |
| `username` | `text` | `NOT NULL` | — | — | — |
| `username_lower` | `text` | `NOT NULL` | — | — | — |
| `position` | `text` | `NOT NULL` | `'CM'::text` | — | — |
| `team_id` | `text` | `NULL` | — | — | — |
| `image_url` | `text` | `NULL` | — | — | — |
| `pending_image_url` | `text` | `NULL` | — | — | — |
| `email` | `text` | `NULL` | — | — | — |
| `country` | `text` | `NULL` | — | — | — |
| `stats` | `jsonb` | `NOT NULL` | `'{}'::jsonb` | — | — |
| `matches` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `awards` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `championships` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `totw_until` | `timestamp with time zone` | `NULL` | — | — | — |
| `cheater` | `boolean` | `NOT NULL` | `false` | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `strikers_id` | `text` | `NULL` | — | — | — |
| `steam_url` | `text` | `NULL` | — | — | — |

#### Constraints

```sql
CONSTRAINT "accounts_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
CONSTRAINT "accounts_pkey" PRIMARY KEY (id)
CONSTRAINT "accounts_username_key" UNIQUE (username)
CONSTRAINT "accounts_username_lower_key" UNIQUE (username_lower)
```

#### Indexes

##### `accounts_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id);
```

##### `accounts_username_key`

```sql
CREATE UNIQUE INDEX accounts_username_key ON public.accounts USING btree (username);
```

##### `accounts_username_lower_key`

```sql
CREATE UNIQUE INDEX accounts_username_lower_key ON public.accounts USING btree (username_lower);
```

##### `idx_accounts_team`

```sql
CREATE INDEX idx_accounts_team ON public.accounts USING btree (team_id);
```

### `public.accounts_public` (view)

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | `NULL` | — | — | — |
| `username` | `text` | `NULL` | — | — | — |
| `username_lower` | `text` | `NULL` | — | — | — |
| `position` | `text` | `NULL` | — | — | — |
| `country` | `text` | `NULL` | — | — | — |
| `stats` | `jsonb` | `NULL` | — | — | — |
| `matches` | `jsonb` | `NULL` | — | — | — |
| `awards` | `jsonb` | `NULL` | — | — | — |
| `championships` | `jsonb` | `NULL` | — | — | — |
| `totw_until` | `timestamp with time zone` | `NULL` | — | — | — |
| `cheater` | `boolean` | `NULL` | — | — | — |
| `strikers_id` | `text` | `NULL` | — | — | — |
| `steam_url` | `text` | `NULL` | — | — | — |
| `image_url` | `text` | `NULL` | — | — | — |
| `pending_image_url` | `text` | `NULL` | — | — | — |
| `created_at` | `timestamp with time zone` | `NULL` | — | — | — |
| `team_id` | `text` | `NULL` | — | — | — |

### `public.articles`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `slug` | `text` | `NOT NULL` | — | — | — |
| `title` | `text` | `NOT NULL` | — | — | — |
| `cover_image_url` | `text` | `NULL` | — | — | — |
| `author` | `text` | `NOT NULL` | — | — | — |
| `body` | `text` | `NOT NULL` | — | — | — |
| `excerpt` | `text` | `NULL` | — | — | — |
| `published_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `updated_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |

#### Constraints

```sql
CONSTRAINT "articles_pkey" PRIMARY KEY (id)
CONSTRAINT "articles_slug_key" UNIQUE (slug)
```

#### Indexes

##### `articles_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX articles_pkey ON public.articles USING btree (id);
```

##### `articles_slug_key`

```sql
CREATE UNIQUE INDEX articles_slug_key ON public.articles USING btree (slug);
```

##### `idx_articles_published`

```sql
CREATE INDEX idx_articles_published ON public.articles USING btree (published_at DESC);
```

##### `idx_articles_slug`

```sql
CREATE INDEX idx_articles_slug ON public.articles USING btree (slug);
```

### `public.news`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `type` | `text` | `NOT NULL` | — | — | — |
| `title` | `text` | `NULL` | — | — | — |
| `body` | `text` | `NULL` | — | — | — |
| `pinned` | `boolean` | `NOT NULL` | `false` | — | — |
| `home_team_id` | `text` | `NULL` | — | — | — |
| `away_team_id` | `text` | `NULL` | — | — | — |
| `home_score` | `integer` | `NULL` | — | — | — |
| `away_score` | `integer` | `NULL` | — | — | — |
| `event_date` | `timestamp with time zone` | `NULL` | — | — | — |
| `notes` | `text` | `NULL` | — | — | — |
| `author` | `text` | `NULL` | — | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `auto_from_submission` | `text` | `NULL` | — | — | — |

#### Constraints

```sql
CONSTRAINT "news_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_news_type`

```sql
CREATE INDEX idx_news_type ON public.news USING btree (type);
```

##### `news_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX news_pkey ON public.news USING btree (id);
```

### `public.position_change_requests`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | `NOT NULL` | `gen_random_uuid()` | — | — |
| `account_id` | `uuid` | `NOT NULL` | — | — | — |
| `username` | `text` | `NOT NULL` | — | — | — |
| `from_pos` | `text` | `NOT NULL` | — | — | — |
| `to_pos` | `text` | `NOT NULL` | — | — | — |
| `reason` | `text` | `NULL` | `''::text` | — | — |
| `status` | `text` | `NOT NULL` | `'pending'::text` | — | — |
| `reviewed_by` | `text` | `NULL` | — | — | — |
| `reviewed_at` | `timestamp with time zone` | `NULL` | — | — | — |
| `review_note` | `text` | `NULL` | `''::text` | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |

#### Constraints

```sql
CONSTRAINT "position_change_requests_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE
CONSTRAINT "position_change_requests_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_pcr_account`

```sql
CREATE INDEX idx_pcr_account ON public.position_change_requests USING btree (account_id, created_at DESC);
```

##### `idx_pcr_status`

```sql
CREATE INDEX idx_pcr_status ON public.position_change_requests USING btree (status, created_at DESC);
```

##### `position_change_requests_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX position_change_requests_pkey ON public.position_change_requests USING btree (id);
```

### `public.rules_sections`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `title` | `text` | `NOT NULL` | — | — | — |
| `body` | `text` | `NOT NULL` | `''::text` | — | — |
| `sort_order` | `integer` | `NOT NULL` | `0` | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `updated_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |

#### Constraints

```sql
CONSTRAINT "rules_sections_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_rules_sort`

```sql
CREATE INDEX idx_rules_sort ON public.rules_sections USING btree (sort_order);
```

##### `rules_sections_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX rules_sections_pkey ON public.rules_sections USING btree (id);
```

### `public.scheduled_matches`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `season` | `text` | `NOT NULL` | — | — | — |
| `week` | `integer` | `NOT NULL` | — | — | — |
| `home_team_id` | `text` | `NOT NULL` | — | — | — |
| `away_team_id` | `text` | `NOT NULL` | — | — | — |
| `scheduled_date` | `timestamp with time zone` | `NULL` | — | — | — |
| `stream_url` | `text` | `NULL` | — | — | — |
| `match_type` | `text` | `NOT NULL` | `'regular'::text` | — | — |
| `playoff_round` | `text` | `NULL` | — | — | — |
| `status` | `text` | `NOT NULL` | `'scheduled'::text` | — | — |
| `home_score` | `integer` | `NULL` | — | — | — |
| `away_score` | `integer` | `NULL` | — | — | — |
| `linked_match_id` | `text` | `NULL` | — | — | — |
| `notes` | `text` | `NULL` | — | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `updated_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |

#### Constraints

```sql
CONSTRAINT "scheduled_matches_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_sched_date`

```sql
CREATE INDEX idx_sched_date ON public.scheduled_matches USING btree (scheduled_date);
```

##### `idx_sched_linked`

```sql
CREATE INDEX idx_sched_linked ON public.scheduled_matches USING btree (linked_match_id);
```

##### `idx_sched_season_week`

```sql
CREATE INDEX idx_sched_season_week ON public.scheduled_matches USING btree (season, week);
```

##### `idx_sched_status`

```sql
CREATE INDEX idx_sched_status ON public.scheduled_matches USING btree (status);
```

##### `scheduled_matches_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX scheduled_matches_pkey ON public.scheduled_matches USING btree (id);
```

### `public.settings`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `key` | `text` | `NOT NULL` | — | — | — |
| `value` | `text` | `NULL` | — | — | — |

#### Constraints

```sql
CONSTRAINT "settings_pkey" PRIMARY KEY (key)
```

#### Indexes

##### `settings_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX settings_pkey ON public.settings USING btree (key);
```

### `public.submissions`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `status` | `text` | `NOT NULL` | `'pending'::text` | — | — |
| `submitted_by` | `text` | `NOT NULL` | — | — | — |
| `submitted_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `reviewed_by` | `text` | `NULL` | — | — | — |
| `reviewed_at` | `timestamp with time zone` | `NULL` | — | — | — |
| `rejection_reason` | `text` | `NULL` | — | — | — |
| `match_info` | `jsonb` | `NOT NULL` | — | — | — |
| `player_stats` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `edits` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |

#### Constraints

```sql
CONSTRAINT "submissions_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_submissions_status`

```sql
CREATE INDEX idx_submissions_status ON public.submissions USING btree (status);
```

##### `submissions_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX submissions_pkey ON public.submissions USING btree (id);
```

### `public.teams`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `name` | `text` | `NOT NULL` | — | — | — |
| `tag` | `text` | `NOT NULL` | — | — | — |
| `color` | `text` | `NULL` | — | — | — |
| `description` | `text` | `NULL` | — | — | — |
| `owner_username` | `text` | `NOT NULL` | — | — | — |
| `members` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `pending_members` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `totw` | `boolean` | `NOT NULL` | `false` | — | — |
| `totw_set_at` | `timestamp with time zone` | `NULL` | — | — | — |
| `status` | `text` | `NOT NULL` | `'pending'::text` | — | — |
| `logo_url` | `text` | `NULL` | — | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `reviewed_at` | `timestamp with time zone` | `NULL` | — | — | — |
| `reviewed_by` | `text` | `NULL` | — | — | — |
| `rejection_reason` | `text` | `NULL` | — | — | — |
| `lineup` | `jsonb` | `NOT NULL` | `'{}'::jsonb` | — | — |
| `formation` | `text` | `NOT NULL` | `'2-1-2'::text` | — | — |
| `seasons` | `text[]` | `NULL` | — | — | — |

#### Constraints

```sql
CONSTRAINT "teams_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_teams_status`

```sql
CREATE INDEX idx_teams_status ON public.teams USING btree (status);
```

##### `teams_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX teams_pkey ON public.teams USING btree (id);
```

### `public.totw_votes`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | `NOT NULL` | `gen_random_uuid()` | — | — |
| `period_id` | `uuid` | `NOT NULL` | — | — | — |
| `voter_username` | `text` | `NOT NULL` | — | — | — |
| `position` | `text` | `NOT NULL` | — | — | — |
| `voted_for_username` | `text` | `NOT NULL` | — | — | — |
| `voted_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |

#### Constraints

```sql
CONSTRAINT "totw_votes_period_id_fkey" FOREIGN KEY (period_id) REFERENCES public.totw_voting_periods(id) ON DELETE CASCADE
CONSTRAINT "totw_votes_period_id_voter_username_position_key" UNIQUE (period_id, voter_username, "position")
CONSTRAINT "totw_votes_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_totw_votes_period`

```sql
CREATE INDEX idx_totw_votes_period ON public.totw_votes USING btree (period_id);
```

##### `idx_totw_votes_voter`

```sql
CREATE INDEX idx_totw_votes_voter ON public.totw_votes USING btree (period_id, voter_username);
```

##### `totw_votes_period_id_voter_username_position_key`

```sql
CREATE UNIQUE INDEX totw_votes_period_id_voter_username_position_key ON public.totw_votes USING btree (period_id, voter_username, "position");
```

##### `totw_votes_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX totw_votes_pkey ON public.totw_votes USING btree (id);
```

### `public.totw_voting_periods`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `uuid` | `NOT NULL` | `gen_random_uuid()` | — | — |
| `opens_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `closes_at` | `timestamp with time zone` | `NOT NULL` | — | — | — |
| `status` | `text` | `NOT NULL` | `'open'::text` | — | — |
| `eligible_players` | `jsonb` | `NOT NULL` | `'[]'::jsonb` | — | — |
| `winners` | `jsonb` | `NULL` | — | — | — |
| `created_by` | `text` | `NOT NULL` | — | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `resolved_at` | `timestamp with time zone` | `NULL` | — | — | — |

#### Constraints

```sql
CONSTRAINT "totw_voting_periods_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `totw_voting_periods_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX totw_voting_periods_pkey ON public.totw_voting_periods USING btree (id);
```

### `public.transfers`

| Column | SQL type | Nullability | Default | Identity | Generated |
| --- | --- | --- | --- | --- | --- |
| `id` | `text` | `NOT NULL` | — | — | — |
| `season` | `text` | `NOT NULL` | — | — | — |
| `player_username` | `text` | `NOT NULL` | — | — | — |
| `from_team_id` | `text` | `NULL` | — | — | — |
| `to_team_id` | `text` | `NULL` | — | — | — |
| `kind` | `text` | `NOT NULL` | — | — | — |
| `window_type` | `text` | `NULL` | — | — | — |
| `created_at` | `timestamp with time zone` | `NOT NULL` | `now()` | — | — |
| `created_by` | `text` | `NULL` | — | — | — |

#### Constraints

```sql
CONSTRAINT "transfers_pkey" PRIMARY KEY (id)
```

#### Indexes

##### `idx_transfers_created`

```sql
CREATE INDEX idx_transfers_created ON public.transfers USING btree (created_at DESC);
```

##### `idx_transfers_player`

```sql
CREATE INDEX idx_transfers_player ON public.transfers USING btree (player_username);
```

##### `idx_transfers_season`

```sql
CREATE INDEX idx_transfers_season ON public.transfers USING btree (season);
```

##### `transfers_pkey` (PRIMARY KEY)

```sql
CREATE UNIQUE INDEX transfers_pkey ON public.transfers USING btree (id);
```
