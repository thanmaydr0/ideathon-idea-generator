import OpenAI from "openai";

// ────────────────────────────────────────────────────────────────────────────────
// OpenAI Client Configuration
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Configured OpenAI client for the IDEAForge Simulation Engine.
 *
 * Architecture decision: The OpenAI client is initialized as a singleton
 * module-level export. In production, API calls would go through Supabase
 * Edge Functions (server-side) to avoid exposing the API key in the browser.
 *
 * This client-side instance is provided for:
 * 1. Local development & prototyping
 * 2. Direct browser-to-API calls during testing
 *
 * Models used in the IDEAForge pipeline:
 * - gpt-4o: Persona agents (critique generation) and Judge agents (scoring)
 * - text-embedding-3-large: RAG embeddings for novelty scoring
 *
 * SECURITY NOTE: In production, move API calls to Supabase Edge Functions.
 * The VITE_OPENAI_API_KEY is exposed in the browser bundle. This is acceptable
 * only for development/demo environments.
 */

const openaiApiKey = import.meta.env.VITE_OPENAI_API_KEY;

if (!openaiApiKey) {
    console.warn(
        "[IDEAForge] VITE_OPENAI_API_KEY is not set. " +
        "OpenAI API calls will fail. Set this in your .env file for local development, " +
        "or route calls through Supabase Edge Functions in production."
    );
}

/**
 * Singleton OpenAI client instance.
 *
 * Usage:
 * ```ts
 * import { openai } from "@/lib/openai";
 *
 * const completion = await openai.chat.completions.create({
 *   model: "gpt-4o",
 *   messages: [{ role: "system", content: personaPrompt }],
 *   response_format: { type: "json_object" },
 * });
 * ```
 */
export const openai = new OpenAI({
    apiKey: openaiApiKey || "",
    /**
     * dangerouslyAllowBrowser: Required when using the OpenAI SDK in browser
     * environments. In production, this client should only be used server-side
     * via Edge Functions. This flag is set for development convenience.
     */
    dangerouslyAllowBrowser: true,
});

/**
 * Default model configuration constants.
 * Centralized here to avoid magic strings throughout the codebase.
 */
export const OPENAI_MODELS = {
    /** Primary reasoning model for persona and judge agents */
    AGENT: "gpt-4o" as const,
    /** Embedding model for RAG vector similarity search */
    EMBEDDING: "text-embedding-3-large" as const,
} as const;

/**
 * Default generation parameters for agent completions.
 * These can be overridden per-agent in the agent definitions.
 */
export const DEFAULT_COMPLETION_CONFIG = {
    temperature: 0.7,
    max_tokens: 4096,
    /** Force structured JSON output from agents */
    response_format: { type: "json_object" as const },
} as const;
