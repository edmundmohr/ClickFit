CREATE TABLE `body_measurement` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`site` text NOT NULL,
	`value_cm` real NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `site`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dashboard_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`widgets` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `progress_photo` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`r2_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`note` text,
	`session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `workout_session`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `progress_photo_user_date_idx` ON `progress_photo` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `recovery_override` (
	`user_id` text NOT NULL,
	`muscle` text NOT NULL,
	`percent` integer NOT NULL,
	`set_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `muscle`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
