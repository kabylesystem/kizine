CREATE TABLE `free_dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`title` text NOT NULL,
	`total_g` real NOT NULL,
	`portions` integer NOT NULL,
	`portion_g` real NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carb_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`fiber_g` real NOT NULL,
	`ingredients` text NOT NULL,
	`stock_taken` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `free_user_idx` ON `free_dishes` (`user_id`);
