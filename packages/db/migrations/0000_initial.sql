CREATE TABLE `device_title_access` (
	`device_id` text NOT NULL,
	`title_id` text NOT NULL,
	`day` text NOT NULL,
	PRIMARY KEY(`device_id`, `title_id`, `day`),
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `device_title_access_day` ON `device_title_access` (`day`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`reputation` real DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`quota_day` text,
	`quota_used` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `devices_last_seen` ON `devices` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `phobias` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`emoji` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`segment_id` text,
	`title_id` text NOT NULL,
	`phobia_id` text NOT NULL,
	`position` real NOT NULL,
	`kind` text NOT NULL,
	`device_id` text NOT NULL,
	`source_kind` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phobia_id`) REFERENCES `phobias`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_title_phobia` ON `reports` (`title_id`,`phobia_id`);--> statement-breakpoint
CREATE INDEX `reports_segment` ON `reports` (`segment_id`);--> statement-breakpoint
CREATE INDEX `reports_device_created` ON `reports` (`device_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`title_id` text NOT NULL,
	`phobia_id` text NOT NULL,
	`start` real NOT NULL,
	`end` real NOT NULL,
	`modality` text NOT NULL,
	`bbox` text,
	`origin` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`reports_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phobia_id`) REFERENCES `phobias`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `segments_title_phobia` ON `segments` (`title_id`,`phobia_id`);--> statement-breakpoint
CREATE INDEX `segments_status_updated` ON `segments` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `sync_indexes` (
	`title_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`r2_key` text NOT NULL,
	`cues_count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `title_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`device_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `title_requests_tmdb_unique` ON `title_requests` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `title_requests_status` ON `title_requests` (`status`);--> statement-breakpoint
CREATE TABLE `title_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`title_id` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`offset` real DEFAULT 0 NOT NULL,
	`scale` real DEFAULT 1 NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`method` text NOT NULL,
	FOREIGN KEY (`title_id`) REFERENCES `titles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `title_sources_external_unique` ON `title_sources` (`kind`,`external_id`);--> statement-breakpoint
CREATE INDEX `title_sources_title_id` ON `title_sources` (`title_id`);--> statement-breakpoint
CREATE TABLE `titles` (
	`id` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer,
	`imdb_id` text,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`runtime_canonical` real NOT NULL,
	`credits_start` real,
	`credits_end` real,
	`public_slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `titles_tmdb_id_unique` ON `titles` (`tmdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `titles_public_slug_unique` ON `titles` (`public_slug`);--> statement-breakpoint
CREATE TABLE `votes` (
	`segment_id` text NOT NULL,
	`device_id` text NOT NULL,
	`value` integer NOT NULL,
	`weight` real NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`segment_id`, `device_id`),
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
