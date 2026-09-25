CREATE TABLE `day_overrides` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`context` text NOT NULL,
	`cook_minutes_evening` integer,
	`meal_slots` text,
	`note` text,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `day_profiles` (
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`label` text NOT NULL,
	`context` text NOT NULL,
	`cook_minutes_evening` integer NOT NULL,
	`cook_minutes_midday` integer NOT NULL,
	`meal_slots` text NOT NULL,
	`training_time` text,
	`notes` text,
	PRIMARY KEY(`user_id`, `weekday`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`start_kg` real NOT NULL,
	`target_kg` real NOT NULL,
	`target_gain_kg_per_week` real NOT NULL,
	`training_days_per_week` integer DEFAULT 7 NOT NULL,
	`aggressiveness` text DEFAULT 'aggressive' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `weight_logs` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`kg` real NOT NULL,
	`note` text,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `shopping_weekday` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `second_shopping_weekday` integer;--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `body_weight_kg` real;--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `height_cm` real;--> statement-breakpoint
ALTER TABLE `nutrition_profiles` ADD `protein_per_kg` real DEFAULT 2.1 NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `portable` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `good_cold` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `reheatable` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `kcal_density` real;