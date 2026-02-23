/**
 * IDEAForge — Shared OpenAI Client for Edge Functions
 *
 * ARCH: All AI calls go through this centralized client. The Edge Function
 * environment runs Deno, so we use the official OpenAI SDK via esm.sh.
 *
 * Models used:
 *   - gpt-4o: Persona agents (critique generation) and Judge agents (scoring)
 *   - text-embedding-3-large: RAG embeddings (1536 dimensions)
 *
 * Token tracking: Every function logs tokens_used to the DB for cost monitoring.
 */
import OpenAI from "https://esm.sh/openai@4.56.0";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

if (!openaiApiKey) {
    throw new Error(
        "[IDEAForge] OPENAI_API_KEY not set in Edge Function environment. " +
        "Add it via: supabase secrets set OPENAI_API_KEY=sk-..."
    );
}

/** Singleton OpenAI client shared across all Edge Functions. */
export const openai = new OpenAI({ apiKey: openaiApiKey });

/** Model constants — single source of truth for the entire backend. */
export const MODELS = {
    AGENT: "gpt-4o" as const,
    EMBEDDING: "text-embedding-3-large" as const,
} as const;

/**
 * Generate an embedding vector for the given text.
 * Returns a 1536-dimensional float array matching our pgvector schema.
 *
 * @param text - The text to embed
 * @returns 1536-dim embedding vector + token count
 */
export async function generateEmbedding(
    text: string
): Promise<{ embedding: number[]; tokensUsed: number }> {
    const response = await openai.embeddings.create({
        model: MODELS.EMBEDDING,
        input: text,
    });

    return {
        embedding: response.data[0].embedding,
        tokensUsed: response.usage?.total_tokens ?? 0,
    };
}
