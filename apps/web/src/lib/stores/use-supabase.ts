/**
 * Feature flag: use Supabase stores instead of legacy JSON files.
 *
 * Default: true. All API routes use Supabase stores.
 * Legacy JSON code kept temporarily for reference but no longer executes.
 *
 * Set HUBFLOW_USE_SUPABASE=0 to fallback to JSON (only for emergency/debugging).
 */
export const USE_SUPABASE = process.env.HUBFLOW_USE_SUPABASE !== "0";
