-- Add pending_username column to accounts.
-- When a non-admin player requests a rename, the new name goes here instead
-- of replacing username. An admin reviews and either approves (applies the
-- rename and clears this column) or denies (just clears this column).
-- Admins renaming someone else still update username directly and bypass
-- the queue entirely — this column only exists for self-service requests.
BEGIN;
ALTER TABLE asl.accounts ADD COLUMN IF NOT EXISTS pending_username text;
COMMIT;
