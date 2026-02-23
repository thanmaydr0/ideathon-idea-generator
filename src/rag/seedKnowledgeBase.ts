import { supabase } from "@/lib/supabase";
import { ragEngine } from "@/rag/ragEngine";
import { SEED_DATA } from "@/rag/seedData";

// ────────────────────────────────────────────────────────────────────────────────
// Seed Knowledge Base
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Seed the RAG knowledge base with curated entries.
 * Embeds all 20 seed entries via OpenAI and inserts them into the
 * `rag_knowledge_base` table in Supabase.
 *
 * ARCH: This function is idempotent — it checks if entries already exist
 * (by title) and skips duplicates. Safe to call on every app initialization.
 *
 * ⚠️ Cost: ~20 embedding API calls × ~500 tokens each ≈ $0.0013 total.
 * Should be called once during system setup, not on every page load.
 */
export async function seedKnowledgeBase(): Promise<{
    inserted: number;
    skipped: number;
    errors: number;
}> {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`[seed] Starting knowledge base seed with ${SEED_DATA.length} entries...`);

    // Check existing entries to avoid duplicates
    const { data: existing } = await supabase
        .from("rag_knowledge_base")
        .select("title");

    const existingTitles = new Set((existing ?? []).map((r: { title: string }) => r.title));

    // Process entries sequentially to avoid rate limiting on embedding API
    for (const entry of SEED_DATA) {
        if (existingTitles.has(entry.title)) {
            console.log(`[seed] Skipping "${entry.title}" (already exists)`);
            skipped++;
            continue;
        }

        try {
            // Generate embedding for the entry content
            const embedding = await ragEngine.embedText(
                `${entry.title}. ${entry.content}`,
            );

            const { error } = await supabase
                .from("rag_knowledge_base")
                .insert({
                    content_type: entry.contentType,
                    title: entry.title,
                    content: entry.content,
                    domain: entry.domain,
                    year: entry.year,
                    score: entry.score,
                    embedding,
                    metadata: entry.metadata,
                });

            if (error) {
                console.error(`[seed] Failed to insert "${entry.title}":`, error);
                errors++;
            } else {
                console.log(`[seed] ✅ Inserted "${entry.title}"`);
                inserted++;
            }
        } catch (err) {
            console.error(`[seed] Embedding failed for "${entry.title}":`, err);
            errors++;
        }

        // Small delay between API calls to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(
        `[seed] Complete — inserted: ${inserted}, skipped: ${skipped}, errors: ${errors}`,
    );

    return { inserted, skipped, errors };
}

/**
 * Check if the knowledge base has been seeded.
 * Returns true if at least 15 entries exist (allowing for some failures).
 */
export async function isKnowledgeBaseSeeded(): Promise<boolean> {
    const { count, error } = await supabase
        .from("rag_knowledge_base")
        .select("*", { count: "exact", head: true });

    if (error) {
        console.error("[seed] Failed to check knowledge base:", error);
        return false;
    }

    return (count ?? 0) >= 15;
}
