CREATE TABLE `accounts` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `provider_account_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `decrees` (
	`id` text PRIMARY KEY NOT NULL,
	`trial_id` text NOT NULL,
	`action_type` text NOT NULL,
	`action_details` text NOT NULL,
	`consul_conversation` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trial_id`) REFERENCES `trials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gladiators` (
	`id` text PRIMARY KEY NOT NULL,
	`trial_id` text NOT NULL,
	`name` text NOT NULL,
	`persona` text NOT NULL,
	`model` text NOT NULL,
	`temperature` integer DEFAULT 1 NOT NULL,
	`tools` text NOT NULL,
	`branch_name` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`response_content` text,
	`stream_log` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trial_id`) REFERENCES `trials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `judges` (
	`id` text PRIMARY KEY NOT NULL,
	`trial_id` text NOT NULL,
	`name` text NOT NULL,
	`focus` text NOT NULL,
	`model` text NOT NULL,
	`evaluation` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trial_id`) REFERENCES `trials`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repo_setups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`repo_url` text NOT NULL,
	`setup_md` text,
	`setup_sh` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repo_setups_repo_url_unique` ON `repo_setups` (`repo_url`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`repo_url` text,
	`challenge_prompt` text NOT NULL,
	`trial_type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`lanista_plan` text,
	`arbiter_plan` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`email_verified` integer,
	`image` text,
	`github_id` text,
	`github_username` text,
	`github_access_token` text,
	`claude_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_unique` ON `users` (`github_id`);--> statement-breakpoint
CREATE TABLE `verdicts` (
	`id` text PRIMARY KEY NOT NULL,
	`trial_id` text NOT NULL,
	`summary` text NOT NULL,
	`winner_gladiator_id` text,
	`reasoning` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trial_id`) REFERENCES `trials`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_gladiator_id`) REFERENCES `gladiators`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verdicts_trial_id_unique` ON `verdicts` (`trial_id`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
