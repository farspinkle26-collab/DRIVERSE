-- Driveverse — sharing a trip into a direct message.
-- Additive and idempotent, like every other database_migration_* file here.
-- Safe to re-run.
--
-- `direct_messages` (database_migration_profile_v2.sql) has always been
-- plain `content text` — no `message_type`/`metadata`, unlike the older
-- roadside-assistance `chat_messages` table
-- (`chat_system_tables.sql`/`CHAT_SYSTEM_SETUP.md`), which already carries
-- both. This brings direct_messages the same shape, scoped to exactly one
-- new kind: a shared trip.
--
-- `metadata` denormalises what the bubble needs to render (trip id, name,
-- distance, duration) rather than joining `trips` at read time — the same
-- reasoning `saved_places` already uses for a bookmarked POI: the trip could
-- be deleted or turned private after the share, and the message should still
-- read sensibly rather than pointing at a hole. `content` still carries a
-- plain-text fallback ("Shared a trip: <name>") so the conversation list's
-- last-message preview and any client that does not know about `message_type`
-- degrade to readable text instead of blank.
--
-- Whether the receiver can actually open the trip afterward is unrelated to
-- this table and unchanged by it: `trips` RLS already allows the owner OR any
-- `is_public = true` row (database_migration_trips_privacy.sql). A shared
-- *private* trip's card still renders in the chat; tapping it hits the same
-- "Trip not found" a stale/deleted link would, which is an existing,
-- reasonable degrade rather than a new failure mode.

alter table public.direct_messages
  add column if not exists message_type text not null default 'text';

alter table public.direct_messages
  drop constraint if exists direct_messages_message_type_check;

alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'trip'));

alter table public.direct_messages
  add column if not exists metadata jsonb;

-- ── verification ────────────────────────────────────────────────────────────
--
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'direct_messages'
--     and column_name in ('message_type', 'metadata');
--
-- should list both, and every existing row should read message_type = 'text'.
