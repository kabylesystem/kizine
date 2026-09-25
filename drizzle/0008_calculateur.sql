CREATE TABLE IF NOT EXISTS `commutes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`from_address` text,
	`to_address` text,
	`km` real NOT NULL,
	`mode` text NOT NULL,
	`trips_per_week` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `block_minutes` text;
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `body_fat_pct` real;
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `daily_life` text DEFAULT 'mixed' NOT NULL;
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `goal_kind` text DEFAULT 'bulkFast' NOT NULL
