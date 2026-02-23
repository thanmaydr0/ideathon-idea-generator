import { createClient } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────────────────────────
// Supabase Client Configuration
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Typed Supabase client for the IDEAForge Simulation Engine.
 *
 * Architecture decision: We use a single shared client instance rather than
 * per-request clients. Supabase-js internally manages connection pooling
 * and token refresh, so a singleton is both safe and efficient.
 *
 * The client is configured with:
 * - Auth persistence via localStorage (default)
 * - Auto token refresh enabled
 * - Realtime enabled for streaming iteration updates to the dashboard
 *
 * Environment variables are validated at build time via vite-env.d.ts typing
 * and at runtime via the guard below.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        "[IDEAForge] Missing Supabase environment variables. " +
        "Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file."
    );
}

/**
 * Singleton Supabase client used across the application.
 *
 * Usage:
 * ```ts
 * import { supabase } from "@/lib/supabase";
 * const { data, error } = await supabase.from("simulation_sessions").select("*");
 * ```
 *
 * For typed database queries, generate types with:
 * ```bash
 * npx supabase gen types typescript --project-id <id> > src/types/database.ts
 * ```
 * Then pass the Database type as a generic: createClient<Database>(...)
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
    realtime: {
        params: {
            /** Heartbeat interval for Realtime channels (ms) */
            eventsPerSecond: 10,
        },
    },
});
