import type { IdeaVersion, RAGContext } from "@/types";
import { supabase } from "@/lib/supabase";
import { openai, OPENAI_MODELS } from "@/lib/openai";

// ────────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────────

/** A retrieved chunk from the RAG knowledge base. */
export interface RAGChunk {
    id: string;
    title: string;
    content: string;
    contentType: string;
    domain: string | null;
    similarity: number;
}

/** Result of LLM wrapper anti-pattern detection. */
export interface LLMWrapperAnalysis {
    isLLMWrapper: boolean;
    evidence: string[];
    severity: "critical" | "high" | "low";
}

// ────────────────────────────────────────────────────────────────────────────────
// LLM Wrapper Detection Signals
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Patterns that indicate an idea is a thin wrapper around GPT/LLM APIs
 * with no defensible moat or novel architecture.
 */
const LLM_WRAPPER_SIGNALS = {
    corePatterns: [
        /take\s+.*?\s+(?:input|data)\s*(?:→|->|and|then)\s*(?:gpt|llm|ai|openai)\s*(?:→|->|and|then)\s*(?:output|result)/i,
        /(?:just|simply|basically)\s+(?:send|pass|feed)\s+.*?\s+(?:to|through)\s+(?:gpt|openai|chatgpt|claude|llm)/i,
        /chatgpt\s+for\s+\w+/i,
        /gpt-?\d?\s+(?:api|wrapper|interface|frontend)/i,
    ],
    noProprietaryData: [
        /no\s+(?:proprietary|unique|custom)\s+data/i,
        /public(?:ly)?\s+available\s+data/i,
    ],
    noFineTuning: [
        /(?:no|without)\s+(?:fine-?tun|custom\s+model|train)/i,
    ],
    chatOnlyUI: [
        /chat\s+(?:interface|ui|bot|window)/i,
        /conversational\s+(?:interface|ui|agent)/i,
    ],
    genericPhrases: [
        "uses GPT-4 to",
        "powered by OpenAI",
        "leverages LLMs",
        "AI-powered chatbot",
        "chat with your",
        "ask questions about",
    ],
} as const;

// ────────────────────────────────────────────────────────────────────────────────
// RAG Engine
// ────────────────────────────────────────────────────────────────────────────────

/**
 * RAGEngine provides retrieval-augmented generation context for the IDEAForge
 * adversarial loop. It queries the pgvector-backed knowledge base in Supabase
 * to ground persona/judge reasoning in real-world hackathon data.
 *
 * ARCH: The engine uses Supabase RPC functions (`match_rag_knowledge`,
 * `check_failure_similarity`) which run server-side SQL with pgvector's
 * cosine distance operator. This avoids shipping embeddings to the client
 * for comparison — all similarity math happens in Postgres.
 */
export class RAGEngine {
    // ────────────────────────────────────────────────────────────────────────
    // Embedding
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Embed any text using OpenAI text-embedding-3-large.
     * Returns a 1536-dimensional float array matching the pgvector column size.
     *
     * ARCH: We explicitly request `dimensions: 1536` from the API. The model
     * natively produces 3072 dims, but 1536 is sufficient for our similarity
     * needs and halves storage cost in pgvector.
     */
    async embedText(text: string): Promise<number[]> {
        const response = await openai.embeddings.create({
            model: OPENAI_MODELS.EMBEDDING,
            input: text,
            dimensions: 1536,
        });

        return response.data[0].embedding;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Retrieval: Winning Patterns
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Retrieve similar winning hackathon ideas from the knowledge base.
     * Uses the `match_rag_knowledge` Postgres function for ANN search.
     *
     * @param query - The text to search against (idea problem + solution)
     * @param domain - Optional domain filter (HealthTech, EdTech, etc.)
     * @param limit - Number of results to return (default 5)
     */
    async retrieveWinningPatterns(
        query: string,
        domain: string,
        limit = 5,
    ): Promise<RAGChunk[]> {
        const embedding = await this.embedText(query);

        const { data, error } = await supabase.rpc("match_rag_knowledge", {
            query_embedding: embedding,
            match_threshold: 0.4,
            match_count: limit,
            filter_content_type: "winning_idea",
        });

        if (error) {
            console.error("[rag] Failed to retrieve winning patterns:", error);
            return [];
        }

        return (data ?? [])
            .filter((row: Record<string, unknown>) => !domain || !row.domain || row.domain === domain)
            .map((row: Record<string, unknown>) => ({
                id: row.id as string,
                title: (row.title as string) ?? "",
                content: (row.content as string) ?? "",
                contentType: (row.content_type as string) ?? "winning_idea",
                domain: (row.domain as string) ?? null,
                similarity: row.similarity as number,
            }));
    }

    // ────────────────────────────────────────────────────────────────────────
    // Retrieval: Failure Patterns
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Retrieve failure patterns similar to the current idea embedding.
     * Uses the `check_failure_similarity` Postgres function.
     *
     * These are injected into persona/judge prompts so agents can warn
     * against repeating known failure modes.
     */
    async retrieveFailurePatterns(
        ideaEmbedding: number[],
        limit = 3,
    ): Promise<RAGChunk[]> {
        const { data, error } = await supabase.rpc("check_failure_similarity", {
            query_embedding: ideaEmbedding,
            threshold: 0.5,
        });

        if (error) {
            console.error("[rag] Failed to retrieve failure patterns:", error);
            return [];
        }

        return (data ?? []).slice(0, limit).map((row: Record<string, unknown>) => ({
            id: crypto.randomUUID(), // failure_embeddings RPC returns no id
            title: (row.failure_type as string) ?? "",
            content: (row.failure_description as string) ?? "",
            contentType: "failure_pattern",
            domain: null,
            similarity: row.similarity as number,
        }));
    }

    // ────────────────────────────────────────────────────────────────────────
    // Novelty Scoring
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Compute novelty score for an idea by comparing its embedding against
     * all existing idea_versions in the database.
     *
     * Scoring rubric:
     *   max similarity > 0.90 → 1.0  (essentially duplicate)
     *   max similarity 0.75-0.90 → 4.0  (highly derivative)
     *   max similarity 0.60-0.75 → 6.5  (moderately novel)
     *   max similarity 0.40-0.60 → 8.5  (novel)
     *   max similarity < 0.40 → 10.0  (highly novel)
     *
     * @returns Novelty score 1-10 (10 = most novel)
     */
    async computeNoveltyScore(ideaEmbedding: number[]): Promise<number> {
        // Query all existing idea embeddings and find the max similarity
        const { data, error } = await supabase.rpc("match_rag_knowledge", {
            query_embedding: ideaEmbedding,
            match_threshold: 0.0, // get all matches
            match_count: 1,       // only need the most similar
            filter_content_type: null,
        });

        // Also check against idea_versions table directly
        const { data: ideaData, error: ideaError } = await supabase
            .from("idea_versions")
            .select("embedding")
            .not("embedding", "is", null)
            .limit(100);

        let maxSimilarity = 0;

        // Check RAG knowledge base similarity
        if (!error && data && data.length > 0) {
            const ragMax = Math.max(...(data as Array<{ similarity: number }>).map((r) => r.similarity));
            maxSimilarity = Math.max(maxSimilarity, ragMax);
        }

        // Check idea_versions similarity (client-side cosine)
        if (!ideaError && ideaData && ideaData.length > 0) {
            for (const row of ideaData) {
                if (row.embedding) {
                    // Supabase returns embedding as string representation
                    const existingEmb = typeof row.embedding === "string"
                        ? JSON.parse(row.embedding) as number[]
                        : row.embedding as number[];

                    if (Array.isArray(existingEmb) && existingEmb.length > 0) {
                        const sim = this.cosineSimilarity(ideaEmbedding, existingEmb);
                        maxSimilarity = Math.max(maxSimilarity, sim);
                    }
                }
            }
        }

        // Map similarity to novelty score
        return this.similarityToNovelty(maxSimilarity);
    }

    /** Map max cosine similarity to a 1-10 novelty score. */
    private similarityToNovelty(maxSimilarity: number): number {
        if (maxSimilarity > 0.90) return 1.0;
        if (maxSimilarity > 0.75) return 4.0;
        if (maxSimilarity > 0.60) return 6.5;
        if (maxSimilarity > 0.40) return 8.5;
        return 10.0;
    }

    /** Cosine similarity between two equal-length vectors. */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    // ────────────────────────────────────────────────────────────────────────
    // LLM Wrapper Detection
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Detect if an idea is a thin "LLM wrapper" — an anti-pattern where
     * the core value proposition is just "send X to GPT → get Y" with
     * no proprietary data, novel model, or unique retrieval strategy.
     *
     * ARCH: This is a heuristic-based detector, not an LLM call.
     * Runs synchronously with zero latency, used as a pre-filter before
     * expensive judge evaluations.
     */
    detectLLMWrapper(idea: IdeaVersion): LLMWrapperAnalysis {
        const evidence: string[] = [];
        const fullText = [
            idea.problemStatement,
            idea.solution,
            idea.deliverable,
            idea.technicalApproach,
            idea.expectedImpact,
        ].join(" ");
        const lowerText = fullText.toLowerCase();

        // Check core wrapper patterns
        for (const pattern of LLM_WRAPPER_SIGNALS.corePatterns) {
            if (pattern.test(fullText)) {
                evidence.push(`Core wrapper pattern detected: "${fullText.match(pattern)?.[0]}"`);
            }
        }

        // Check generic phrases
        for (const phrase of LLM_WRAPPER_SIGNALS.genericPhrases) {
            if (lowerText.includes(phrase.toLowerCase())) {
                evidence.push(`Generic LLM phrase: "${phrase}"`);
            }
        }

        // Check for absence of differentiators
        const hasProprietaryData = /(?:proprietary|unique|custom|exclusive|first-party)\s+(?:data|dataset|corpus)/i.test(fullText);
        const hasFineTuning = /(?:fine-?tun|custom\s+model|train(?:ed|ing)\s+(?:model|on)|LoRA|RLHF)/i.test(fullText);
        const hasNovelRetrieval = /(?:novel|custom|proprietary)\s+(?:retrieval|search|index|RAG|embedding)/i.test(fullText);
        const hasNovelUI = /(?:novel|innovative|unique)\s+(?:UI|UX|interface|interaction|visualization)/i.test(fullText);

        if (!hasProprietaryData) evidence.push("No proprietary data source mentioned");
        if (!hasFineTuning) evidence.push("No fine-tuning or custom model mentioned");
        if (!hasNovelRetrieval) evidence.push("No novel retrieval strategy");

        // Check for chat-only UI
        const isChatOnly = LLM_WRAPPER_SIGNALS.chatOnlyUI.some((p) => p.test(fullText));
        if (isChatOnly && !hasNovelUI) {
            evidence.push("UI appears to be a standard chat interface with no differentiation");
        }

        // Determine severity based on evidence count
        const isWrapper = evidence.length >= 3;
        let severity: "critical" | "high" | "low";

        if (evidence.length >= 5) {
            severity = "critical";
        } else if (evidence.length >= 3) {
            severity = "high";
        } else {
            severity = "low";
        }

        return { isLLMWrapper: isWrapper, evidence, severity };
    }

    // ────────────────────────────────────────────────────────────────────────
    // Failure Embedding Storage
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Store a failure embedding for future anti-pattern detection.
     * Called when a simulation fails or produces a low-quality idea,
     * so future runs can avoid similar patterns.
     */
    async storeFailureEmbedding(idea: IdeaVersion, failureType: string): Promise<void> {
        const ideaText = [
            idea.problemStatement,
            idea.solution,
            idea.technicalApproach,
        ].join(" ");

        const embedding = await this.embedText(ideaText);

        const { error } = await supabase
            .from("failure_embeddings")
            .insert({
                failure_type: failureType,
                failure_description: `Failed idea: ${idea.problemStatement.slice(0, 200)}. Solution: ${idea.solution.slice(0, 200)}`,
                embedding,
            });

        if (error) {
            console.error("[rag] Failed to store failure embedding:", error);
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Full Context Assembly
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Assemble complete RAG context for an idea.
     * This is the main entry point used by the orchestrator.
     *
     * Flow:
     * 1. Embed the idea text
     * 2. Retrieve winning patterns (parallel)
     * 3. Retrieve failure patterns (parallel)
     * 4. Compute novelty score
     * 5. Detect LLM wrapper anti-pattern (for buzzword flags)
     * 6. Return assembled RAGContext matching the Zod schema
     */
    async assembleRAGContext(idea: IdeaVersion, domain: string): Promise<RAGContext> {
        const ideaText = [
            idea.problemStatement,
            idea.solution,
            idea.technicalApproach,
            idea.expectedImpact,
        ].join(" ");

        // Step 1: Embed
        const ideaEmbedding = await this.embedText(ideaText);

        // Steps 2-4: Run retrieval and novelty in parallel
        const [winningPatterns, failurePatterns, noveltyScore] = await Promise.all([
            this.retrieveWinningPatterns(
                `${idea.problemStatement} ${idea.solution}`,
                domain,
                5,
            ),
            this.retrieveFailurePatterns(ideaEmbedding, 3),
            this.computeNoveltyScore(ideaEmbedding),
        ]);

        // Step 5: LLM wrapper check
        const wrapperAnalysis = this.detectLLMWrapper(idea);
        const buzzwordFlags: string[] = [];

        if (wrapperAnalysis.isLLMWrapper) {
            buzzwordFlags.push(`LLM_WRAPPER (${wrapperAnalysis.severity}): ${wrapperAnalysis.evidence.slice(0, 3).join("; ")}`);
        }

        // Step 6: Assemble RAGContext
        const allChunks = [
            ...winningPatterns.map((p) => `[WINNING] ${p.title}: ${p.content}`),
            ...failurePatterns.map((p) => `[FAILURE] ${p.title}: ${p.content}`),
        ];

        const allScores = [
            ...winningPatterns.map((p) => p.similarity),
            ...failurePatterns.map((p) => p.similarity),
        ];

        // Convert novelty score (1-10) to penalty (0-1): 10→0.0, 1→0.9
        const noveltyPenalty = Math.max(0, Math.min(1, 1 - noveltyScore / 10));

        return {
            retrievedChunks: allChunks,
            similarityScores: allScores,
            noveltyPenalty,
            buzzwordFlags,
        };
    }
}

// ────────────────────────────────────────────────────────────────────────────────
// Singleton Export
// ────────────────────────────────────────────────────────────────────────────────

export const ragEngine = new RAGEngine();
