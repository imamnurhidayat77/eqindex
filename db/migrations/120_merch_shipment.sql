-- Merch shipment details the buyer sees: courier and tracking number, set by
-- an admin when a courier order is marked shipped. shipping_carrier is an id
-- from COURIERS (lib/merch-order-status.mjs); shipping_carrier_name holds the
-- name when the carrier is 'other'.
ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT NULL CHECK (char_length(shipping_carrier) <= 20);
ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS shipping_carrier_name TEXT NULL CHECK (char_length(shipping_carrier_name) <= 40);
ALTER TABLE merch_orders ADD COLUMN IF NOT EXISTS tracking_code TEXT NULL CHECK (char_length(tracking_code) <= 40);
