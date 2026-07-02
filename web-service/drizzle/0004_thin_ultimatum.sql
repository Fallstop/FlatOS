CREATE TABLE `landlords` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`bank_account_pattern` text,
	`matching_name` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `matched_landlord_id` text;