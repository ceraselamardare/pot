-- APP-9 (security audit 2026-11-04): one in-flight delegate per (sender, key, nonce). Older in-flight duplicates of the
-- same nonce (a lost broadcast re-signed with the same nonce) can never execute any more: mark them lost first, as the
-- reconcile pass would, so the unique index can be built on any existing data. Only the newest row per nonce stays.
UPDATE "relay_log" SET "status" = 'failed', "reason" = 'expired', "error_text" = 'lost_broadcast', "finished_at" = now()
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "sender_id", "delegate_public_key", "delegate_nonce" ORDER BY "created_at" DESC, "id" DESC) AS "rn"
    FROM "relay_log"
    WHERE "status" in ('validated', 'signed', 'submitted', 'pending') AND "delegate_nonce" IS NOT NULL
  ) "d" WHERE "d"."rn" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "relay_log_inflight_nonce_uq" ON "relay_log" USING btree ("sender_id","delegate_public_key","delegate_nonce") WHERE "relay_log"."status" in ('validated', 'signed', 'submitted', 'pending') and "relay_log"."delegate_nonce" is not null;
