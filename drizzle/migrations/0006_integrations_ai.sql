CREATE TABLE `ai_consent` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `api_token` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_hash_idx` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_token_user_id_idx` ON `api_token` (`user_id`);--> statement-breakpoint
CREATE TABLE `body_fat_estimate` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`date` text NOT NULL,
	`low_percent` real NOT NULL,
	`high_percent` real NOT NULL,
	`note` text,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`photo_id`) REFERENCES `progress_photo`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_fat_estimate_user_date_idx` ON `body_fat_estimate` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `health_metric` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `type`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activity` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `activity_user_external_idx` ON `activity` (`user_id`,`external_id`);