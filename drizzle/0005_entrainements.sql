CREATE TABLE IF NOT EXISTS `training_sessions` (
	`user_id` text NOT NULL,
	`sport_id` text NOT NULL,
	`per_week` integer NOT NULL,
	`minutes` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `sport_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `age_years` integer;
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `non_exercise_factor` real DEFAULT 1.35 NOT NULL;
