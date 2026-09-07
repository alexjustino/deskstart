-- Where a step's window goes once it is open (F6). `{}` is what every step
-- that already exists asks for: nothing, which is what it did before the
-- column existed.
ALTER TABLE step ADD COLUMN place_json TEXT NOT NULL DEFAULT '{}';
