-- Isolated replay assertions; run after the additive migration.
DO $$ DECLARE n integer; BEGIN
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname='asl';
  IF n<>17 THEN RAISE EXCEPTION 'expected 17 asl tables, got %',n; END IF;
  IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='asl' AND NOT rowsecurity) THEN RAISE EXCEPTION 'asl table missing RLS'; END IF;
  IF has_schema_privilege('anon','asl','USAGE') OR has_schema_privilege('authenticated','asl','USAGE') THEN RAISE EXCEPTION 'asl exposed to browser role'; END IF;
  IF NOT has_table_privilege('app_runtime','asl.accounts','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'missing runtime grant'; END IF;
  IF EXISTS(SELECT 1 FROM asl.accounts WHERE username_lower<>lower(username)) THEN RAISE EXCEPTION 'username_lower mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='asl' AND table_name='teams' AND column_name IN ('owner_username','members','pending_members','seasons')) THEN RAISE EXCEPTION 'deprecated teams columns retained'; END IF;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM asl.seasons WHERE id IN ('games','goals')) THEN RAISE EXCEPTION 'flat aggregate stats mistaken for seasons'; END IF;
  IF EXISTS(SELECT 1 FROM public.teams WHERE id='A' AND name='A') THEN
    IF EXISTS(SELECT 1 FROM asl.teams WHERE id='excluded-test-team') OR EXISTS(SELECT 1 FROM asl.totw_votes WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN RAISE EXCEPTION 'explicit exclusion ignored'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.teams WHERE id='excluded-test-team') OR NOT EXISTS(SELECT 1 FROM public.totw_votes WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN RAISE EXCEPTION 'exclusion destroyed legacy data'; END IF;
    IF NOT EXISTS(SELECT 1 FROM asl.team_seasons WHERE team_id='A' AND season_id='S2') OR EXISTS(SELECT 1 FROM asl.team_seasons WHERE team_id='A' AND season_id='S1') THEN RAISE EXCEPTION 'season exclusions were not inverted'; END IF;
    IF NOT EXISTS(SELECT 1 FROM asl.team_join_requests WHERE team_id='A' AND status='declined' AND details->>'respondedAt'='123' AND reviewed_at=to_timestamp(0.123)) THEN RAISE EXCEPTION 'invitation detail lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM asl.totw_candidates WHERE account_id='11111111-1111-4111-8111-111111111111' AND position='DEF') THEN RAISE EXCEPTION 'historical candidate position lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM asl.totw_winners WHERE period_id='44444444-4444-4444-8444-444444444444' AND position='ST' AND details->>'key'='st1') THEN RAISE EXCEPTION 'multi-slot winner position lost'; END IF;
    IF NOT EXISTS(SELECT 1 FROM asl.teams WHERE id='A' AND owner_account_id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'verified owner alias lost'; END IF;
  END IF;
END $$;
