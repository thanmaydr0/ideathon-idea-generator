/// <reference types="vite/client" />

// ────────────────────────────────────────────────────────────────────────────────
// Environment Variable Type Declarations
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Typed environment variables for the IDEAForge Simulation Engine.
 *
 * All VITE_-prefixed variables are exposed to the client bundle.
 * Non-prefixed secrets (e.g., service role keys) must remain server-side
 * in Supabase Edge Functions.
 *
 * Add new environment variables here to get compile-time type checking
 * across the codebase when accessing import.meta.env.
 */
interface ImportMetaEnv {
    /** Supabase project URL (e.g., https://<project-id>.supabase.co) */
    readonly VITE_SUPABASE_URL: string;

    /** Supabase anonymous/public API key for client-side access */
    readonly VITE_SUPABASE_ANON_KEY: string;

    /**
     * OpenAI API key for local development.
     * WARNING: This is exposed in the browser bundle. In production,
     * route API calls through Supabase Edge Functions instead.
     */
    readonly VITE_OPENAI_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
