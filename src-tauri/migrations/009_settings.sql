-- Deskstart — migration 009: settings a person chooses (F10).
--
-- A key/value table, one row per setting. What a value means, and what to do
-- with one this build does not recognise, is the domain's (`domain/settings`);
-- the host stores the string. The theme, held only in memory until now, is the
-- first — and the reason nothing here needs a default row: an absent key is
-- the default, decided by the reader.
CREATE TABLE setting (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
