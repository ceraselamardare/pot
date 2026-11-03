-- "Pay in" (2026-11-03): a pay-in link (gift_link), the public page (gift_page) and each gift started through them
-- (gift) carry a tone, "payment" or "gift", that picks the words and presets people outside the Pot see. Off-chain
-- only (the hub's gift message is unchanged). Additive. Rows from before keep the words they had, so they're backfilled
-- with 'gift' (each column is added with DEFAULT 'gift', which fills existing rows, then the default becomes 'payment').
ALTER TABLE "gift" ADD COLUMN "tone" text DEFAULT 'gift' NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_link" ADD COLUMN "tone" text DEFAULT 'gift' NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_page" ADD COLUMN "tone" text DEFAULT 'gift' NOT NULL;--> statement-breakpoint
ALTER TABLE "gift" ALTER COLUMN "tone" SET DEFAULT 'payment';--> statement-breakpoint
ALTER TABLE "gift_link" ALTER COLUMN "tone" SET DEFAULT 'payment';--> statement-breakpoint
ALTER TABLE "gift_page" ALTER COLUMN "tone" SET DEFAULT 'payment';--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_tone_ck" CHECK ("gift"."tone" in ('payment', 'gift'));--> statement-breakpoint
ALTER TABLE "gift_link" ADD CONSTRAINT "gift_link_tone_ck" CHECK ("gift_link"."tone" in ('payment', 'gift'));--> statement-breakpoint
ALTER TABLE "gift_page" ADD CONSTRAINT "gift_page_tone_ck" CHECK ("gift_page"."tone" in ('payment', 'gift'));
