CREATE ROLE api_test LOGIN PASSWORD 'napl_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT;
GRANT app_runtime, gateway_runtime TO api_test;
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444'),('55555555-5555-4555-8555-555555555555');
INSERT INTO auth.sessions(id,user_id) SELECT id,id FROM auth.users;
INSERT INTO auth_gateway.memberships(user_id,discord_user_id,eligible,valid_until) SELECT id,'discord',true,now()+interval '1 hour' FROM auth.users;
INSERT INTO public.accounts(id,username,username_lower,strikers_id,position,email) VALUES
('11111111-1111-4111-8111-111111111111','Alice','alice','123','GK','alice@private.test'),
('22222222-2222-4222-8222-222222222222','Bob','bob','456','ST','bob@private.test'),
('33333333-3333-4333-8333-333333333333','Admin','admin','789','CM','admin@private.test'),
('55555555-5555-4555-8555-555555555555','Goalie','goalie','999','GK','goalie@private.test');
INSERT INTO auth_gateway.user_roles(user_id,role) VALUES ('33333333-3333-4333-8333-333333333333','super_admin');
