-- Migration: 0009_add_trash
-- Add soft-delete support to Document table

ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3);
