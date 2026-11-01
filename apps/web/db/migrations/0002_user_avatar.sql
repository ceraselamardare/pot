-- Brand avatars (brand/avatars/README.md): a person may pick one of ten pictures (pot-01..pot-10) in You → Profile
-- (PATCH /api/me). NULL keeps today's initials on the member colour. Additive and nullable: no backfill.
ALTER TABLE "app_user" ADD COLUMN "avatar" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_avatar_ck" CHECK ("app_user"."avatar" is null or "app_user"."avatar" ~ '^pot-(0[1-9]|10)$');