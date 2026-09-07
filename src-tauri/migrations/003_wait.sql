-- Deskstart — migration 003: what a step waits for.
--
-- A step may wait for an earlier step to be responding before it starts (F4):
-- `{ "stepId": ..., "probe": { "kind": "window" | "port", "port": ... },
--    "timeoutMs": ... }`. `{}` — the default — means it starts at once.
--
-- The domain writes and validates the shape (ADR-010); the column only has to
-- hold it. Adding a column with a default rewrites nothing: every step that
-- exists waits for nothing, which is what it did before this column existed.

ALTER TABLE step ADD COLUMN wait_json TEXT NOT NULL DEFAULT '{}';
