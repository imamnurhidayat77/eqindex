-- Rename EI internals to EQIndex brand — migration 029
-- User-visible rename to "EQIndex Rating" already done in web/;
-- this renames the database objects. Pure renames (PostgreSQL updates
-- dependent view definitions automatically); no formula changes.
-- API accepts both metric=ei (legacy) and metric=eqindex (canonical).

ALTER FUNCTION ei_height_mult(INT) RENAME TO eqindex_height_mult;
ALTER FUNCTION ei_base(INT, BOOL, NUMERIC, NUMERIC, TEXT) RENAME TO eqindex_base;
ALTER FUNCTION ei_size_mod(INT) RENAME TO eqindex_size_mod;
ALTER FUNCTION ei_handicap(INT, INT) RENAME TO eqindex_handicap;
ALTER VIEW ei_class_ctx RENAME TO eqindex_class_ctx;
ALTER VIEW ei_round RENAME TO eqindex_round;
ALTER VIEW horse_ei_rating RENAME TO horse_eqindex_rating;
ALTER VIEW rider_ei_rating RENAME TO rider_eqindex_rating;
