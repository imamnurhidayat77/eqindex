-- Undo 120: shipment details are dropped (the shipped event note stays).
ALTER TABLE merch_orders DROP COLUMN IF EXISTS tracking_code;
ALTER TABLE merch_orders DROP COLUMN IF EXISTS shipping_carrier_name;
ALTER TABLE merch_orders DROP COLUMN IF EXISTS shipping_carrier;
