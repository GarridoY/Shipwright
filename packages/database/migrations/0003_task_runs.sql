ALTER TABLE "tasks" ADD COLUMN "agent_definition_id" uuid;
ALTER TABLE "tasks" ADD COLUMN "runtime" text;
-- Preserve legacy tasks when no agent definition exists. Null marks tasks that
-- need a definition selected before they can be launched.
UPDATE "tasks" SET "agent_definition_id" = (SELECT "id" FROM "agent_definitions" ORDER BY "created_at" LIMIT 1), "runtime" = (SELECT "runtime" FROM "agent_definitions" ORDER BY "created_at" LIMIT 1)
WHERE EXISTS (SELECT 1 FROM "agent_definitions");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_definition_id_agent_definitions_id_fk" FOREIGN KEY ("agent_definition_id") REFERENCES "agent_definitions"("id");
ALTER TABLE "agent_runs" ADD COLUMN "runtime" text;
UPDATE "agent_runs" SET "runtime" = (SELECT "runtime" FROM "agent_definitions" WHERE "agent_definitions"."id" = "agent_runs"."agent_definition_id");
ALTER TABLE "agent_runs" ALTER COLUMN "runtime" SET NOT NULL;
CREATE UNIQUE INDEX "agent_runs_one_active_per_task_uidx" ON "agent_runs" ("task_id") WHERE "status" in ('queued', 'starting', 'running', 'waiting_approval', 'waiting_input');
