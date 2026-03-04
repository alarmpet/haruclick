-- Add performance indexes for frequently queried columns
-- Migration: 20260210_add_performance_indexes
-- Purpose: Optimize queries on user_id + date columns

-- Index for events table (used in getTodayEvents, getUpcomingEvents, fetchPeriodStats)
CREATE INDEX IF NOT EXISTS idx_events_user_date
ON events(user_id, event_date);

-- Index for ledger table (used in getTodayEvents, fetchPeriodStats)
CREATE INDEX IF NOT EXISTS idx_ledger_user_date
ON ledger(user_id, transaction_date);

-- Index for bank_transactions table (used in getTodayEvents, fetchPeriodStats)
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_date
ON bank_transactions(user_id, transaction_date);

-- Verify indexes
COMMENT ON INDEX idx_events_user_date IS 'Performance index for events queries by user and date';
COMMENT ON INDEX idx_ledger_user_date IS 'Performance index for ledger queries by user and date';
COMMENT ON INDEX idx_bank_transactions_user_date IS 'Performance index for bank transaction queries by user and date';
