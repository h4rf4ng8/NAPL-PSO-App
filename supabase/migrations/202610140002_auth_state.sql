-- Bounded shared state used by the API's PostgreSQL auth store.
BEGIN;

CREATE TABLE auth_gateway.auth_login_replays (
  digest text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_login_replays_expiry ON auth_gateway.auth_login_replays (expires_at);

CREATE TABLE auth_gateway.auth_refresh_leases (
  session_id uuid PRIMARY KEY,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_refresh_leases_expiry ON auth_gateway.auth_refresh_leases (expires_at);

CREATE TABLE auth_gateway.auth_refresh_results (
  key text PRIMARY KEY,
  sealed text NOT NULL CHECK (octet_length(sealed) <= 16384),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_refresh_results_expiry ON auth_gateway.auth_refresh_results (expires_at);

CREATE TABLE auth_gateway.auth_rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rate_key text NOT NULL,
  event_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_events_key_time ON auth_gateway.auth_rate_events (rate_key, event_at);
CREATE INDEX auth_rate_events_expiry ON auth_gateway.auth_rate_events (expires_at);

ALTER TABLE auth_gateway.auth_login_replays ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.auth_refresh_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.auth_refresh_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_gateway.auth_rate_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE auth_gateway.auth_login_replays, auth_gateway.auth_refresh_leases,
  auth_gateway.auth_refresh_results, auth_gateway.auth_rate_events
  FROM PUBLIC, anon, authenticated, app_runtime, gateway_runtime;

-- SECURITY DEFINER is needed so callers receive only these bounded operations,
-- never direct table access. search_path is fixed and every object is qualified.
CREATE FUNCTION auth_gateway.auth_consume_login(p_digest text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' SET statement_timeout = '3s' AS $$
DECLARE changed integer;
BEGIN
  WITH expired AS (
    SELECT ctid FROM auth_gateway.auth_login_replays WHERE expires_at <= clock_timestamp() LIMIT 100
  ) DELETE FROM auth_gateway.auth_login_replays t USING expired WHERE t.ctid=expired.ctid;
  PERFORM pg_catalog.pg_advisory_xact_lock(731904222);
  DELETE FROM auth_gateway.auth_login_replays WHERE digest=p_digest AND expires_at <= clock_timestamp();
  IF NOT EXISTS (SELECT 1 FROM auth_gateway.auth_login_replays WHERE digest=p_digest AND expires_at > clock_timestamp())
     AND (SELECT count(*) FROM auth_gateway.auth_login_replays WHERE expires_at > clock_timestamp()) >= 10000 THEN
    RAISE EXCEPTION 'auth replay state capacity reached' USING ERRCODE='54000';
  END IF;
  INSERT INTO auth_gateway.auth_login_replays(digest, expires_at)
    VALUES (p_digest, clock_timestamp() + interval '10 minutes')
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END; $$;

CREATE FUNCTION auth_gateway.auth_read_refresh(p_key text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' SET statement_timeout = '3s' AS $$
DECLARE result text;
BEGIN
  WITH expired AS (
    SELECT ctid FROM auth_gateway.auth_refresh_results WHERE expires_at <= clock_timestamp() LIMIT 100
  ) DELETE FROM auth_gateway.auth_refresh_results t USING expired WHERE t.ctid=expired.ctid;
  SELECT sealed INTO result FROM auth_gateway.auth_refresh_results
    WHERE key=p_key AND expires_at > clock_timestamp();
  RETURN result;
END; $$;

CREATE FUNCTION auth_gateway.auth_claim_refresh(p_session uuid, p_owner text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' SET statement_timeout = '3s' AS $$
DECLARE changed integer;
BEGIN
  WITH expired AS (
    SELECT ctid FROM auth_gateway.auth_refresh_leases WHERE expires_at <= clock_timestamp() LIMIT 100
  ) DELETE FROM auth_gateway.auth_refresh_leases t USING expired WHERE t.ctid=expired.ctid;
  PERFORM pg_catalog.pg_advisory_xact_lock(731904224);
  IF NOT EXISTS (SELECT 1 FROM auth_gateway.auth_refresh_leases WHERE session_id=p_session AND expires_at > clock_timestamp())
     AND (SELECT count(*) FROM auth_gateway.auth_refresh_leases WHERE expires_at > clock_timestamp()) >= 10000 THEN
    RETURN false;
  END IF;
  INSERT INTO auth_gateway.auth_refresh_leases(session_id, owner, expires_at)
    VALUES (p_session, p_owner, clock_timestamp() + interval '45 seconds')
    ON CONFLICT (session_id) DO UPDATE SET owner=EXCLUDED.owner, expires_at=EXCLUDED.expires_at
      WHERE auth_gateway.auth_refresh_leases.expires_at <= clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END; $$;

CREATE FUNCTION auth_gateway.auth_publish_refresh(p_session uuid, p_owner text, p_key text, p_sealed text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' SET statement_timeout = '3s' AS $$
DECLARE accepted boolean;
BEGIN
  IF octet_length(p_sealed) > 16384 THEN RETURN false; END IF;
  WITH expired AS (
    SELECT ctid FROM auth_gateway.auth_refresh_results WHERE expires_at <= clock_timestamp() LIMIT 100
  ) DELETE FROM auth_gateway.auth_refresh_results t USING expired WHERE t.ctid=expired.ctid;
  PERFORM pg_catalog.pg_advisory_xact_lock(731904223);
  PERFORM 1 FROM auth_gateway.auth_refresh_leases
    WHERE session_id=p_session AND owner=p_owner AND expires_at > clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth_gateway.auth_refresh_results WHERE key=p_key AND expires_at > clock_timestamp())
     AND (SELECT count(*) FROM auth_gateway.auth_refresh_results WHERE expires_at > clock_timestamp()) >= 10000 THEN
    RETURN false;
  END IF;
  INSERT INTO auth_gateway.auth_refresh_results(key, sealed, expires_at)
    VALUES (p_key, p_sealed, clock_timestamp() + interval '10 seconds')
    ON CONFLICT (key) DO UPDATE SET sealed=EXCLUDED.sealed, expires_at=EXCLUDED.expires_at;
  RETURN true;
END; $$;

CREATE FUNCTION auth_gateway.auth_release_refresh(p_session uuid, p_owner text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' SET statement_timeout = '3s' AS $$
DECLARE changed integer;
BEGIN
  DELETE FROM auth_gateway.auth_refresh_leases WHERE session_id=p_session AND owner=p_owner;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE FUNCTION auth_gateway.auth_admit(p_limits jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' SET statement_timeout = '3s' AS $$
DECLARE
  now_at timestamptz;
  item record;
  active_keys bigint;
  new_keys bigint;
  used bigint;
  retry_seconds integer := 0;
  is_limited boolean := false;
BEGIN
  IF p_limits IS NULL OR jsonb_typeof(p_limits) <> 'array'
     OR jsonb_array_length(p_limits) < 1 OR jsonb_array_length(p_limits) > 8 THEN
    RAISE EXCEPTION 'invalid auth limits' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT key)
      FROM jsonb_to_recordset(p_limits) AS q(key text, count integer, "windowMs" integer)) THEN
    RAISE EXCEPTION 'duplicate auth limit key' USING ERRCODE='22023';
  END IF;
  -- One auth-only lock serializes active-key cap checks and multi-key admissions.
  PERFORM pg_catalog.pg_advisory_xact_lock(731904221);
  now_at := clock_timestamp();
  WITH expired AS (
    SELECT ctid FROM auth_gateway.auth_rate_events WHERE expires_at <= now_at LIMIT 100
  ) DELETE FROM auth_gateway.auth_rate_events t USING expired WHERE t.ctid=expired.ctid;

  SELECT count(DISTINCT rate_key) INTO active_keys FROM auth_gateway.auth_rate_events WHERE expires_at > now_at;
  SELECT count(DISTINCT q.key) INTO new_keys
    FROM jsonb_to_recordset(p_limits) AS q(key text, count integer, "windowMs" integer)
    WHERE NOT EXISTS (SELECT 1 FROM auth_gateway.auth_rate_events e WHERE e.rate_key=q.key AND e.expires_at>now_at);
  FOR item IN SELECT key, count AS max_count, "windowMs" AS window_ms
    FROM jsonb_to_recordset(p_limits) AS q(key text, count integer, "windowMs" integer)
  LOOP
    IF item.key IS NULL OR item.key = '' OR octet_length(item.key) > 128
       OR item.max_count IS NULL OR item.max_count < 1 OR item.max_count > 10000
       OR item.window_ms IS NULL OR item.window_ms < 1 OR item.window_ms > 600000 THEN
      RAISE EXCEPTION 'invalid auth limit' USING ERRCODE='22023';
    END IF;
    SELECT count(*) INTO used FROM auth_gateway.auth_rate_events
      WHERE rate_key=item.key AND event_at > now_at - (item.window_ms * interval '1 millisecond');
    IF used >= item.max_count THEN
      is_limited := true;
      SELECT greatest(retry_seconds, ceil(extract(epoch FROM min(event_at) + (item.window_ms * interval '1 millisecond') - now_at))::integer)
        INTO retry_seconds FROM auth_gateway.auth_rate_events
        WHERE rate_key=item.key AND event_at > now_at - (item.window_ms * interval '1 millisecond');
    END IF;
  END LOOP;
  IF is_limited THEN
    RETURN jsonb_build_object('status','limited','retryAfter',greatest(1,retry_seconds));
  END IF;
  IF active_keys + new_keys > 10000 THEN
    RETURN jsonb_build_object('status','capacity','retryAfter',1);
  END IF;
  FOR item IN SELECT key, "windowMs" AS window_ms
    FROM jsonb_to_recordset(p_limits) AS q(key text, count integer, "windowMs" integer)
  LOOP
    INSERT INTO auth_gateway.auth_rate_events(rate_key,event_at,expires_at)
      VALUES (item.key, now_at, now_at + (item.window_ms * interval '1 millisecond'));
  END LOOP;
  RETURN jsonb_build_object('status','allowed','retryAfter',0);
END; $$;

REVOKE ALL ON FUNCTION auth_gateway.auth_consume_login(text), auth_gateway.auth_read_refresh(text),
  auth_gateway.auth_claim_refresh(uuid,text), auth_gateway.auth_publish_refresh(uuid,text,text,text),
  auth_gateway.auth_release_refresh(uuid,text), auth_gateway.auth_admit(jsonb)
  FROM PUBLIC, anon, authenticated, app_runtime;
GRANT EXECUTE ON FUNCTION auth_gateway.auth_consume_login(text), auth_gateway.auth_read_refresh(text),
  auth_gateway.auth_claim_refresh(uuid,text), auth_gateway.auth_publish_refresh(uuid,text,text,text),
  auth_gateway.auth_release_refresh(uuid,text), auth_gateway.auth_admit(jsonb)
  TO gateway_runtime;

COMMIT;
