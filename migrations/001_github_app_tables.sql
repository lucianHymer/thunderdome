-- Migration: GitHub App integration and setup discovery tables
-- Run this SQL on your production SQLite database

CREATE TABLE IF NOT EXISTS `repo_setups` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `repo_url` text NOT NULL,
  `setup_md` text,
  `setup_sh` text,
  `created_at` integer DEFAULT (unixepoch()),
  `updated_at` integer DEFAULT (unixepoch()),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `repo_setups_repo_url_unique` ON `repo_setups` (`repo_url`);

CREATE TABLE IF NOT EXISTS `github_app_installations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `installation_id` integer NOT NULL UNIQUE,
  `account_login` text NOT NULL,
  `account_type` text NOT NULL,
  `repository_selection` text,
  `suspended_at` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `github_app_repos` (
  `id` text PRIMARY KEY NOT NULL,
  `installation_id` integer NOT NULL,
  `repo_full_name` text NOT NULL,
  `repo_id` integer NOT NULL,
  `private` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (`installation_id`) REFERENCES `github_app_installations`(`installation_id`) ON UPDATE no action ON DELETE cascade
);
