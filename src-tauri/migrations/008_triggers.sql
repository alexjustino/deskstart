-- Deskstart — migration 008: what starts a profile without the button (F9).
--
-- A schedule, as the domain wrote it, handed to the Windows Task Scheduler;
-- and a key combination, as its canonical text. `{}` and '' are "none",
-- which is what every profile that exists has.
ALTER TABLE profile ADD COLUMN schedule_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE profile ADD COLUMN shortcut TEXT NOT NULL DEFAULT '';
