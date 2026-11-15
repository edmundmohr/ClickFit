-- Zielgewicht pro Übung in Routinen und Verlauf seiner Änderungen.
CREATE TABLE `target_weight_change` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`plan_day_id` text,
	`routine_name` text,
	`from_kg` real,
	`to_kg` real,
	`date` text NOT NULL,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_day_id`) REFERENCES `plan_day`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `target_weight_change_user_exercise_idx` ON `target_weight_change` (`user_id`,`exercise_id`);--> statement-breakpoint
ALTER TABLE `plan_exercise` ADD `target_weight_kg` real;--> statement-breakpoint
ALTER TABLE `plan_exercise` ADD `target_weight_set_at` integer;