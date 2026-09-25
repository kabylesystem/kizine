CREATE TABLE `cooking_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` text NOT NULL,
	`cooked` integer,
	`rating` integer,
	`would_repeat` integer,
	`effort` text,
	`portion` text,
	`note` text,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cuisine_preferences` (
	`user_id` text NOT NULL,
	`cuisine` text NOT NULL,
	`elo` real DEFAULT 1500 NOT NULL,
	`exposures` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `cuisine`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dish_ratings` (
	`user_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`elo` real DEFAULT 1500 NOT NULL,
	`duels` integer DEFAULT 0 NOT NULL,
	`stated` real,
	`revealed` real,
	`cooked_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `recipe_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `duel_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`left_id` text NOT NULL,
	`right_id` text NOT NULL,
	`winner_id` text NOT NULL,
	`ms` integer,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`present` integer DEFAULT false NOT NULL,
	`notes` text,
	PRIMARY KEY(`user_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fatigue_states` (
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`level` real DEFAULT 0 NOT NULL,
	`last_exposure_at` integer,
	`tau_days` real NOT NULL,
	PRIMARY KEY(`user_id`, `entity_type`, `entity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `food_concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`name_fr` text NOT NULL,
	`name_en` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text,
	`role` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`default_state` text DEFAULT 'raw' NOT NULL,
	`perishability_days` integer DEFAULT 30 NOT NULL,
	`perishability_open_days` integer,
	`freezable` integer DEFAULT false NOT NULL,
	`typical_package_g` real,
	`bought_by_weight` integer DEFAULT false NOT NULL,
	`aisle` text DEFAULT 'epicerie' NOT NULL,
	`swipeable` integer DEFAULT false NOT NULL,
	`image_id` text
);
--> statement-breakpoint
CREATE INDEX `fc_category_idx` ON `food_concepts` (`category`);--> statement-breakpoint
CREATE INDEX `fc_role_idx` ON `food_concepts` (`role`);--> statement-breakpoint
CREATE TABLE `food_densities` (
	`concept_id` text PRIMARY KEY NOT NULL,
	`g_per_ml` real NOT NULL,
	`g_per_tbsp` real,
	`g_per_tsp` real,
	`g_per_unit` real,
	`unit_label` text,
	`source` text DEFAULT 'manual' NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`state` text NOT NULL,
	`cooking_method` text,
	`label` text NOT NULL,
	`kcal_100` real NOT NULL,
	`protein_100` real NOT NULL,
	`carb_100` real NOT NULL,
	`sugar_100` real,
	`fat_100` real NOT NULL,
	`sat_fat_100` real,
	`fiber_100` real,
	`salt_100` real,
	`micros` text,
	`source` text NOT NULL,
	`source_ref` text,
	`confidence` text,
	`basis` text DEFAULT 'per_100g' NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `food_concept_idx` ON `foods` (`concept_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `food_concept_state_idx` ON `foods` (`concept_id`,`state`,`cooking_method`);--> statement-breakpoint
CREATE TABLE `grocery_list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`needed_g` real NOT NULL,
	`from_pantry_g` real DEFAULT 0 NOT NULL,
	`to_buy_g` real NOT NULL,
	`package_size_g` real,
	`packages` integer,
	`expected_leftover_g` real DEFAULT 0 NOT NULL,
	`est_unit_cents` integer,
	`aisle` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `grocery_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gli_list_idx` ON `grocery_list_items` (`list_id`);--> statement-breakpoint
CREATE TABLE `grocery_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`estimated_cents` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `image_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`width` integer,
	`height` integer,
	`source` text NOT NULL,
	`license` text,
	`attribution` text,
	`source_url` text,
	`dominant` text
);
--> statement-breakpoint
CREATE TABLE `ingredient_aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`concept_id` text NOT NULL,
	`raw_text` text NOT NULL,
	`normalized` text NOT NULL,
	`lang` text DEFAULT 'fr' NOT NULL,
	`origin` text DEFAULT 'seed' NOT NULL,
	`confidence` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alias_norm_idx` ON `ingredient_aliases` (`normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `alias_unique_idx` ON `ingredient_aliases` (`normalized`,`concept_id`);--> statement-breakpoint
CREATE TABLE `inventory_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`delta_g` real NOT NULL,
	`reason_ref` text,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`week_start` text NOT NULL,
	`seed` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`score` real,
	`score_breakdown` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_week_idx` ON `meal_plans` (`user_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `meal_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`label` text NOT NULL,
	`kcal_target` real NOT NULL,
	`protein_target` real NOT NULL,
	`max_minutes` integer NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `slot_plan_idx` ON `meal_slots` (`plan_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`recipe_instance_id` text NOT NULL,
	`state` text DEFAULT 'planned' NOT NULL,
	`explanation` text,
	`cooked_at` integer,
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_instance_id`) REFERENCES `recipe_instances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_slot_idx` ON `meals` (`slot_id`);--> statement-breakpoint
CREATE TABLE `nutrition_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kcal_target` real DEFAULT 3200 NOT NULL,
	`protein_target_g` real DEFAULT 170 NOT NULL,
	`fat_min_g` real DEFAULT 70 NOT NULL,
	`fiber_min_g` real DEFAULT 30 NOT NULL,
	`daily_tolerance_kcal` real DEFAULT 150 NOT NULL,
	`weekly_mode` integer DEFAULT true NOT NULL,
	`meal_structure` text NOT NULL,
	`weekly_budget_eur` real,
	`cook_minutes_weekday` integer DEFAULT 35 NOT NULL,
	`cook_minutes_weekend` integer DEFAULT 60 NOT NULL,
	`max_pans` integer DEFAULT 2 NOT NULL,
	`spice_tolerance` integer DEFAULT 2 NOT NULL,
	`leftover_tolerance` integer DEFAULT 1 NOT NULL,
	`bulk_buying_ok` integer DEFAULT true NOT NULL,
	`freezer_liters` real DEFAULT 60 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nutrition_sources` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`license` text NOT NULL,
	`url` text NOT NULL,
	`version` text NOT NULL,
	`imported_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `off_products` (
	`barcode` text PRIMARY KEY NOT NULL,
	`concept_id` text,
	`brand` text,
	`name` text NOT NULL,
	`quantity_g` real,
	`kcal_100` real,
	`protein_100` real,
	`carb_100` real,
	`fat_100` real,
	`fiber_100` real,
	`salt_100` real,
	`image_url` text,
	`raw` text,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `off_concept_idx` ON `off_products` (`concept_id`);--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`location_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`barcode` text,
	`quantity_g` real NOT NULL,
	`initial_g` real NOT NULL,
	`opened_at` integer,
	`purchased_at` integer,
	`best_before` text,
	`frozen` integer DEFAULT false NOT NULL,
	`portioned_from_id` text,
	`confidence` real DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `storage_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pantry_concept_idx` ON `pantry_items` (`concept_id`);--> statement-breakpoint
CREATE INDEX `pantry_user_idx` ON `pantry_items` (`user_id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`affinity` text NOT NULL,
	`affinity_score` real NOT NULL,
	`elo` real,
	`frequency_per_week` real,
	`revealed_score` real,
	`exposures` integer DEFAULT 0 NOT NULL,
	`stated_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `concept_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `price_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`concept_id` text NOT NULL,
	`barcode` text,
	`store_id` text,
	`price_cents` integer NOT NULL,
	`quantity_g` real NOT NULL,
	`cents_per_kg` real NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `price_concept_idx` ON `price_observations` (`concept_id`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` text NOT NULL,
	`concept_id` text,
	`barcode` text,
	`raw_label` text,
	`quantity_g` real,
	`price_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`matched_list_item_id` integer,
	`match_confidence` real,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`store_id` text,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	`total_cents` integer,
	`receipt_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`store_id` text,
	`image_path` text NOT NULL,
	`parsed` text,
	`total_cents` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`concept_id` text NOT NULL,
	`expected_state` text DEFAULT 'raw' NOT NULL,
	`role` text NOT NULL,
	`ref_g` real NOT NULL,
	`min_g` real NOT NULL,
	`max_g` real NOT NULL,
	`adjustable` integer DEFAULT true NOT NULL,
	`stiffness` real DEFAULT 1 NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ri_recipe_idx` ON `recipe_ingredients` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `ri_concept_idx` ON `recipe_ingredients` (`concept_id`);--> statement-breakpoint
CREATE TABLE `recipe_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`user_id` text NOT NULL,
	`grams` text NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carb_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`fiber_g` real,
	`cost_cents` integer,
	`solver_status` text NOT NULL,
	`solver_trace` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipe_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`equipment` text,
	`timer_seconds` integer,
	`is_prep_ahead` integer DEFAULT false NOT NULL,
	`uses_concept_ids` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rs_recipe_idx` ON `recipe_steps` (`recipe_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`title_en` text,
	`cuisine` text NOT NULL,
	`slot_kinds` text NOT NULL,
	`flavor_profiles` text DEFAULT '[]' NOT NULL,
	`techniques` text DEFAULT '[]' NOT NULL,
	`textures` text DEFAULT '[]' NOT NULL,
	`base_servings` integer DEFAULT 1 NOT NULL,
	`active_minutes` integer NOT NULL,
	`passive_minutes` integer DEFAULT 0 NOT NULL,
	`pans_needed` integer DEFAULT 1 NOT NULL,
	`equipment_required` text DEFAULT '[]' NOT NULL,
	`difficulty` integer DEFAULT 2 NOT NULL,
	`spice_level` integer DEFAULT 0 NOT NULL,
	`leftover_tolerance_days` integer DEFAULT 1 NOT NULL,
	`prep_aheadable` integer DEFAULT false NOT NULL,
	`source_url` text,
	`image_id` text,
	`notes` text,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_cuisine_idx` ON `recipes` (`cuisine`);--> statement-breakpoint
CREATE TABLE `storage_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`capacity_liters` real,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`chain` text,
	`city` text,
	`osm_ref` text
);
--> statement-breakpoint
CREATE TABLE `substitutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` text,
	`concept_id` text NOT NULL,
	`replacement_concept_id` text NOT NULL,
	`ratio` real DEFAULT 1 NOT NULL,
	`quality_penalty` real DEFAULT 0.1 NOT NULL,
	`note` text,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replacement_concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `swipe_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`verdict` text NOT NULL,
	`ms` integer,
	`round` text NOT NULL,
	`at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `swipe_user_idx` ON `swipe_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`onboarded_at` integer
);
--> statement-breakpoint
CREATE TABLE `yield_factors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`concept_id` text NOT NULL,
	`from_state` text NOT NULL,
	`to_state` text NOT NULL,
	`method` text NOT NULL,
	`weight_factor` real NOT NULL,
	`source` text NOT NULL,
	`note` text,
	FOREIGN KEY (`concept_id`) REFERENCES `food_concepts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yf_unique_idx` ON `yield_factors` (`concept_id`,`from_state`,`to_state`,`method`);