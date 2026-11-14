ALTER TABLE `workout_exercise` ADD `effort` text;--> statement-breakpoint
ALTER TABLE `workout_exercise` ADD `effort_rir` integer;--> statement-breakpoint
ALTER TABLE `training_settings` ADD `exercise_check_in` integer DEFAULT true NOT NULL;