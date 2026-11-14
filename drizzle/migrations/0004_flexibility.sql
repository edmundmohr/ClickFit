CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`distance_meters` real,
	`avg_heart_rate` integer,
	`zone` integer,
	`intensity` text DEFAULT 'moderate' NOT NULL,
	`intervals` text,
	`note` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`ended_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_user_date_idx` ON `activity` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `cardio_plan_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`type` text NOT NULL,
	`minutes` integer NOT NULL,
	`zone` integer,
	`intervals` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cardio_plan_entry_user_id_idx` ON `cardio_plan_entry` (`user_id`);--> statement-breakpoint
CREATE TABLE `custom_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`mechanic` text NOT NULL,
	`pattern` text NOT NULL,
	`primary` text NOT NULL,
	`secondary` text NOT NULL,
	`equipment` text NOT NULL,
	`note` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_exercise_user_id_idx` ON `custom_exercise` (`user_id`);--> statement-breakpoint
CREATE TABLE `exercise_preference` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`swapped_out` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `exercise_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mobility_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`date` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mobility_log_user_date_idx` ON `mobility_log` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `training_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`recovery_mode` integer DEFAULT false NOT NULL,
	`grip_module` integer DEFAULT false NOT NULL,
	`vacation` text,
	`cycle` text,
	`extra_sports` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `gym_profile` ADD `plate_unit` text;--> statement-breakpoint
ALTER TABLE `gym_profile` ADD `bar_weight` real;--> statement-breakpoint
ALTER TABLE `gym_profile` ADD `plates` text;--> statement-breakpoint
ALTER TABLE `gym_profile` ADD `weight_rules` text;--> statement-breakpoint
ALTER TABLE `plan_day` ADD `name` text;--> statement-breakpoint
ALTER TABLE `plan_exercise` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `training_plan` ADD `name` text;--> statement-breakpoint
ALTER TABLE `workout_exercise` ADD `group_id` text;--> statement-breakpoint
ALTER TABLE `workout_session` ADD `name` text;--> statement-breakpoint
ALTER TABLE `workout_session` ADD `gym_profile_id` text REFERENCES gym_profile(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `workout_session` ADD `is_short` integer DEFAULT false NOT NULL;