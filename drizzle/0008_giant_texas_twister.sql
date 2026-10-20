ALTER TABLE `assignments` ADD `completed_by_person_id` integer REFERENCES people(id);--> statement-breakpoint
ALTER TABLE `assignments` ADD `completed_by_name` text;
--> statement-breakpoint
UPDATE assignments SET completed_by_name = COALESCE((SELECT actor_name FROM board_events WHERE created_at = assignments.completed_at AND message = actor_name || ' completed ' || assignments.title_snapshot ORDER BY id DESC LIMIT 1), (SELECT name FROM people WHERE id = assignments.person_id)) WHERE completed_at IS NOT NULL;
--> statement-breakpoint
UPDATE assignments SET completed_by_person_id = COALESCE((SELECT id FROM people WHERE name = assignments.completed_by_name ORDER BY id LIMIT 1), person_id) WHERE completed_at IS NOT NULL;
