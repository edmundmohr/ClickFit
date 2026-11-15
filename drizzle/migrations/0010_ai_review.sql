-- KI-Auswertung aller Daten: pro Nutzer die jüngste Auswertung, eine neue ersetzt die alte.
CREATE TABLE `ai_review` (
	`user_id` text PRIMARY KEY NOT NULL,
	`question` text,
	`content` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
