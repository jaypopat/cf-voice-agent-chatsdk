CREATE TABLE `memory` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`extracted` text,
	`channel` text NOT NULL,
	`created_at` integer NOT NULL,
	`embedded` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_id_unique` ON `memory` (`id`);