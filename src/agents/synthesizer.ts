import type {
    IdeaVersion,
    PersonaCritique,
    JudgeScore,
    RAGContext,
    IterationLog,
} from "@/types";
import { IdeaVersionSchema } from "@/types";
import { openai, OPENAI_MODELS } from "@/lib/openai";

// ────────────────────────────────────────────────────────────────────────────────
// Token Estimation
// ────────────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ────────────────────────────────────────────────────────────────────────────────
// Retry Utilities
// ────────────────────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`[synthesizer] API call failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`, err);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ────────────────────────────────────────────────────────────────────────────────
// Synthesizer Result Type
// ────────────────────────────────────────────────────────────────────────────────

export interface SynthesizerResult {
    idea: IdeaVersion;
    tokensUsed: number;
    wordCountDelta: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Math Utilities
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
}

/** Count words in a text string. */
function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Get total word count across all fields of an IdeaVersion. */
function ideaWordCount(idea: IdeaVersion): number {
    return (
        wordCount(idea.problemStatement) +
        wordCount(idea.solution) +
        wordCount(idea.deliverable) +
        wordCount(idea.technicalApproach) +
        wordCount(idea.expectedImpact)
    );
}

/** Generate an embedding vector for text using OpenAI. */
async function embed(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
        model: OPENAI_MODELS.EMBEDDING,
        input: text,
    });
    return response.data[0].embedding;
}

/** Flatten an IdeaVersion into a single text string for embedding. */
function ideaToText(idea: IdeaVersion): string {
    return [
        idea.problemStatement,
        idea.solution,
        idea.deliverable,
        idea.technicalApproach,
        idea.expectedImpact,
    ].join(" ");
}

// ────────────────────────────────────────────────────────────────────────────────
// System Prompt
// ────────────────────────────────────────────────────────────────────────────────

const SYNTHESIZER_SYSTEM_PROMPT = `You are the Meta-Synthesizer AI. You have received critiques from 7 expert personas and harsh scores from 5 judges on a hackathon idea. Your job is to produce a significantly improved version of the idea that specifically addresses every identified weakness while preserving every identified strength.

RULES:
1. Address EVERY critique marked as 'high priority' (priorityScore > 7) — do not skip any
2. Do not introduce new unproven claims to patch weaknesses — be honest
3. If a weakness cannot be resolved, acknowledge it and propose a constraint
4. Do not lose core novelty while fixing feasibility issues
5. The improved idea must be MORE specific, not more vague
6. Technical details must be more concrete in each iteration
7. Preserve the unique differentiator — never sand it away
8. Each iteration must measurably improve at least 2 score dimensions

ANTI-PATTERNS TO AVOID:
- Adding buzzwords to sound innovative
- Making claims broader to avoid specificity
- Ignoring critique and repeating same content
- Over-engineering the solution to the point of infeasibility
- Copying competitor patterns from RAG context

You MUST output ONLY valid JSON matching this exact schema:
{
  "problemStatement": "string — a clear, specific problem definition (more concrete than the previous version)",
  "solution": "string — the refined solution addressing persona critiques",
  "deliverable": "string — what will be built and demoed in 48 hours",
  "technicalApproach": "string — concrete technical implementation details (languages, frameworks, data flows, APIs)",
  "expectedImpact": "string — specific, measurable impact metrics (not vague 'help millions' claims)"
}

Do NOT include id, iteration, or createdAt — those are set by the system.`;

// ────────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ────────────────────────────────────────────────────────────────────────────────

function buildSynthesizerPrompt(
    previousIdea: IdeaVersion,
    personaCritiques: PersonaCritique[],
    judgeScores: JudgeScore[],
    ragContext: RAGContext,
    iterationNumber: number,
): string {
    // Sort critiques by priority (highest first) so the model focuses on urgent ones
    const sortedCritiques = [...personaCritiques].sort(
        (a, b) => b.priorityScore - a.priorityScore,
    );

    let prompt = `## Iteration ${iterationNumber} — Synthesize an Improved Idea

### Previous Idea Version (Iteration #${previousIdea.iteration})

**Problem Statement:** ${previousIdea.problemStatement}

**Solution:** ${previousIdea.solution}

**Deliverable:** ${previousIdea.deliverable}

**Technical Approach:** ${previousIdea.technicalApproach}

**Expected Impact:** ${previousIdea.expectedImpact}

---

### Persona Critiques (sorted by priority, highest first)

`;

    for (const critique of sortedCritiques) {
        const urgency = critique.priorityScore > 7 ? "🔴 HIGH PRIORITY" : critique.priorityScore > 4 ? "🟡 MEDIUM" : "🟢 LOW";
        prompt += `#### ${critique.personaType} — ${urgency} (${critique.priorityScore}/10)\n`;
        prompt += `**Strengths:** ${critique.strengths.join("; ") || "None identified"}\n`;
        prompt += `**Weaknesses:** ${critique.weaknesses.join("; ") || "None identified"}\n`;
        prompt += `**Refinements:** ${critique.suggestedRefinements.join("; ") || "None suggested"}\n\n`;
    }

    prompt += `---\n\n### Judge Scores\n\n`;
    prompt += `| Judge | Overall | Relevance | Innovation | Feasibility | Impact | Presentation | Pass |\n`;
    prompt += `|-------|---------|-----------|------------|-------------|--------|-------------|------|\n`;

    for (const score of judgeScores) {
        prompt += `| ${score.judgeType} | ${score.overallScore.toFixed(1)} | ${score.problemRelevance.toFixed(1)} | ${score.innovation.toFixed(1)} | ${score.feasibility.toFixed(1)} | ${score.userImpact.toFixed(1)} | ${score.presentation.toFixed(1)} | ${score.passThreshold ? "✅" : "❌"} |\n`;
    }

    // Identify the weakest dimensions for focused improvement
    const avgByDimension = {
        problemRelevance: judgeScores.reduce((s, j) => s + j.problemRelevance, 0) / judgeScores.length,
        innovation: judgeScores.reduce((s, j) => s + j.innovation, 0) / judgeScores.length,
        feasibility: judgeScores.reduce((s, j) => s + j.feasibility, 0) / judgeScores.length,
        userImpact: judgeScores.reduce((s, j) => s + j.userImpact, 0) / judgeScores.length,
        presentation: judgeScores.reduce((s, j) => s + j.presentation, 0) / judgeScores.length,
    };

    const weakestDimensions = Object.entries(avgByDimension)
        .sort(([, a], [, b]) => a - b)
        .slice(0, 2)
        .map(([dim, score]) => `${dim}: ${score.toFixed(2)}`);

    prompt += `\n**⚠️ Weakest dimensions to improve:** ${weakestDimensions.join(", ")}\n`;

    // Aggregate improvement directives from judges
    const allDirectives = judgeScores.flatMap((s) => s.improvementDirectives);
    if (allDirectives.length > 0) {
        prompt += `\n### Judge Improvement Directives\n`;
        for (const directive of allDirectives) {
            prompt += `- ${directive}\n`;
        }
    }

    // RAG context
    if (ragContext.retrievedChunks.length > 0) {
        prompt += `\n---\n\n### Knowledge Base Context (DO NOT copy — use for grounding only)\n`;
        ragContext.retrievedChunks.forEach((chunk, i) => {
            const score = ragContext.similarityScores[i];
            prompt += `- [similarity: ${score?.toFixed(2) ?? "N/A"}] ${chunk}\n`;
        });
    }

    if (ragContext.noveltyPenalty > 0.3) {
        prompt += `\n⚠️ **Novelty penalty: ${ragContext.noveltyPenalty.toFixed(2)}** — your improved version MUST be more differentiated, not less.`;
    }

    prompt += `\n\n---\n\n**CRITICAL:** The improved idea MUST be more specific and detailed than the previous version. Do NOT make it more vague. Address the high-priority critiques above.`;

    return prompt;
}

// ────────────────────────────────────────────────────────────────────────────────
// Core Synthesizer
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Synthesize an improved idea version from persona critiques and judge scores.
 *
 * Flow:
 * 1. Build a comprehensive prompt with all critiques, scores, and RAG context
 * 2. Call OpenAI (gpt-4o, temp 0.7, max_tokens 3000, json_object format)
 * 3. Parse and validate with IdeaVersionSchema (partial — system adds id/iteration/createdAt)
 * 4. On Zod validation failure: retry once with error context
 * 5. Enforce word count growth: output must be >= previous version's word count
 * 6. Return the new IdeaVersion with system-generated metadata
 */
export async function synthesizeImprovedIdea(
    previousIdea: IdeaVersion,
    personaCritiques: PersonaCritique[],
    judgeScores: JudgeScore[],
    ragContext: RAGContext,
    iterationNumber: number,
): Promise<SynthesizerResult> {
    const userPrompt = buildSynthesizerPrompt(
        previousIdea,
        personaCritiques,
        judgeScores,
        ragContext,
        iterationNumber,
    );

    const callOpenAI = async (extraInstruction?: string) => {
        const messages: Array<{ role: "system" | "user"; content: string }> = [
            { role: "system", content: SYNTHESIZER_SYSTEM_PROMPT },
            { role: "user", content: extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt },
        ];

        return withRetry(() =>
            openai.chat.completions.create({
                model: OPENAI_MODELS.AGENT,
                messages,
                temperature: 0.7,
                max_tokens: 3000,
                response_format: { type: "json_object" },
            }),
        );
    };

    // First attempt
    const completion = await callOpenAI();
    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const tokensUsed = completion.usage?.total_tokens ?? estimateTokens(SYNTHESIZER_SYSTEM_PROMPT + userPrompt + rawContent);

    const parsedRaw = parseAndBuildIdea(rawContent, iterationNumber);

    if (parsedRaw.success) {
        const wc = ideaWordCount(parsedRaw.idea);
        const prevWc = ideaWordCount(previousIdea);
        return { idea: parsedRaw.idea, tokensUsed, wordCountDelta: wc - prevWc };
    }

    // Retry with error context
    console.warn(`[synthesizer] Validation failed, retrying:`, parsedRaw.error);

    const retryInstruction =
        `⚠️ YOUR PREVIOUS RESPONSE FAILED VALIDATION. Fix these errors:\n` +
        `${parsedRaw.error}\n\n` +
        `You MUST output JSON with these exact fields: problemStatement, solution, deliverable, technicalApproach, expectedImpact. ` +
        `All fields must be non-empty strings. Do NOT include id, iteration, or createdAt.`;

    const retryCompletion = await callOpenAI(retryInstruction);
    const retryContent = retryCompletion.choices[0]?.message?.content ?? "{}";
    const retryTokens = retryCompletion.usage?.total_tokens ?? estimateTokens(retryContent);

    const retryParsed = parseAndBuildIdea(retryContent, iterationNumber);

    if (retryParsed.success) {
        const wc = ideaWordCount(retryParsed.idea);
        const prevWc = ideaWordCount(previousIdea);
        return {
            idea: retryParsed.idea,
            tokensUsed: tokensUsed + retryTokens,
            wordCountDelta: wc - prevWc,
        };
    }

    throw new Error(`[synthesizer] Validation failed after retry: ${retryParsed.error}`);
}

/**
 * Parse raw JSON from OpenAI, inject system-generated fields (id, iteration, createdAt),
 * and validate against IdeaVersionSchema.
 */
function parseAndBuildIdea(
    rawJson: string,
    iterationNumber: number,
): { success: true; idea: IdeaVersion } | { success: false; error: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(rawJson);
    } catch {
        return { success: false, error: `Invalid JSON: ${rawJson.slice(0, 200)}` };
    }

    // Inject system-generated fields the LLM doesn't produce
    const enriched = {
        ...(parsed as Record<string, unknown>),
        id: crypto.randomUUID(),
        iteration: iterationNumber,
        createdAt: new Date().toISOString(),
    };

    const validation = IdeaVersionSchema.safeParse(enriched);

    if (validation.success) {
        return { success: true, idea: validation.data };
    }

    return { success: false, error: validation.error.message };
}

// ────────────────────────────────────────────────────────────────────────────────
// Drift Detection
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Detect how much an idea has "drifted" between two iterations.
 *
 * Uses OpenAI text-embedding-3-large to embed both idea versions, then
 * computes 1 - cosineSimilarity. A drift score > 0.6 (similarity < 0.4)
 * means the idea changed so much it's effectively a different idea.
 *
 * @returns Drift score 0-1 (0 = identical, 1 = completely different)
 */
export async function detectIdeaDrift(
    v1: IdeaVersion,
    v2: IdeaVersion,
): Promise<number> {
    const [embedding1, embedding2] = await Promise.all([
        embed(ideaToText(v1)),
        embed(ideaToText(v2)),
    ]);

    const similarity = cosineSimilarity(embedding1, embedding2);

    // Drift = 1 - similarity. Clamp to [0, 1].
    const drift = Math.max(0, Math.min(1, 1 - similarity));

    if (drift > 0.6) {
        console.warn(
            `[synthesizer] ⚠️ DANGEROUS DRIFT detected: ${drift.toFixed(3)} ` +
            `(similarity: ${similarity.toFixed(3)}). Idea changed too much between ` +
            `iteration ${v1.iteration} → ${v2.iteration}.`,
        );
    }

    return drift;
}

// ────────────────────────────────────────────────────────────────────────────────
// Groupthink Detection
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Detect if all persona critiques are converging to the same suggestions,
 * indicating groupthink (loss of adversarial diversity).
 *
 * Embeds every persona's suggestedRefinements, then checks if the pairwise
 * cosine similarity across all personas exceeds 0.85. If groupthink is
 * detected, the orchestrator should inject a contrarian prompt.
 *
 * @returns true if groupthink is detected (all pairs > 0.85 similarity)
 */
export async function detectGroupthink(
    critiques: PersonaCritique[],
): Promise<boolean> {
    if (critiques.length < 2) return false;

    // Embed each persona's suggestions as a single text block
    const texts = critiques.map(
        (c) => c.suggestedRefinements.join(". ") || "No suggestions",
    );

    const embeddings = await Promise.all(texts.map(embed));

    // Check all pairwise similarities
    let allAboveThreshold = true;
    for (let i = 0; i < embeddings.length && allAboveThreshold; i++) {
        for (let j = i + 1; j < embeddings.length; j++) {
            const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
            if (similarity < 0.85) {
                allAboveThreshold = false;
                break;
            }
        }
    }

    if (allAboveThreshold) {
        console.warn(
            `[synthesizer] ⚠️ GROUPTHINK detected — all ${critiques.length} personas ` +
            `have similarity > 0.85 in their suggestions. Adversarial diversity is lost.`,
        );
    }

    return allAboveThreshold;
}

// ────────────────────────────────────────────────────────────────────────────────
// Diminishing Returns Detection
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Detect if the adversarial loop has plateaued and incremental refinement
 * is no longer producing meaningful improvement.
 *
 * Checks the last 5 iteration logs: if the average score improved by less
 * than 0.05 total across those iterations, returns true.
 *
 * When diminishing returns are detected, the orchestrator should trigger a
 * radical pivot instead of another incremental refinement cycle.
 *
 * @returns true if last 5 iterations show < 0.05 total improvement
 */
export function detectDiminishingReturns(logs: IterationLog[]): boolean {
    if (logs.length < 5) return false;

    // Get the last 5 logs sorted by iteration number (ascending)
    const recent = [...logs]
        .sort((a, b) => a.iterationNumber - b.iterationNumber)
        .slice(-5);

    const firstScore = recent[0].averageScore;
    const lastScore = recent[recent.length - 1].averageScore;
    const totalImprovement = lastScore - firstScore;

    if (Math.abs(totalImprovement) < 0.05) {
        console.warn(
            `[synthesizer] ⚠️ DIMINISHING RETURNS detected — last 5 iterations ` +
            `improved by only ${totalImprovement.toFixed(4)} ` +
            `(${firstScore.toFixed(2)} → ${lastScore.toFixed(2)}). ` +
            `Consider triggering a radical pivot.`,
        );
        return true;
    }

    return false;
}
