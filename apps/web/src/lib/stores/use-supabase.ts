/**
 * Feature flag: use Supabase stores instead of legacy JSON files.
 *
 * Set HUBFLOW_USE_SUPABASE=1 in .env.local to enable.
 * Default: false (legacy JSON stores).
 *
 * When true, all API routes should import from `@/lib/stores` instead of
 * `@/lib/json-collection` or the old store files.
 *
 * Migration strategy:
 * 1. Deploy with HUBFLOW_USE_SUPABASE=0 (default) — works as before
 * 2. Run the SQL migration on Supabase
 * 3. Run the data migration script to seed Supabase from JSON
 * 4. Set HUBFLOW_USE_SUPABASE=1 — now uses Supabase
 * 5. Remove legacy JSON code once stable
 */
export const USE_SUPABASE = process.env.HUBFLOW_USE_SUPABASE === "1";
