-- Migration: Increase precision for unit_price and line_total to preserve 3 decimals
DO $$
BEGIN
  -- order_items
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'unit_price') THEN
    EXECUTE 'ALTER TABLE order_items ALTER COLUMN unit_price TYPE NUMERIC(12,3)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'line_total') THEN
    EXECUTE 'ALTER TABLE order_items ALTER COLUMN line_total TYPE NUMERIC(12,3)';
  END IF;

  -- orders (total_ht) pour conserver 3 décimales
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_ht') THEN
    EXECUTE 'ALTER TABLE orders ALTER COLUMN total_ht TYPE NUMERIC(12,3)';
  END IF;

  -- orders (is_editing) pour verrouillage modification client
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'is_editing') THEN
    ALTER TABLE orders ADD COLUMN is_editing BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  -- cart_items (for consistency)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'unit_price') THEN
    EXECUTE 'ALTER TABLE cart_items ALTER COLUMN unit_price TYPE NUMERIC(12,3)';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cart_items' AND column_name = 'line_total') THEN
    EXECUTE 'ALTER TABLE cart_items ALTER COLUMN line_total TYPE NUMERIC(12,3)';
  END IF;
END $$;
