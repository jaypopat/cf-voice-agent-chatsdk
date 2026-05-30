CREATE TABLE `google_token` (
	`id` integer PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_action` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`type` text NOT NULL,
	`params` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`external_ref` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminder` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`fire_at` integer NOT NULL,
	`schedule_id` text,
	`status` text DEFAULT 'scheduled' NOT NULL
);
