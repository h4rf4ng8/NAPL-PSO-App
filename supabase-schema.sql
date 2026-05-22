-- =============================================================
-- NAPL Stats Hub — Supabase Database Schema
-- =============================================================
-- Run this entire file in the Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → paste this → click "Run")
--
-- This creates all the tables, indexes, and security policies your
-- app needs. Run it once when you set up the Supabase project.
-- =============================================================

-- ----- ACCOUNTS (player profiles, linked 1:1 to auth.users) -----
CREATE TABLE IF NOT EXISTS public.accounts (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT NOT NULL UNIQUE,
  username_lower  TEXT NOT NULL UNIQUE,
  position        TEXT NOT NULL DEFAULT 'CM',
  team_id         TEXT,
  image_url       TEXT,
  stats           JSONB NOT NULL DEFAULT '{}'::jsonb,
  matches         JSONB NOT NULL DEFAULT '[]'::jsonb,
  awards          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_team ON public.accounts(team_id);

-- ----- TEAMS -----
CREATE TABLE IF NOT EXISTS public.teams (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  tag               TEXT NOT NULL,
  color             TEXT,
  description       TEXT,
  owner_username    TEXT NOT NULL,
  members           JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending',
  logo_url          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       TEXT,
  rejection_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_teams_status ON public.teams(status);

-- ----- SUBMISSIONS (admin match stats waiting for review) -----
CREATE TABLE IF NOT EXISTS public.submissions (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL DEFAULT 'pending',
  submitted_by      TEXT NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  match_info        JSONB NOT NULL,
  player_stats      JSONB NOT NULL DEFAULT '[]'::jsonb,
  edits             JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);

-- ----- NEWS (announcements / matchups / results) -----
CREATE TABLE IF NOT EXISTS public.news (
  id                    TEXT PRIMARY KEY,
  type                  TEXT NOT NULL,
  title                 TEXT,
  body                  TEXT,
  pinned                BOOLEAN NOT NULL DEFAULT FALSE,
  home_team_id          TEXT,
  away_team_id          TEXT,
  home_score            INTEGER,
  away_score            INTEGER,
  event_date            TIMESTAMPTZ,
  notes                 TEXT,
  author                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_from_submission  TEXT
);

CREATE INDEX IF NOT EXISTS idx_news_type ON public.news(type);

-- ----- SETTINGS (current season, admin list, etc.) -----
CREATE TABLE IF NOT EXISTS public.settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

INSERT INTO public.settings (key, value) VALUES ('current_season', 'S1')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.settings (key, value) VALUES ('admin_list', '[]')
ON CONFLICT (key) DO NOTHING;

-- =============================================================
-- ROW LEVEL SECURITY — controls who can read/write each table
-- =============================================================
ALTER TABLE public.accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings    ENABLE ROW LEVEL SECURITY;

-- ACCOUNTS:
-- Anyone logged in can read all accounts (needed for leaderboard, rankings, etc.)
-- A user can only update their own row.
CREATE POLICY "accounts_read_all" ON public.accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "accounts_insert_self" ON public.accounts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "accounts_update_self" ON public.accounts
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- TEAMS: anyone logged in can read all teams, anyone can insert/update
-- (admin checks happen in the app — Supabase doesn't know who's an admin)
CREATE POLICY "teams_read_all" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_insert" ON public.teams FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "teams_update" ON public.teams FOR UPDATE TO authenticated USING (true);
CREATE POLICY "teams_delete" ON public.teams FOR DELETE TO authenticated USING (true);

-- SUBMISSIONS: same — admins manage via UI
CREATE POLICY "subs_read_all" ON public.submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "subs_insert" ON public.submissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "subs_update" ON public.submissions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "subs_delete" ON public.submissions FOR DELETE TO authenticated USING (true);

-- NEWS
CREATE POLICY "news_read_all" ON public.news FOR SELECT TO authenticated USING (true);
CREATE POLICY "news_insert" ON public.news FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "news_update" ON public.news FOR UPDATE TO authenticated USING (true);
CREATE POLICY "news_delete" ON public.news FOR DELETE TO authenticated USING (true);

-- SETTINGS
CREATE POLICY "settings_read_all" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_upsert" ON public.settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "settings_update" ON public.settings FOR UPDATE TO authenticated USING (true);

-- =============================================================
-- STORAGE — for player and team images
-- =============================================================
-- After running this SQL, go to: Dashboard → Storage → New Bucket
-- Create a bucket named: napl-images
-- Set it to PUBLIC (so image URLs work without auth)
-- =============================================================
