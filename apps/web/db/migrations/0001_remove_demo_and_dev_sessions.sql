-- Rev 9 (2026-11-01, plan/decisions.md): the live persona demo (/demo/live, server-held persona keys, the demo Pot
-- pool) and the test-account sign-in ("dev" sessions) are removed. Sign-in is NEAR Auth or a NEAR wallet only.
-- Order matters: purge the rows of the removed kinds first (relay_log, telegram_chat and deposit_intent reference
-- app_user without a cascade), then drop the demo FKs before the table, then the columns, then the new CHECKs.
DELETE FROM "session" WHERE "kind" IN ('demo', 'dev');--> statement-breakpoint
UPDATE "relay_log" SET "user_id" = NULL WHERE "user_id" IN (SELECT "id" FROM "app_user" WHERE "kind" IN ('demo', 'dev'));--> statement-breakpoint
UPDATE "telegram_chat" SET "linked_by_user_id" = NULL WHERE "linked_by_user_id" IN (SELECT "id" FROM "app_user" WHERE "kind" IN ('demo', 'dev'));--> statement-breakpoint
DELETE FROM "deposit_intent" WHERE "user_id" IN (SELECT "id" FROM "app_user" WHERE "kind" IN ('demo', 'dev'));--> statement-breakpoint
DELETE FROM "app_user" WHERE "kind" IN ('demo', 'dev');--> statement-breakpoint
DELETE FROM "used_proof" WHERE "purpose" = 'dev_session';--> statement-breakpoint
DELETE FROM "relay_log" WHERE "op" = 'demo_seed';--> statement-breakpoint
ALTER TABLE "push_subscription" DROP CONSTRAINT "push_subscription_demo_pot_id_demo_pot_id_fk";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_demo_pot_id_demo_pot_id_fk";--> statement-breakpoint
DROP TABLE "demo_pot";--> statement-breakpoint
ALTER TABLE "app_user" DROP COLUMN "persona";--> statement-breakpoint
ALTER TABLE "pot" DROP COLUMN "is_demo";--> statement-breakpoint
ALTER TABLE "push_subscription" DROP COLUMN "demo_pot_id";--> statement-breakpoint
ALTER TABLE "relay_log" DROP COLUMN "visitor_hash";--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "demo_pot_id";--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "visitor_hash";--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_kind_ck" CHECK ("app_user"."kind" in ('near-auth', 'wallet'));--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_kind_ck" CHECK ("session"."kind" in ('near-auth', 'wallet'));
