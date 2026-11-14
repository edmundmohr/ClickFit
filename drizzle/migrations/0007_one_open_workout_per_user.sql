-- Altlasten vor dem Index bereinigen: Gab es (durch gleichzeitige Starts) mehrere offene Workouts
-- eines Nutzers, bleibt nur das zuletzt gestartete offen. Die älteren werden abgeschlossen – mit
-- dem Zeitpunkt ihres letzten abgehakten Satzes als Ende (ohne Sätze: dem Start). Nichts wird gelöscht.
UPDATE `workout_session`
SET
	`status` = 'completed',
	`finished_at` = COALESCE(
		(
			SELECT MAX(`workout_set`.`completed_at`)
			FROM `workout_set`
			INNER JOIN `workout_exercise` ON `workout_set`.`workout_exercise_id` = `workout_exercise`.`id`
			WHERE `workout_exercise`.`session_id` = `workout_session`.`id`
		),
		`started_at`
	),
	`updated_at` = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE `status` = 'in_progress'
	AND EXISTS (
		SELECT 1 FROM `workout_session` AS `newer`
		WHERE `newer`.`user_id` = `workout_session`.`user_id`
			AND `newer`.`status` = 'in_progress'
			AND (
				`newer`.`started_at` > `workout_session`.`started_at`
				OR (`newer`.`started_at` = `workout_session`.`started_at` AND `newer`.`id` > `workout_session`.`id`)
			)
	);--> statement-breakpoint
CREATE UNIQUE INDEX `workout_session_one_open_per_user_idx` ON `workout_session` (`user_id`) WHERE status = 'in_progress';
