-- Read-only parity checks after replay; supply the migration alias/exclusion settings.
-- Errors identify only table names/counts, never private row payloads.
DO $$ DECLARE t text; cols text; mismatch bigint; BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','articles','rules_sections','submissions','news','position_change_requests','totw_voting_periods','teams','scheduled_matches','transfers','totw_votes'] LOOP
    SELECT string_agg(format('n.%1$I IS NOT DISTINCT FROM o.%1$I',n.column_name),' AND ' ORDER BY n.ordinal_position) INTO cols
    FROM information_schema.columns n JOIN information_schema.columns o ON o.table_schema='public' AND o.table_name=n.table_name AND o.column_name=n.column_name
    WHERE n.table_schema='asl' AND n.table_name=t;
    IF t='teams' THEN
      EXECUTE format('SELECT count(*) FROM (SELECT * FROM public.teams WHERE NOT COALESCE(NULLIF(current_setting(''asl_migration.excluded_team_ids'',true),''''),''[]'')::jsonb ? id) o FULL JOIN asl.teams n ON n.id=o.id WHERE NOT COALESCE(%s,false)',cols) INTO mismatch;
    ELSIF t='totw_votes' THEN
      EXECUTE format('SELECT count(*) FROM (SELECT * FROM public.totw_votes WHERE NOT COALESCE(NULLIF(current_setting(''asl_migration.excluded_vote_ids'',true),''''),''[]'')::jsonb ? id::text) o FULL JOIN asl.totw_votes n ON n.id=o.id WHERE NOT COALESCE(%s,false)',cols) INTO mismatch;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%1$I o FULL JOIN asl.%1$I n ON n.id=o.id WHERE NOT COALESCE(%2$s,false)',t,cols) INTO mismatch;
    END IF;
    IF mismatch<>0 THEN RAISE EXCEPTION 'asl preservation mismatch: % (% rows)',t,mismatch; END IF;
  END LOOP;
  SELECT count(*) INTO mismatch FROM public.settings o FULL JOIN asl.settings n ON n.key=o.key
  WHERE COALESCE(o.key,n.key) NOT IN ('admin_list','discord_webhook','discord_webhook_url','discord_transfer_webhook')
    AND (o.key IS NULL OR n.key IS NULL OR o.value IS DISTINCT FROM n.value);
  IF mismatch<>0 THEN RAISE EXCEPTION 'asl preservation mismatch: settings (% rows)',mismatch; END IF;
END $$;
-- Accounts.team_id is canonical; any legacy roster discrepancy requires review.
DO $$ DECLARE mismatch bigint; BEGIN
WITH aliases AS (
 SELECT lower(username) username,id FROM public.accounts
 UNION ALL SELECT lower(key),value::uuid FROM jsonb_each_text(COALESCE(NULLIF(current_setting('asl_migration.account_aliases',true),''),'{}')::jsonb)
), legacy AS (
 SELECT t.id team_id,a.id account_id
 FROM public.teams t CROSS JOIN LATERAL jsonb_array_elements_text(t.members) m(username)
 LEFT JOIN aliases a ON a.username=lower(m.username)
 WHERE NOT COALESCE(NULLIF(current_setting('asl_migration.excluded_team_ids',true),''),'[]')::jsonb ? t.id
), canonical AS (
 SELECT team_id,id account_id FROM asl.accounts WHERE team_id IS NOT NULL
), missing AS (
 SELECT team_id,account_id FROM legacy EXCEPT SELECT team_id,account_id FROM canonical
), extra AS (
 SELECT team_id,account_id FROM canonical EXCEPT SELECT team_id,account_id FROM legacy
)
SELECT count(*) INTO mismatch FROM (SELECT * FROM missing UNION ALL SELECT * FROM extra) differences;
IF mismatch<>0 THEN RAISE EXCEPTION 'asl roster mismatch (% memberships); review canonical accounts.team_id before retrying',mismatch; END IF;
END $$;

DO $$ DECLARE mismatch bigint; BEGIN
  WITH aliases AS (
    SELECT lower(username) username,id FROM public.accounts
    UNION ALL SELECT lower(key),value::uuid FROM jsonb_each_text(COALESCE(NULLIF(current_setting('asl_migration.account_aliases',true),''),'{}')::jsonb)
  )
  SELECT count(*) INTO mismatch FROM (
    SELECT t.id FROM asl.teams t JOIN public.teams o USING(id)
      WHERE NOT EXISTS(SELECT 1 FROM aliases a WHERE a.username=lower(o.owner_username) AND a.id=t.owner_account_id)
    UNION ALL
    SELECT n.id FROM asl.transfers n JOIN public.transfers o USING(id)
      WHERE n.season_id<>o.season OR n.player_username_snapshot<>o.player_username
        OR NOT EXISTS(SELECT 1 FROM aliases a WHERE a.username=lower(o.player_username) AND a.id=n.player_account_id)
    UNION ALL
    SELECT n.id FROM asl.scheduled_matches n JOIN public.scheduled_matches o USING(id) WHERE n.season_id<>o.season
    UNION ALL
    SELECT n.id::text FROM asl.totw_votes n JOIN public.totw_votes o USING(id)
      WHERE NOT EXISTS(SELECT 1 FROM aliases a WHERE a.username=lower(o.voter_username) AND a.id=n.voter_account_id)
         OR NOT EXISTS(SELECT 1 FROM aliases a WHERE a.username=lower(o.voted_for_username) AND a.id=n.voted_for_account_id)
  ) d;
  IF mismatch<>0 THEN RAISE EXCEPTION 'asl normalized identity/season mismatch (% rows)',mismatch; END IF;
END $$;
