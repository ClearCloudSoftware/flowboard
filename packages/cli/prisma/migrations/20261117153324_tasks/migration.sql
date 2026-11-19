-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "acceptance_criteria" JSONB NOT NULL,
    "non_goals" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'backlog',
    "import_key" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "backlog_imports" (
    "run" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "text" TEXT,
    "state" TEXT NOT NULL DEFAULT 'running',
    "result" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_import_key_key" ON "tasks"("project_id", "import_key");
