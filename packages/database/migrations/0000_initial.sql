CREATE TABLE IF NOT EXISTS "application_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
