CREATE TABLE `exercise_note` (
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`note` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `exercise_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `gym_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`equipment` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_profile_user_id_idx` ON `gym_profile` (`user_id`);--> statement-breakpoint
CREATE TABLE `plan_day` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`position` integer NOT NULL,
	`focus` text NOT NULL,
	`weekday` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plan`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_day_plan_id_idx` ON `plan_day` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_day_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`sets` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`target_rir` integer NOT NULL,
	`rest_seconds` integer NOT NULL,
	FOREIGN KEY (`plan_day_id`) REFERENCES `plan_day`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_exercise_plan_day_id_idx` ON `plan_exercise` (`plan_day_id`);--> statement-breakpoint
CREATE TABLE `training_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`split` text NOT NULL,
	`source` text DEFAULT 'generated' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`gym_profile_id` text,
	`start_date` text NOT NULL,
	`deload_every_weeks` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gym_profile_id`) REFERENCES `gym_profile`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `training_plan_user_status_idx` ON `training_plan` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `user_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goal` text NOT NULL,
	`experience` text NOT NULL,
	`weekdays` text NOT NULL,
	`session_minutes` integer NOT NULL,
	`cardio` text NOT NULL,
	`sex` text NOT NULL,
	`birth_year` integer NOT NULL,
	`height_cm` real NOT NULL,
	`weight_kg` real NOT NULL,
	`activity_level` text NOT NULL,
	`injuries` text NOT NULL,
	`injury_note` text,
	`excluded_exercise_ids` text NOT NULL,
	`completed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workout_exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`target_rir` integer NOT NULL,
	`rest_seconds` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_exercise_session_id_idx` ON `workout_exercise` (`session_id`);--> statement-breakpoint
CREATE INDEX `workout_exercise_user_exercise_idx` ON `workout_exercise` (`user_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `workout_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_id` text,
	`plan_day_id` text,
	`focus` text,
	`date` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`is_deload` integer DEFAULT false NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plan`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_day_id`) REFERENCES `plan_day`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workout_session_user_date_idx` ON `workout_session` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `workout_session_user_status_idx` ON `workout_session` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `workout_set` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text DEFAULT 'work' NOT NULL,
	`target_weight_kg` real,
	`target_reps` integer,
	`weight_kg` real,
	`reps` integer,
	`rir` integer,
	`duration_seconds` integer,
	`distance_meters` real,
	`note` text,
	`completed_at` integer,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_set_workout_exercise_id_idx` ON `workout_set` (`workout_exercise_id`);