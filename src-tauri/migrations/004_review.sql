-- A step carries whether it has been seen and accepted on this machine
-- (ADR-013). Every step that already exists was written here, by the person
-- who is looking at it, so it is accepted: the default says so. Only import
-- writes a zero, and the profile's `imported_unreviewed` flag clears when no
-- zero is left.
ALTER TABLE step ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 1;
