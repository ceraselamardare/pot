CREATE TABLE "alert_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"auth_sub" text,
	"near_account" text NOT NULL,
	"mpc_public_key" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_hash" text,
	"display_name" text NOT NULL,
	"avatar_tint" text NOT NULL,
	"notify_email" boolean DEFAULT true NOT NULL,
	"persona" text,
	"onboard_state" text DEFAULT 'ready' NOT NULL,
	"onboard_lease_until" timestamp with time zone,
	"usdc_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_sub_ck" CHECK (("app_user"."kind" = 'near-auth') = ("app_user"."auth_sub" is not null)),
	CONSTRAINT "app_user_name_ck" CHECK (char_length("app_user"."display_name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "demo_pot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"pot_id" text,
	"personas" jsonb NOT NULL,
	"state" text NOT NULL,
	"seed_step" smallint DEFAULT 0 NOT NULL,
	"seed_error" text,
	"leased_to" text,
	"leased_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"seeded_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pot_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"mode" text NOT NULL,
	"chain" text NOT NULL,
	"recipient" text NOT NULL,
	"amount_in" numeric(40, 0) NOT NULL,
	"min_amount_in" numeric(40, 0),
	"amount_out_quoted" numeric(40, 0),
	"deposit_address" text NOT NULL,
	"deposit_memo" text,
	"correlation_id" text,
	"quote_signature" text,
	"quote" jsonb NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"last_status" jsonb,
	"deposited_amount" numeric(40, 0),
	"amount_out" numeric(40, 0),
	"refunded_amount" numeric(40, 0),
	"refund_reason" text,
	"destination_tx_hash" text,
	"processing_since" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"workflow_run_id" text,
	"sim_scenario" text,
	"sim_started_at" timestamp with time zone,
	"added_relay_id" text,
	"added_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"key_kind" text NOT NULL,
	"status" text NOT NULL,
	"added_via" text,
	"add_key_tx_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "device_pairing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"relay_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" text,
	"route" text NOT NULL,
	"reason" text,
	"user_id" uuid,
	"relay_id" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "feed_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"actor" text,
	"subject" text,
	"amount" numeric(40, 0),
	"proposal_id" bigint,
	"request_ref" text,
	"category" text,
	"path" text,
	"status" text,
	"tx_hash" text,
	"receipt_id" text NOT NULL,
	"event_index" smallint NOT NULL,
	"block_height" bigint,
	"at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_meta" (
	"pot_id" text NOT NULL,
	"invite_pk" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at_ms" bigint,
	"max_uses" integer,
	"created_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invite_meta_pot_id_invite_pk_pk" PRIMARY KEY("pot_id","invite_pk")
);
--> statement-breakpoint
CREATE TABLE "lease" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text,
	"until" timestamp with time zone,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "note" (
	"pot_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"author_account" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_at" timestamp with time zone,
	CONSTRAINT "note_pot_id_kind_ref_author_account_pk" PRIMARY KEY("pot_id","kind","ref","author_account"),
	CONSTRAINT "note_text_len_ck" CHECK (char_length("note"."text") between 1 and 140)
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"event_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_log_event_key_user_id_channel_pk" PRIMARY KEY("event_key","user_id","channel")
);
--> statement-breakpoint
CREATE TABLE "pot" (
	"dao_id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"hub_id" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"gradient" text,
	"preset" text NOT NULL,
	"creator_account" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_tx_hash" text,
	"last_proposal_id" bigint,
	"last_synced_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"expiration_time" timestamp with time zone,
	"standalone" boolean DEFAULT false NOT NULL,
	"platform" text,
	"demo_pot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone,
	"fail_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quota_usage" (
	"subject" text NOT NULL,
	"action" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"n" numeric(40, 0) DEFAULT '0' NOT NULL,
	CONSTRAINT "quota_usage_subject_action_period_start_pk" PRIMARY KEY("subject","action","period_start")
);
--> statement-breakpoint
CREATE TABLE "relay_log" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"user_id" uuid,
	"visitor_hash" text,
	"idempotency_key" text,
	"body_hash" text,
	"op" text NOT NULL,
	"intent" text,
	"sender_id" text,
	"receiver_id" text NOT NULL,
	"methods" text[],
	"pot_id" text,
	"delegate_hash" text,
	"delegate_public_key" text,
	"delegate_nonce" numeric(20, 0),
	"max_block_height" bigint,
	"relayer_key" text,
	"outer_tx_hash" text,
	"status" text NOT NULL,
	"outcome" text,
	"reason" text,
	"error_code" text,
	"error_text" text,
	"result" jsonb,
	"events" jsonb,
	"response" jsonb,
	"http_status" smallint,
	"executed_at_block" bigint,
	"est_yocto" numeric(40, 0),
	"cost_yocto" numeric(40, 0),
	"gas_burnt" numeric(20, 0),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"device_id" uuid,
	"demo_pot_id" uuid,
	"visitor_hash" text,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telegram_chat" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"pot_id" text NOT NULL,
	"linked_by_user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_post" (
	"pot_id" text NOT NULL,
	"proposal_id" bigint NOT NULL,
	"chat_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	CONSTRAINT "telegram_post_pot_id_proposal_id_chat_id_pk" PRIMARY KEY("pot_id","proposal_id","chat_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_user" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tg_user_id" bigint NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_user_tg_user_id_unique" UNIQUE("tg_user_id")
);
--> statement-breakpoint
CREATE TABLE "tg_link_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"pot_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "used_proof" (
	"hash" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deposit_intent" ADD CONSTRAINT "deposit_intent_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_intent" ADD CONSTRAINT "deposit_intent_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairing" ADD CONSTRAINT "device_pairing_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairing" ADD CONSTRAINT "device_pairing_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_event" ADD CONSTRAINT "feed_event_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_meta" ADD CONSTRAINT "invite_meta_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_demo_pot_id_demo_pot_id_fk" FOREIGN KEY ("demo_pot_id") REFERENCES "public"."demo_pot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_log" ADD CONSTRAINT "relay_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_demo_pot_id_demo_pot_id_fk" FOREIGN KEY ("demo_pot_id") REFERENCES "public"."demo_pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chat" ADD CONSTRAINT "telegram_chat_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chat" ADD CONSTRAINT "telegram_chat_linked_by_user_id_app_user_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_post" ADD CONSTRAINT "telegram_post_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user" ADD CONSTRAINT "telegram_user_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tg_link_token" ADD CONSTRAINT "tg_link_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tg_link_token" ADD CONSTRAINT "tg_link_token_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_auth_sub_uq" ON "app_user" USING btree ("auth_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_near_account_uq" ON "app_user" USING btree ("near_account");--> statement-breakpoint
CREATE INDEX "app_user_email_hash_idx" ON "app_user" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_pot_slug_uq" ON "demo_pot" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "demo_pot_lease_idx" ON "demo_pot" USING btree ("kind","state","seeded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_intent_address_uq" ON "deposit_intent" USING btree ("deposit_address");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_intent_user_key_uq" ON "deposit_intent" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "deposit_intent_open_idx" ON "deposit_intent" USING btree ("status") WHERE "deposit_intent"."status" in ('PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'INCOMPLETE_DEPOSIT');--> statement-breakpoint
CREATE UNIQUE INDEX "device_public_key_uq" ON "device" USING btree ("public_key");--> statement-breakpoint
CREATE INDEX "device_user_idx" ON "device" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "device_pairing_user_idx" ON "device_pairing" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "error_log_at_idx" ON "error_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_event_receipt_uq" ON "feed_event" USING btree ("receipt_id","event_index");--> statement-breakpoint
CREATE INDEX "feed_event_pot_at_idx" ON "feed_event" USING btree ("pot_id","at");--> statement-breakpoint
CREATE INDEX "notification_log_created_idx" ON "notification_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pot_hub_slug_uq" ON "pot" USING btree ("hub_id","slug");--> statement-breakpoint
CREATE INDEX "pot_status_activity_idx" ON "pot" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_uq" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_user_idx" ON "push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relay_log_user_key_uq" ON "relay_log" USING btree ("user_id","idempotency_key") WHERE "relay_log"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "relay_log_server_key_uq" ON "relay_log" USING btree ("op","idempotency_key") WHERE "relay_log"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "relay_log_delegate_uq" ON "relay_log" USING btree ("delegate_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "relay_log_tx_uq" ON "relay_log" USING btree ("outer_tx_hash");--> statement-breakpoint
CREATE INDEX "relay_log_inflight_idx" ON "relay_log" USING btree ("sender_id","delegate_public_key") WHERE "relay_log"."status" in ('validated', 'signed', 'submitted', 'pending');--> statement-breakpoint
CREATE INDEX "relay_log_pot_idx" ON "relay_log" USING btree ("pot_id","created_at");--> statement-breakpoint
CREATE INDEX "relay_log_user_idx" ON "relay_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "relay_log_created_idx" ON "relay_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "telegram_chat_pot_idx" ON "telegram_chat" USING btree ("pot_id");--> statement-breakpoint
CREATE INDEX "used_proof_used_at_idx" ON "used_proof" USING btree ("used_at");