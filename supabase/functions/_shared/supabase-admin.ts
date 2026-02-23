/**
 * IDEAForge — Shared Supabase Admin Client
 *
 * ARCH: Edge Functions use the service_role key (not anon) because they
 * perform privileged operations:
 *   - Writing iteration logs, scores, critiques (bypasses RLS)
 *   - Updating session status
 *   - Cross-user RAG knowledge reads
 *
 * The service_role key is stored in Supabase Vault and exposed to Edge
 * Functions automatically via the SUPABASE_SERVICE_ROLE_KEY env var.
 *
 * SECURITY: Never expose this client or its key to the frontend.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Admin Supabase client — bypasses RLS for server-side operations.
 * All Edge Functions share this single factory to avoid redundant initialization.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

/**
 * Creates a Supabase client scoped to the requesting user's JWT.
 * Used when we need to respect RLS policies (e.g., reading user-specific data).
 */
export function createUserClient(authHeader: string) {
    return createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: {
            headers: { Authorization: authHeader },
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
