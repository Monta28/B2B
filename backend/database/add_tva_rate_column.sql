-- Migration: Add tva_rate column to order_items table
-- Run this script to add TVA rate tracking per order item

-- Add tva_rate column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'order_items' AND column_name = 'tva_rate'
    ) THEN
        ALTER TABLE order_items ADD COLUMN tva_rate NUMERIC(5, 2) DEFAULT 7;
        RAISE NOTICE 'Column tva_rate added to order_items table';
    ELSE
        RAISE NOTICE 'Column tva_rate already exists in order_items table';
    END IF;
END $$;
