-- "Help us make Pot better" (first-run onboarding, 2026-11-02): one optional survey row per person (enum answers,
-- versioned; lib/survey.ts), read by the Pot team only (scripts/survey-report.ts). New table: additive, no backfill.
CREATE TABLE "user_survey" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" smallint NOT NULL,
	"answers" jsonb NOT NULL,
	"context" text,
	"app_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_survey_version_ck" CHECK ("user_survey"."version" between 1 and 100),
	CONSTRAINT "user_survey_context_ck" CHECK ("user_survey"."context" is null or "user_survey"."context" in ('created', 'joined', 'other')),
	CONSTRAINT "user_survey_answers_ck" CHECK (jsonb_typeof("user_survey"."answers") = 'object' and octet_length("user_survey"."answers"::text) <= 2000),
	CONSTRAINT "user_survey_app_version_ck" CHECK ("user_survey"."app_version" is null or char_length("user_survey"."app_version") <= 40)
);
--> statement-breakpoint
ALTER TABLE "user_survey" ADD CONSTRAINT "user_survey_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;