import type {
    IdeaVersion,
    PersonaCritique,
    RAGContext,
    JudgeScore,
    JudgeType,
    ConvergenceMetrics,
} from "@/types";
import { JudgeScoreSchema } from "@/types";
import { openai, OPENAI_MODELS } from "@/lib/openai";

// ────────────────────────────────────────────────────────────────────────────────
// Token Estimation
// ────────────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ────────────────────────────────────────────────────────────────────────────────
// Result Types
// ────────────────────────────────────────────────────────────────────────────────

export interface JudgeResult {
    score: JudgeScore;
    tokensUsed: number;
}

export interface AllJudgesResult {
    scores: JudgeScore[];
    totalTokensUsed: number;
    perJudgeTokens: Record<string, number>;
    averageScore: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Buzzword Detection
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Detects overused buzzwords in text.
 * Returns an array of matched buzzwords (case-insensitive).
 *
 * Design decision: Buzzword detection is applied BEFORE scoring to penalize
 * innovation scores for ideas that rely on jargon over substance.
 */
const BUZZWORD_LIST = [
    "AI-powered",
    "blockchain",
    "revolutionary",
    "disruptive",
    "seamless",
    "leveraging",
    "cutting-edge",
    "game-changing",
    "paradigm shift",
    "end-to-end solution",
    "one-stop-shop",
    "next-gen",
    "smart solution",
] as const;

export function detectBuzzwords(text: string): string[] {
    const lowerText = text.toLowerCase();
    return BUZZWORD_LIST.filter((buzzword) => lowerText.includes(buzzword.toLowerCase()));
}

// ────────────────────────────────────────────────────────────────────────────────
// Score Utilities
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the mean overallScore from an array of JudgeScores.
 * Handles edge cases: empty arrays, NaN/undefined scores are filtered out.
 */
export function calculateAverageScore(scores: JudgeScore[]): number {
    const validScores = scores
        .map((s) => s.overallScore)
        .filter((s): s is number => typeof s === "number" && !Number.isNaN(s));

    if (validScores.length === 0) return 0;

    return validScores.reduce((sum, s) => sum + s, 0) / validScores.length;
}

/**
 * Multi-signal convergence check.
 *
 * An idea is considered converged when ALL conditions are met:
 * 1. averageScore >= 8.5 (high quality bar)
 * 2. minJudgeScore >= 7.0 (no single judge vetoes)
 * 3. noveltyScore >= 0.3 (not a rehash of existing ideas)
 * 4. feasibilityScore >= 7.0 (actually buildable)
 * 5. unresolvedCritiques <= 2 (most concerns addressed)
 * 6. NOT diminishing returns (still improving)
 * 7. All judges pass threshold
 */
export function checkConvergence(
    scores: JudgeScore[],
    metrics: ConvergenceMetrics,
): boolean {
    const avgScore = calculateAverageScore(scores);
    const minScore = Math.min(...scores.map((s) => s.overallScore));
    const allPass = scores.every((s) => s.passThreshold);

    return (
        avgScore >= 8.5 &&
        minScore >= 7.0 &&
        metrics.noveltyScore >= 0.3 &&
        metrics.feasibilityScore >= 7.0 &&
        metrics.unresolvedCritiques <= 2 &&
        !metrics.isDiminishingReturns &&
        allPass
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Judge System Prompts — Production-grade, domain-specific evaluation lenses
// ────────────────────────────────────────────────────────────────────────────────

const JUDGE_SCORE_JSON_SCHEMA = `{
  "judgeType": "<YOUR_JUDGE_TYPE>",
  "problemRelevance": <number 0.00-10.00>,
  "innovation": <number 0.00-10.00>,
  "feasibility": <number 0.00-10.00>,
  "userImpact": <number 0.00-10.00>,
  "presentation": <number 0.00-10.00>,
  "overallScore": <number 0.00-10.00>,
  "specificCritiques": ["critique 1", "critique 2", "critique 3"],
  "improvementDirectives": ["directive 1", "directive 2", "directive 3"],
  "passThreshold": <boolean — true ONLY if overallScore >= 8.8>
}`;

const SYSTEM_PROMPTS: Record<JudgeType, string> = {
    VC_JUDGE: `You are a top-tier VC partner who has seen 10,000 pitches. You invest in companies that can reach $100M ARR. You are evaluating this hackathon idea for its venture potential. You ask: Is there a real market? Is the team likely to execute? Is this defensible? You grade ruthlessly. An 8/10 from you means genuinely impressive. A 6/10 means "nice hobby project." You score each dimension out of 10.00. You provide 3 specific improvement directives if overallScore < 9.

You output ONLY valid JSON matching this exact schema:
${JUDGE_SCORE_JSON_SCHEMA}

Set judgeType to "VC_JUDGE". Set passThreshold to true ONLY if overallScore >= 8.8. Score rigorously — a 7 is already above average, an 8 is excellent, a 9+ is exceptional and rare. Your specificCritiques must cite exact parts of the idea. Your improvementDirectives must be actionable and specific, never generic.`,

    TECHNICAL_JUDGE: `You are a Principal Engineer at a top tech company with 20 years experience. You evaluate technical depth and credibility. You can spot: hand-wavy AI claims, undefined data pipelines, missing authentication considerations, no error handling, impossible performance claims, and "just use GPT-4" solutions. You score technical soundness harshly. A technically shallow idea scores max 6 from you regardless of other merits.

You output ONLY valid JSON matching this exact schema:
${JUDGE_SCORE_JSON_SCHEMA}

Set judgeType to "TECHNICAL_JUDGE". Set passThreshold to true ONLY if overallScore >= 8.8. Your specificCritiques must identify concrete technical gaps: missing data flows, unaddressed failure modes, naive architecture choices, or unfounded performance claims. Your improvementDirectives must propose specific technical solutions — not "improve the architecture" but "add a message queue between X and Y to handle backpressure."`,

    ACADEMIC_JUDGE: `You are a tenured CS professor specializing in AI systems. You evaluate: scientific rigor, novelty relative to existing research, methodological soundness, and whether claims are supported by evidence. You penalize: buzzword usage without understanding (blockchain, quantum, federated learning used incorrectly), unverifiable impact claims, and solutions that ignore existing literature. You reward: clear problem framing, testable hypotheses, reproducible approaches.

You output ONLY valid JSON matching this exact schema:
${JUDGE_SCORE_JSON_SCHEMA}

Set judgeType to "ACADEMIC_JUDGE". Set passThreshold to true ONLY if overallScore >= 8.8. Your specificCritiques must reference what existing work the idea ignores, which claims lack evidence, and where the methodology is unsound. Your improvementDirectives must suggest how to ground the idea in established research and make claims verifiable.`,

    INDUSTRY_JUDGE: `You are a CTO of a mid-size enterprise company. You evaluate: Does this solve a real enterprise or consumer pain point I've personally seen? Is this deployable in a real org? What are the procurement/compliance blockers? You are tired of student projects that don't understand real-world constraints. You give high scores only when you can imagine your company actually adopting this.

You output ONLY valid JSON matching this exact schema:
${JUDGE_SCORE_JSON_SCHEMA}

Set judgeType to "INDUSTRY_JUDGE". Set passThreshold to true ONLY if overallScore >= 8.8. Your specificCritiques must identify real-world deployment blockers: compliance requirements (SOC2, HIPAA, GDPR), integration challenges with existing systems, change management concerns, and procurement friction. Your improvementDirectives must explain how to make the solution enterprise-ready.`,

    EXECUTION_JUDGE: `You are a startup operator who has taken 3 companies from 0 to Series A. You evaluate execution credibility: Is the MVP scope realistic? Is the roadmap believable? Are the success metrics measurable? Does the team seem to understand what "launch" actually requires? You penalize vague impact statements like "will help millions of people." You reward: specific success metrics, defined MVP scope, realistic timelines, awareness of key dependencies.

You output ONLY valid JSON matching this exact schema:
${JUDGE_SCORE_JSON_SCHEMA}

Set judgeType to "EXECUTION_JUDGE". Set passThreshold to true ONLY if overallScore >= 8.8. Your specificCritiques must call out: unclear MVP scope, missing success metrics, unrealistic timelines, ignored dependencies, and "boil the ocean" feature lists. Your improvementDirectives must define what a credible 48-hour MVP looks like and what metrics to track from day one.`,
};

// ────────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ────────────────────────────────────────────────────────────────────────────────

function buildJudgeUserPrompt(
    idea: IdeaVersion,
    personaCritiques: PersonaCritique[],
    ragContext: RAGContext,
    buzzwordsFound: string[],
): string {
    let prompt = `## Hackathon Idea to Score (Iteration #${idea.iteration})

**Problem Statement:** ${idea.problemStatement}

**Proposed Solution:** ${idea.solution}

**Deliverable:** ${idea.deliverable}

**Technical Approach:** ${idea.technicalApproach}

**Expected Impact:** ${idea.expectedImpact}`;

    // Inject buzzword warnings for judges
    if (buzzwordsFound.length > 0) {
        prompt += `\n\n⚠️ **Buzzword Alert (${buzzwordsFound.length} detected):** ${buzzwordsFound.join(", ")}`;
        prompt += `\nBe especially skeptical of claims associated with these buzzwords. Penalize innovation score if substance doesn't match the language.`;
    }

    // Inject RAG context
    if (ragContext.retrievedChunks.length > 0) {
        prompt += `\n\n## Knowledge Base Context\n`;
        ragContext.retrievedChunks.forEach((chunk, i) => {
            const score = ragContext.similarityScores[i];
            prompt += `- [similarity: ${score?.toFixed(2) ?? "N/A"}] ${chunk}\n`;
        });
    }

    if (ragContext.noveltyPenalty > 0.3) {
        prompt += `\n⚠️ **Novelty Warning:** penalty=${ragContext.noveltyPenalty.toFixed(2)} — this idea is similar to existing ideas. Penalize innovation accordingly.`;
    }

    // Inject persona critique summary — judges see what personas said
    prompt += `\n\n---\n\n## Persona Critiques Summary\n`;
    personaCritiques.forEach((c) => {
        prompt += `### ${c.personaType} (priority: ${c.priorityScore}/10)\n`;
        prompt += `Strengths: ${c.strengths.join("; ") || "None"}\n`;
        prompt += `Weaknesses: ${c.weaknesses.join("; ") || "None"}\n`;
        prompt += `Refinements: ${c.suggestedRefinements.join("; ") || "None"}\n\n`;
    });

    prompt += `\nScore this idea HARSHLY but FAIRLY. A 7 is above average. An 8 is excellent. 9+ is exceptional.`;

    return prompt;
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
                console.warn(`[judges] API call failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`, err);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ────────────────────────────────────────────────────────────────────────────────
// Buzzword Score Penalty
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Apply innovation score penalty for excessive buzzword usage.
 * If buzzwords > 3: reduce innovation by 0.5 per excess buzzword.
 * Also enforce passThreshold: false if overallScore < 8.8.
 */
function applyScoreEnforcement(score: JudgeScore, buzzwordCount: number): JudgeScore {
    let adjustedInnovation = score.innovation;

    if (buzzwordCount > 3) {
        const penalty = (buzzwordCount - 3) * 0.5;
        adjustedInnovation = Math.max(0, score.innovation - penalty);
    }

    // Recalculate overall if innovation was penalized
    const adjustedOverall =
        adjustedInnovation !== score.innovation
            ? Math.max(
                0,
                score.overallScore - (score.innovation - adjustedInnovation) / 5,
            )
            : score.overallScore;

    return {
        ...score,
        innovation: Number(adjustedInnovation.toFixed(2)),
        overallScore: Number(adjustedOverall.toFixed(2)),
        passThreshold: adjustedOverall >= 8.8,
    };
}

// ────────────────────────────────────────────────────────────────────────────────
// Core Judge Runner
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Run a single judge agent against an idea version.
 *
 * Flow:
 * 1. Detect buzzwords in the idea text
 * 2. Build prompt with idea + persona critiques + RAG context + buzzword warnings
 * 3. Call OpenAI (gpt-4o, temp 0.3 for consistent scoring, json_object format)
 * 4. Parse and validate with JudgeScoreSchema (Zod)
 * 5. On validation failure: retry once with error context
 * 6. Apply score enforcement (buzzword penalty + passThreshold recalc)
 * 7. Track token usage
 */
export async function runJudge(
    judgeType: JudgeType,
    idea: IdeaVersion,
    personaCritiques: PersonaCritique[],
    ragContext: RAGContext,
): Promise<JudgeResult> {
    const systemPrompt = SYSTEM_PROMPTS[judgeType];

    // Detect buzzwords across all idea text fields
    const ideaFullText = [
        idea.problemStatement,
        idea.solution,
        idea.deliverable,
        idea.technicalApproach,
        idea.expectedImpact,
    ].join(" ");
    const buzzwordsFound = detectBuzzwords(ideaFullText);

    const userPrompt = buildJudgeUserPrompt(idea, personaCritiques, ragContext, buzzwordsFound);

    const callOpenAI = async (extraInstruction?: string) => {
        const messages: Array<{ role: "system" | "user"; content: string }> = [
            { role: "system", content: systemPrompt },
            { role: "user", content: extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt },
        ];

        return withRetry(() =>
            openai.chat.completions.create({
                model: OPENAI_MODELS.AGENT,
                messages,
                temperature: 0.3, // Lower temp for judges — consistent, rigorous scoring
                max_tokens: 1200,
                response_format: { type: "json_object" },
            }),
        );
    };

    // First attempt
    const completion = await callOpenAI();
    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const tokensUsed = completion.usage?.total_tokens ?? estimateTokens(systemPrompt + userPrompt + rawContent);

    let parsed: unknown;
    try {
        parsed = JSON.parse(rawContent);
    } catch {
        throw new Error(`[judges/${judgeType}] Invalid JSON from OpenAI: ${rawContent.slice(0, 200)}`);
    }

    // Zod validation — first attempt
    const validation = JudgeScoreSchema.safeParse(parsed);

    if (validation.success) {
        const enforced = applyScoreEnforcement(validation.data, buzzwordsFound.length);
        return { score: enforced, tokensUsed };
    }

    // Zod validation failed — retry once with error context
    console.warn(`[judges/${judgeType}] Zod validation failed, retrying with error context:`, validation.error.message);

    const retryInstruction =
        `⚠️ YOUR PREVIOUS RESPONSE FAILED VALIDATION. Fix these errors and try again:\n` +
        `${validation.error.message}\n\n` +
        `Remember: judgeType MUST be exactly "${judgeType}". ` +
        `All score fields (problemRelevance, innovation, feasibility, userImpact, presentation, overallScore) MUST be numbers 0-10. ` +
        `specificCritiques and improvementDirectives MUST be arrays of strings. ` +
        `passThreshold MUST be a boolean (true only if overallScore >= 8.8).`;

    const retryCompletion = await callOpenAI(retryInstruction);
    const retryContent = retryCompletion.choices[0]?.message?.content ?? "{}";
    const retryTokens = retryCompletion.usage?.total_tokens ?? estimateTokens(retryContent);

    let retryParsed: unknown;
    try {
        retryParsed = JSON.parse(retryContent);
    } catch {
        throw new Error(`[judges/${judgeType}] Invalid JSON on retry: ${retryContent.slice(0, 200)}`);
    }

    const retryValidation = JudgeScoreSchema.safeParse(retryParsed);

    if (retryValidation.success) {
        const enforced = applyScoreEnforcement(retryValidation.data, buzzwordsFound.length);
        return { score: enforced, tokensUsed: tokensUsed + retryTokens };
    }

    throw new Error(`[judges/${judgeType}] Zod validation failed after retry: ${retryValidation.error.message}`);
}

// ────────────────────────────────────────────────────────────────────────────────
// Parallel Judge Orchestrator
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Run ALL 5 judge agents in parallel against an idea version.
 *
 * Judges are MORE HARSH than personas — they decide pass/fail.
 * All 5 fire simultaneously via Promise.all.
 * Individual judge failures return a zeroed-out score (fail-safe).
 */
export async function runAllJudges(
    idea: IdeaVersion,
    personaCritiques: PersonaCritique[],
    ragContext: RAGContext,
): Promise<AllJudgesResult> {
    const judgeTypes: JudgeType[] = [
        "VC_JUDGE",
        "TECHNICAL_JUDGE",
        "ACADEMIC_JUDGE",
        "INDUSTRY_JUDGE",
        "EXECUTION_JUDGE",
    ];

    const results = await Promise.all(
        judgeTypes.map(async (judgeType): Promise<JudgeResult> => {
            try {
                return await runJudge(judgeType, idea, personaCritiques, ragContext);
            } catch (err) {
                console.error(`[judges] ${judgeType} failed entirely:`, err);
                return {
                    score: {
                        judgeType,
                        problemRelevance: 0,
                        innovation: 0,
                        feasibility: 0,
                        userImpact: 0,
                        presentation: 0,
                        overallScore: 0,
                        specificCritiques: [`Judge agent failed: ${String(err)}`],
                        improvementDirectives: [],
                        passThreshold: false,
                    },
                    tokensUsed: 0,
                };
            }
        }),
    );

    const perJudgeTokens: Record<string, number> = {};
    let totalTokensUsed = 0;

    for (const result of results) {
        perJudgeTokens[result.score.judgeType] = result.tokensUsed;
        totalTokensUsed += result.tokensUsed;
    }

    const scores = results.map((r) => r.score);

    return {
        scores,
        totalTokensUsed,
        perJudgeTokens,
        averageScore: calculateAverageScore(scores),
    };
}
