CREATE TABLE IF NOT EXISTS `pantry_declarations` (
	`user_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`state` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `concept_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
