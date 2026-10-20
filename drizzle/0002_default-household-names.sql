INSERT INTO board_events (actor_name, message, created_at)
SELECT 'Household', 'Person 2 changed to jasgross', CURRENT_TIMESTAMP
FROM people WHERE id = 2 AND name = 'Person 2';
--> statement-breakpoint
UPDATE people SET name = 'jasgross' WHERE id = 2 AND name = 'Person 2';
--> statement-breakpoint
INSERT INTO board_events (actor_name, message, created_at)
SELECT 'Household', 'Person 3 changed to wiyup', CURRENT_TIMESTAMP
FROM people WHERE id = 3 AND name = 'Person 3';
--> statement-breakpoint
UPDATE people SET name = 'wiyup' WHERE id = 3 AND name = 'Person 3';
