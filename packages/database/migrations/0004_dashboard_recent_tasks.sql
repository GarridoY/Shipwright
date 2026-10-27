CREATE INDEX "tasks_created_at_id_idx" ON "tasks" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
