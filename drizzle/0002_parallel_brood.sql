CREATE TABLE `github_app_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`installation_id` integer NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text NOT NULL,
	`repository_selection` text,
	`suspended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_installations_installation_id_unique` ON `github_app_installations` (`installation_id`);--> statement-breakpoint
CREATE TABLE `github_app_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` integer NOT NULL,
	`repo_full_name` text NOT NULL,
	`repo_id` integer NOT NULL,
	`private` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `github_app_installations`(`installation_id`) ON UPDATE no action ON DELETE cascade
);
