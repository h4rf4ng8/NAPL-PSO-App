-- Release gate: deploy compatible gateway/API/web first. Review deployed views,
-- RPCs, inherited grants and exposed schemas before applying this cutover.
BEGIN;
DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['accounts','teams','submissions','news','settings','rules_sections','articles','scheduled_matches','transfers','totw_voting_periods','totw_votes','position_change_requests','accounts_public'] LOOP
    IF to_regclass(format('public.%I',name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',name);
    END IF;
  END LOOP;
END $$;
-- Public RPCs can bypass table grants via SECURITY DEFINER. Inventory and
-- explicitly regrant reviewed provider hooks to their service role if needed.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
DELETE FROM public.settings WHERE key IN ('admin_list','discord_webhook','discord_webhook_url','discord_transfer_webhook');
COMMIT;
