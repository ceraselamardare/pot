-- Gifts (notes/gifts-plan.md, hub 1.2.0): gift links (server-enforced, never on chain), the gifts our server started
-- (keyed by the ref the giver's ft_transfer_call carries) and the public gift page. New tables only: additive, no backfill.
-- feed_event.kind gains 'gift_received' (a text column: no DDL).
CREATE TABLE "gift" (
	"ref" text PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"link_id" text,
	"giver_account" text NOT NULL,
	"giver_user_id" uuid,
	"display_name" text,
	"note" text,
	"show_public" boolean DEFAULT false NOT NULL,
	"amount" numeric(40, 0) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"client_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	CONSTRAINT "gift_ref_ck" CHECK ("gift"."ref" ~ '^g[0-9a-hjkmnp-tv-z]{23}$'),
	CONSTRAINT "gift_status_ck" CHECK ("gift"."status" in ('pending', 'received', 'failed')),
	CONSTRAINT "gift_name_ck" CHECK ("gift"."display_name" is null or char_length("gift"."display_name") between 1 and 40),
	CONSTRAINT "gift_note_ck" CHECK ("gift"."note" is null or char_length("gift"."note") between 1 and 140),
	CONSTRAINT "gift_amount_ck" CHECK ("gift"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "gift_link" (
	"id" text PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"created_by" text NOT NULL,
	"amount" numeric(40, 0),
	"note" text,
	"reusable" boolean DEFAULT true NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"client_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_link_id_ck" CHECK ("gift_link"."id" ~ '^[A-Za-z0-9_-]{22}$'),
	CONSTRAINT "gift_link_note_ck" CHECK ("gift_link"."note" is null or char_length("gift_link"."note") between 1 and 140),
	CONSTRAINT "gift_link_amount_ck" CHECK ("gift_link"."amount" is null or "gift_link"."amount" > 0),
	CONSTRAINT "gift_link_uses_ck" CHECK ("gift_link"."uses" >= 0)
);
--> statement-breakpoint
CREATE TABLE "gift_page" (
	"pot_id" text PRIMARY KEY NOT NULL,
	"on" boolean DEFAULT false NOT NULL,
	"line" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_page_line_ck" CHECK ("gift_page"."line" is null or char_length("gift_page"."line") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_link_id_gift_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."gift_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_giver_user_id_app_user_id_fk" FOREIGN KEY ("giver_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_link" ADD CONSTRAINT "gift_link_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_page" ADD CONSTRAINT "gift_page_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_pot_status_idx" ON "gift" USING btree ("pot_id","status","created_at");--> statement-breakpoint
CREATE INDEX "gift_giver_idx" ON "gift" USING btree ("giver_account","created_at");--> statement-breakpoint
CREATE INDEX "gift_link_idx" ON "gift" USING btree ("link_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_client_key_uq" ON "gift" USING btree ("giver_account","client_key") WHERE "gift"."client_key" is not null;--> statement-breakpoint
CREATE INDEX "gift_link_pot_idx" ON "gift_link" USING btree ("pot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_link_client_key_uq" ON "gift_link" USING btree ("created_by","client_key") WHERE "gift_link"."client_key" is not null;