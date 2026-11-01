-- Comments on spend requests (off-chain, members only; GET/POST /api/pots/[pot]/requests/[id]/comments). New table only:
-- additive, no backfill. A delete is soft (deleted_at set, body wiped to ''), enforced by request_comment_body_ck.
CREATE TABLE "request_comment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"request_id" bigint NOT NULL,
	"author_account" text NOT NULL,
	"body" text NOT NULL,
	"client_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "request_comment_body_ck" CHECK (("request_comment"."deleted_at" is null and char_length("request_comment"."body") between 1 and 280) or ("request_comment"."deleted_at" is not null and "request_comment"."body" = ''))
);
--> statement-breakpoint
ALTER TABLE "request_comment" ADD CONSTRAINT "request_comment_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_comment_thread_idx" ON "request_comment" USING btree ("pot_id","request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "request_comment_client_key_uq" ON "request_comment" USING btree ("author_account","client_key") WHERE "request_comment"."client_key" is not null;