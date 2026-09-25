ALTER TABLE `off_products` ADD `price_cents` integer;
--> statement-breakpoint
ALTER TABLE `off_products` ADD `scan_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `off_products` ADD `last_scanned_at` integer;
--> statement-breakpoint
ALTER TABLE `off_products` ADD `confirmed` integer DEFAULT 0 NOT NULL;
