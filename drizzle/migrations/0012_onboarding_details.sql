ALTER TABLE `user_profile` ADD `body_fat_percent` real;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `training_months` integer;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `trained_recently` integer;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `self_assessment` text;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `focus_muscles` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `work_postures` text DEFAULT '[]' NOT NULL;