-- Migration: Add FULL_ADMIN role to user_role enum
-- Run this script on existing databases to add the new FULL_ADMIN role
-- (Previously named AGENCY_ADMIN, renamed for clarity)

-- PostgreSQL: Add new value to existing enum
-- Note: This handles both new installations and upgrades from AGENCY_ADMIN
DO $$
BEGIN
    -- First, check if AGENCY_ADMIN exists and rename it to FULL_ADMIN
    IF EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'AGENCY_ADMIN'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        -- Rename AGENCY_ADMIN to FULL_ADMIN
        UPDATE pg_enum SET enumlabel = 'FULL_ADMIN'
        WHERE enumlabel = 'AGENCY_ADMIN'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role');
        RAISE NOTICE 'AGENCY_ADMIN renamed to FULL_ADMIN successfully';
    -- Otherwise, check if FULL_ADMIN already exists
    ELSIF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'FULL_ADMIN'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        -- Add FULL_ADMIN after SYSTEM_ADMIN
        ALTER TYPE user_role ADD VALUE 'FULL_ADMIN' AFTER 'SYSTEM_ADMIN';
        RAISE NOTICE 'FULL_ADMIN role added successfully';
    ELSE
        RAISE NOTICE 'FULL_ADMIN role already exists';
    END IF;
END $$;
