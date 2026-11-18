CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`state` text NOT NULL,
	`created` integer DEFAULT 0 NOT NULL,
	`updated` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `imports_by_project` ON `imports` (`project_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`import_key` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`labels` text DEFAULT '[]' NOT NULL,
	`assignees` text DEFAULT '[]' NOT NULL,
	`extras` text DEFAULT '{}' NOT NULL,
	`acceptance` text DEFAULT '[]' NOT NULL,
	`non_goals` text DEFAULT '[]' NOT NULL,
	`hint` text NOT NULL,
	`imported_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `source_id`, `import_key`)
);
--> statement-breakpoint
CREATE INDEX `tasks_by_project_updated` ON `tasks` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `tasks_by_source` ON `tasks` (`project_id`,`source_id`);