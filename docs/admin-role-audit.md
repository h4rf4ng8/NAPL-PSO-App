# Administrator assignment history

`PUT /api/roles` requires a verified super administrator. Each changed administrator set appends an event in `auth_gateway.role_audit_events` with the server-derived actor, database timestamp, and complete previous and next sets. IDs are normalized and deduplicated; submitting the existing set creates no event.

The role replacement and audit append share a serializable transaction. If the append fails, the roles remain unchanged. Concurrent changes either commit complete sets with matching history or return a conflict.

Apply `supabase/migrations/202610140001_role_audit.sql` before releasing this API change. The API runtime can only append events; it cannot read, update, delete, or truncate them. Gateway and browser roles have no table access. The migration owner can inspect history directly. Events have no account foreign key, so deleting an account does not erase the record.

Run `npm run test:integration` with Node 24 and Docker to verify authorization, no-op changes, rollback, concurrency, row-level security, and database privileges against disposable PostgreSQL.
