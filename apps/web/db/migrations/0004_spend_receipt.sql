-- Receipt details saved with a spend (never the photo, D-61; POST/GET /api/pots/[pot]/requests/[id]/receipt). New table
-- only: additive, no backfill. One row per (Pot, hub request id), written once by the requester; `fingerprint` is the
-- SHA-256 of the canonical JSON, whose first 16 hex chars the request carries in its request_ref.
CREATE TABLE "spend_receipt" (
	"pot_id" text NOT NULL,
	"request_id" bigint NOT NULL,
	"requester_account" text NOT NULL,
	"data" jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_receipt_pot_id_request_id_pk" PRIMARY KEY("pot_id","request_id"),
	CONSTRAINT "spend_receipt_fingerprint_ck" CHECK ("spend_receipt"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "spend_receipt_size_ck" CHECK (octet_length("spend_receipt"."data"::text) <= 20000)
);
--> statement-breakpoint
ALTER TABLE "spend_receipt" ADD CONSTRAINT "spend_receipt_pot_id_pot_dao_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("dao_id") ON DELETE no action ON UPDATE no action;