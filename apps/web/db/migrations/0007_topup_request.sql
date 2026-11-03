-- "Ask for a top-up" (2026-11-03): a member asks everyone in a Pot to add more money (topup_request; one open ask
-- per Pot) and members nudge people who haven't added (nudge; once per person per 24 h). Off-chain only; new tables,
-- additive, no backfill.
CREATE TABLE "nudge" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"topup_id" bigint,
	"sender_account" text NOT NULL,
	"target_account" text NOT NULL,
	"client_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nudge_self_ck" CHECK ("nudge"."sender_account" <> "nudge"."target_account")
);
--> statement-breakpoint
CREATE TABLE "topup_request" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"created_by" text NOT NULL,
	"mode" text NOT NULL,
	"per_person" numeric(40, 0) NOT NULL,
	"total" numeric(40, 0) NOT NULL,
	"reason" text,
	"due_at" timestamp with time zone NOT NULL,
	"baselines" jsonb NOT NULL,
	"progress" jsonb,
	"closed_at" timestamp with time zone,
	"close_cause" text,
	"cancelled_at" timestamp with time zone,
	"reminder_at" timestamp with time zone,
	"client_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topup_request_mode_ck" CHECK ("topup_request"."mode" in ('each', 'total')),
	CONSTRAINT "topup_request_amount_ck" CHECK ("topup_request"."per_person" > 0 and "topup_request"."total" >= "topup_request"."per_person"),
	CONSTRAINT "topup_request_reason_ck" CHECK ("topup_request"."reason" is null or char_length("topup_request"."reason") between 1 and 80),
	CONSTRAINT "topup_request_close_ck" CHECK (("topup_request"."closed_at" is null) = ("topup_request"."close_cause" is null) and ("topup_request"."close_cause" is null or "topup_request"."close_cause" in ('done', 'due'))),
	CONSTRAINT "topup_request_end_ck" CHECK ("topup_request"."closed_at" is null or "topup_request"."cancelled_at" is null),
	CONSTRAINT "topup_request_baselines_ck" CHECK (jsonb_typeof("topup_request"."baselines") = 'array'),
	CONSTRAINT "topup_request_progress_ck" CHECK ("topup_request"."progress" is null or jsonb_typeof("topup_request"."progress") = 'object')
);
--> statement-breakpoint
ALTER TABLE "nudge" ADD CONSTRAINT "nudge_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge" ADD CONSTRAINT "nudge_topup_id_topup_request_id_fk" FOREIGN KEY ("topup_id") REFERENCES "public"."topup_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topup_request" ADD CONSTRAINT "topup_request_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nudge_target_idx" ON "nudge" USING btree ("pot_id","target_account","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "nudge_client_key_uq" ON "nudge" USING btree ("sender_account","client_key","target_account") WHERE "nudge"."client_key" is not null;--> statement-breakpoint
CREATE INDEX "topup_request_pot_idx" ON "topup_request" USING btree ("pot_id","created_at");--> statement-breakpoint
CREATE INDEX "topup_request_by_idx" ON "topup_request" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "topup_request_open_uq" ON "topup_request" USING btree ("pot_id") WHERE "topup_request"."closed_at" is null and "topup_request"."cancelled_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "topup_request_client_key_uq" ON "topup_request" USING btree ("created_by","client_key") WHERE "topup_request"."client_key" is not null;