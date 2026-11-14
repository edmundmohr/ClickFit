CREATE TABLE `body_weight_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_weight_entry_user_date_idx` ON `body_weight_entry` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `food` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`owner_id` text,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`basis` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`serving_size` real,
	`serving_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `food_owner_id_idx` ON `food` (`owner_id`);--> statement-breakpoint
CREATE INDEX `food_barcode_idx` ON `food` (`barcode`);--> statement-breakpoint
CREATE INDEX `food_name_idx` ON `food` (`name`);--> statement-breakpoint
CREATE TABLE `food_log_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	`food_ref` text NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`amount_unit` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `food_log_entry_user_date_idx` ON `food_log_entry` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `food_log_entry_user_ref_idx` ON `food_log_entry` (`user_id`,`food_ref`);--> statement-breakpoint
CREATE TABLE `meal_plan_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`meal` text NOT NULL,
	`food_ref` text NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`amount_unit` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meal_plan_entry_user_weekday_idx` ON `meal_plan_entry` (`user_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `nutrition_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`water_goal_ml` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `nutrition_target` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`start_date` text NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`carbs_g` integer NOT NULL,
	`fat_g` integer NOT NULL,
	`source` text NOT NULL,
	`tdee_kcal` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nutrition_target_user_date_idx` ON `nutrition_target` (`user_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_user_id_idx` ON `recipe` (`user_id`);--> statement-breakpoint
CREATE TABLE `recipe_ingredient` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`food_ref` text NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`amount_unit` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_ingredient_recipe_id_idx` ON `recipe_ingredient` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `supplement` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`dose` text,
	`timing` text DEFAULT 'any' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplement_user_id_idx` ON `supplement` (`user_id`);--> statement-breakpoint
CREATE TABLE `supplement_log` (
	`supplement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`taken_at` integer NOT NULL,
	PRIMARY KEY(`supplement_id`, `date`),
	FOREIGN KEY (`supplement_id`) REFERENCES `supplement`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `supplement_log_user_date_idx` ON `supplement_log` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `water_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`amount_ml` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `water_log_user_date_idx` ON `water_log` (`user_id`,`date`);