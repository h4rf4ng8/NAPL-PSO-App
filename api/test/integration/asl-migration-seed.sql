INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.accounts(id,username,username_lower,position,team_id) VALUES ('11111111-1111-4111-8111-111111111111','Alice','alice','CB','A'),('22222222-2222-4222-8222-222222222222','Bob','bob','ST',NULL);
INSERT INTO public.teams(id,name,tag,owner_username,pending_members,seasons) VALUES ('A','A','A','OldAlice','[{"username":"Bob","status":"declined","respondedAt":123}]',ARRAY['S1']);
INSERT INTO public.settings VALUES ('current_season','S2');
INSERT INTO public.totw_voting_periods(id,closes_at,created_by,eligible_players) VALUES ('33333333-3333-4333-8333-333333333333',now()+interval '1 hour','OldAlice','["Alice"]');
INSERT INTO public.totw_votes(period_id,voter_username,position,voted_for_username) VALUES ('33333333-3333-4333-8333-333333333333','Bob','DEF','Alice');
INSERT INTO public.teams(id,name,tag,owner_username) VALUES ('excluded-test-team','Excluded','EX','Unknown test owner');
INSERT INTO public.totw_votes(id,period_id,voter_username,position,voted_for_username) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','Unknown test voter','DEF','Alice');

UPDATE public.accounts SET stats='{"games":10,"goals":2}' WHERE username='Alice';
UPDATE public.totw_voting_periods SET winners='null'::jsonb;
INSERT INTO public.totw_voting_periods(id,closes_at,created_by,eligible_players,winners) VALUES ('44444444-4444-4444-8444-444444444444',now()+interval '1 hour','Bob','["Bob"]','{"st1":"Bob"}');

UPDATE public.teams SET members='["Alice"]' WHERE id='A';
