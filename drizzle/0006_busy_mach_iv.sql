ALTER TABLE `chores` ADD `emoji` text DEFAULT '✨' NOT NULL;
--> statement-breakpoint
UPDATE `chores` SET `emoji` = CASE
  WHEN lower(`title`) LIKE '%bathroom%' THEN '🛁'
  WHEN lower(`title`) LIKE '%vacuum%' THEN '🧹'
  WHEN lower(`title`) LIKE '%stove%' THEN '🍳'
  WHEN lower(`title`) LIKE '%counter%' OR lower(`title`) LIKE '%sink%' THEN '🧽'
  WHEN lower(`title`) LIKE '%patio%' OR lower(`title`) LIKE '%sweep%' THEN '🧹'
  WHEN lower(`title`) LIKE '%leaves%' OR lower(`title`) LIKE '%debris%' THEN '🍂'
  WHEN lower(`title`) LIKE '%outdoor trash%' THEN '♻️'
  WHEN lower(`title`) LIKE '%indoor trash%' THEN '🗑️'
  WHEN lower(`title`) LIKE '%trash%' THEN '🗑️'
  WHEN lower(`title`) LIKE '%recycling%' THEN '♻️'
  WHEN lower(`title`) LIKE '%mop%' OR lower(`title`) LIKE '%floor%' THEN '🪣'
  WHEN lower(`title`) LIKE '%weed%' OR lower(`title`) LIKE '%trim%' THEN '🌿'
  WHEN lower(`title`) LIKE '%dead plant%' THEN '🥀'
  WHEN lower(`title`) LIKE '%water plant%' THEN '🪴'
  WHEN lower(`title`) LIKE '%dog%' OR lower(`title`) LIKE '%poop%' THEN '🐕'
  ELSE '✨'
END;
