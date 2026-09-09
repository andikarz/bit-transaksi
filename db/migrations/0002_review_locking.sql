-- Migration: Add locking columns for verifikator review (Fase 6)
-- Adds locked_by and locked_at to applications table for atomic lease mechanism

ALTER TABLE applications
  ADD COLUMN locked_by VARCHAR(36) NULL,
  ADD COLUMN locked_at TIMESTAMP NULL,
  ADD INDEX idx_app_locked (locked_by, locked_at);
