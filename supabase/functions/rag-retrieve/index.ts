import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiApiKey) {
    throw new Error("[IDEAForge] OPENAI_API_KEY not set. Add it via: supabase secrets set OPENAI_API_KEY=sk-...");
}
const openai = new OpenAI({ apiKey: openaiApiKey });

const MODELS = {
    EMBEDDING: "text-embedding-3-large" as const,
} as const;

async function generateEmbedding(text: string): Promise<{ embedding: number[]; tokensUsed: number }> {
    const response = await openai.embeddings.create({ model: MODELS.EMBEDDING, input: text });
    return {
        embedding: response.data[0].embedding,
        tokensUsed: response.usage?.total_tokens ?? 0,
    };
}

interface RagRetrieveRequest {
    query: string;
    domain: string;
    ideaEmbedding?: number[];
}

interface RagRetrieveResponse {
    winningPatterns: Array<{ id: string; title: string; content: string; similarity: number }>;
    failurePatterns: Array<{ failureType: string; description: string; similarity: number }>;
    noveltyPenalty: number;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body: RagRetrieveRequest = await req.json();

        if (!body.query || typeof body.query !== "string") {
            return new Response(
                JSON.stringify({ error: "query is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let queryEmbedding: number[];
        let embeddingTokens = 0;

        if (body.ideaEmbedding && body.ideaEmbedding.length === 1536) {
            queryEmbedding = body.ideaEmbedding;
        } else {
            const result = await generateEmbedding(body.query);
            queryEmbedding = result.embedding;
            embeddingTokens = result.tokensUsed;
        }

        const { data: winningPatterns, error: ragError } = await supabaseAdmin.rpc(
            "match_rag_knowledge",
            {
                query_embedding: JSON.stringify(queryEmbedding),
                match_threshold: 0.5,
                match_count: 5,
                filter_content_type: null,
            }
        );

        if (ragError) {
            console.error("[rag-retrieve] RAG search error:", ragError);
        }

        const { data: failurePatterns, error: failureError } = await supabaseAdmin.rpc(
            "check_failure_similarity",
            {
                query_embedding: JSON.stringify(queryEmbedding),
                threshold: 0.6,
            }
        );

        if (failureError) {
            console.error("[rag-retrieve] Failure check error:", failureError);
        }

        let noveltyPenalty = 0;

        const { data: similarIdeas, error: noveltyError } = await supabaseAdmin
            .from("idea_versions")
            .select("id")
            .not("embedding", "is", null)
            .limit(1);

        if (!noveltyError && similarIdeas && similarIdeas.length > 0) {
            const { data: noveltyResults } = await supabaseAdmin.rpc(
                "match_rag_knowledge",
                {
                    query_embedding: JSON.stringify(queryEmbedding),
                    match_threshold: 0.85,
                    match_count: 1,
                    filter_content_type: "winning_idea",
                }
            );

            if (noveltyResults && noveltyResults.length > 0) {
                const maxSimilarity = noveltyResults[0].similarity;
                noveltyPenalty = Math.max(0, (maxSimilarity - 0.85) / 0.15);
            }
        }

        const response: RagRetrieveResponse = {
            winningPatterns: (winningPatterns ?? []).map((p: Record<string, unknown>) => ({
                id: p.id as string,
                title: (p.title as string) ?? "",
                content: p.content as string,
                similarity: p.similarity as number,
            })),
            failurePatterns: (failurePatterns ?? []).slice(0, 3).map((f: Record<string, unknown>) => ({
                failureType: f.failure_type as string,
                description: f.failure_description as string,
                similarity: f.similarity as number,
            })),
            noveltyPenalty,
        };

        console.log(
            `[rag-retrieve] Found ${response.winningPatterns.length} winning patterns, ` +
            `${response.failurePatterns.length} failure patterns, ` +
            `novelty penalty: ${noveltyPenalty.toFixed(3)}, ` +
            `embedding tokens: ${embeddingTokens}`
        );

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("[rag-retrieve] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: "RAG retrieval failed", details: String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
