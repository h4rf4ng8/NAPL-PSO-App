GRANT app_runtime, gateway_runtime TO napl_local;

-- Public sample data only. Players sign in with their own Discord accounts.
INSERT INTO public.teams(id, name, tag, color, description, owner_username, status)
VALUES
  ('local-comets', 'Local Comets', 'COM', '#4f8cff', 'Sample team for local development.', 'LocalDemo', 'approved'),
  ('local-orbits', 'Local Orbits', 'ORB', '#e8994a', 'Sample team for local development.', 'LocalDemo', 'approved');

INSERT INTO public.news(id, type, title, body, pinned, author)
VALUES ('local-welcome', 'announcement', 'Welcome to your local league',
        'The web, Lambda API, PostgreSQL database, and authentication service are running locally.', true, 'LocalDemo');

INSERT INTO public.rules_sections(id, title, body, sort_order)
VALUES ('local-rules', 'Local development', 'Sign in with Discord to create your player profile and try the league features.', 0);

INSERT INTO public.scheduled_matches(id, season, week, home_team_id, away_team_id, scheduled_date, status)
VALUES ('local-opener', 'S1', 1, 'local-comets', 'local-orbits', now() + interval '7 days', 'scheduled');
