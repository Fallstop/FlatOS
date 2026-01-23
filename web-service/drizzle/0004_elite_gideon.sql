CREATE TABLE `expense_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`track_allotments` integer DEFAULT false,
	`sort_order` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_name_unique` ON `expense_categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_slug_unique` ON `expense_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `expense_matching_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`merchant_pattern` text,
	`description_pattern` text,
	`account_pattern` text,
	`akahu_category` text,
	`match_mode` text DEFAULT 'any',
	`is_regex` integer DEFAULT false,
	`is_active` integer DEFAULT true,
	`created_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `expense_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`category_id` text NOT NULL,
	`matched_rule_id` text,
	`match_confidence` real,
	`manual_match` integer DEFAULT false,
	`created_at` integer,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`matched_rule_id`) REFERENCES `expense_matching_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_transactions_transaction_id_unique` ON `expense_transactions` (`transaction_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `manual_match` integer DEFAULT false;