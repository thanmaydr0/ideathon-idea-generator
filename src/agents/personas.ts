import type { IdeaVersion, PersonaCritique, RAGContext, PersonaType } from "@/types";
import { PersonaCritiqueSchema } from "@/types";
import { openai, OPENAI_MODELS } from "@/lib/openai";

// ────────────────────────────────────────────────────────────────────────────────
// Token Estimation
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Rough token estimator. Avoids bundling tiktoken (>4MB WASM) for the browser.
 * Approximation: ~4 characters per token for English text. GPT tokenizers
 * average 3.5–4.5 depending on vocabulary, so 4 is a safe middle ground.
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ────────────────────────────────────────────────────────────────────────────────
// Persona Result Type (internal)
// ────────────────────────────────────────────────────────────────────────────────

export interface PersonaResult {
    critique: PersonaCritique;
    tokensUsed: number;
}

export interface AllPersonasResult {
    critiques: PersonaCritique[];
    totalTokensUsed: number;
    perPersonaTokens: Record<string, number>;
}

// ────────────────────────────────────────────────────────────────────────────────
// System Prompts — Full, production-grade persona definitions
// ────────────────────────────────────────────────────────────────────────────────

const PERSONA_CRITIQUE_JSON_SCHEMA = `{
  "personaType": "<YOUR_PERSONA_TYPE>",
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific weakness 1", "specific weakness 2"],
  "suggestedRefinements": ["actionable refinement 1", "actionable refinement 2"],
  "priorityScore": <number 0-10, how urgently your concerns need addressing>
}`;

const SYSTEM_PROMPTS: Record<PersonaType, string> = {
    VISIONARY: `You are the Visionary on a hackathon idea evaluation team. Your role is to assess the 10-year potential of an idea. You think in paradigm shifts. You ask: "Does this idea change behavior, not just optimize it?" You are inspired by ideas that create new markets, not just serve existing ones. You are brutal about ideas that are incremental. Score potential on a 1-10 scale. You cite real-world analogies.

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "VISIONARY". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight transformative potential. Your weaknesses should focus on: lack of ambition, derivative thinking, small TAM, incremental rather than paradigm-shifting approaches. Your suggestedRefinements should push toward 10x thinking, not 10% improvements.`,

    SYSTEMS_ARCHITECT: `You are the Systems Architect. You evaluate technical architecture depth. You ask: Does this system have clear data flows? Is the tech stack defensible? Is there a real engineering challenge being solved, not just API glue? You flag: over-reliance on single APIs, no offline resilience, no error handling design, no scalability consideration. You are deeply skeptical of "AI-powered X" ideas with no novel AI architecture.

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "SYSTEMS_ARCHITECT". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight sound architecture and genuine technical depth. Your weaknesses should focus on: overengineering, infeasible tech, missing architecture, vague technical claims, single points of failure, no data flow clarity. Your suggestedRefinements should propose concrete architectural improvements.`,

    MARKET_STRATEGIST: `You are the Market Strategist. You evaluate market size, competition landscape, go-to-market viability, and monetization clarity. You research: Who are the top 3 competitors? What is the TAM? Is the go-to-market realistic for a student team? You penalize ideas targeting imaginary markets. You reward ideas with clear beachhead strategies.

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "MARKET_STRATEGIST". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight clear PMF signals and viable GTM strategies. Your weaknesses should focus on: no PMF, crowded market, unclear monetization, unrealistic TAM claims, missing competitor analysis. Your suggestedRefinements should propose concrete beachhead markets and distribution channels.`,

    UX_THINKER: `You are the UX Thinker. You evaluate user experience design quality. You ask: Who exactly is the user? What is the core user journey? Does this solution add friction or remove it? You think in user stories and edge cases. You are critical of solutions that assume users will change their behavior dramatically. You reward minimal viable user journeys.

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "UX_THINKER". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight intuitive flows and user-centric design. Your weaknesses should focus on: poor UX, high friction, inaccessibility, complexity, unclear user persona, assumption of behavior change. Your suggestedRefinements should propose concrete user journey simplifications and edge case handling.`,

    RISK_ANALYST: `You are the Risk Analyst. You identify every way this idea can fail. Regulatory risks. Technical risks. Adoption risks. Dependency risks. Data risks. Privacy risks. You categorize risks as Critical/High/Medium/Low. You suggest specific mitigations, not generic ones. You do not accept "we'll figure it out later."

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "RISK_ANALYST". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight well-mitigated risks and robust fallback strategies. Your weaknesses should categorize each risk (Critical/High/Medium/Low) and explain its impact. Your suggestedRefinements should propose specific, actionable mitigations for every Critical and High risk identified.`,

    ETHICS_REVIEWER: `You are the Ethics Reviewer. You evaluate: data privacy implications, algorithmic bias risks, potential for misuse, accessibility considerations, environmental impact of compute, and equity of access. You are strict about ideas that could harm vulnerable populations. You flag ideas that collect unnecessary data. You reward privacy-by-design approaches.

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "ETHICS_REVIEWER". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight privacy-by-design, inclusive design, and responsible AI practices. Your weaknesses should focus on: bias risk, unnecessary data collection, privacy violations, accessibility gaps, environmental cost, potential for misuse. Your suggestedRefinements should propose concrete ethical safeguards and privacy-preserving alternatives.`,

    COMPETITIVE_ANALYST: `You are the Competitive Analyst. You research and simulate: What are the top 5 existing solutions? What is this idea's unfair advantage? Is this truly novel or is it [existing product] with a new UI? You penalize: "Uber for X", "Airbnb for X", "ChatGPT for X" ideas with no differentiation. You reward: novel data moats, unique distribution, defensible tech.

You output ONLY valid JSON matching this exact schema:
${PERSONA_CRITIQUE_JSON_SCHEMA}

Set personaType to "COMPETITIVE_ANALYST". Be specific — cite exact parts of the idea. Do NOT be generic. Your strengths should highlight genuine differentiation and defensible moats. Your weaknesses should focus on: no moat, existing solutions that already do this, easy to replicate, "wrapper" ideas with no defensibility. Your suggestedRefinements should propose concrete ways to build defensibility — proprietary data, network effects, regulatory advantages, or unique distribution.`,
};

// ────────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ────────────────────────────────────────────────────────────────────────────────

function buildUserPrompt(
    idea: IdeaVersion,
    ragContext: RAGContext,
    previousCritiques?: PersonaCritique[],
): string {
    let prompt = `## Hackathon Idea to Evaluate (Iteration #${idea.iteration})

**Problem Statement:** ${idea.problemStatement}

**Proposed Solution:** ${idea.solution}

**Deliverable:** ${idea.deliverable}

**Technical Approach:** ${idea.technicalApproach}

**Expected Impact:** ${idea.expectedImpact}`;

    if (ragContext.retrievedChunks.length > 0) {
        prompt += `\n\n## Reference Context (from knowledge base)\n`;
        ragContext.retrievedChunks.forEach((chunk, i) => {
            const score = ragContext.similarityScores[i];
            prompt += `- [similarity: ${score?.toFixed(2) ?? "N/A"}] ${chunk}\n`;
        });
    }

    if (ragContext.buzzwordFlags.length > 0) {
        prompt += `\n\n⚠️ **Buzzword Flags Detected:** ${ragContext.buzzwordFlags.join(", ")}`;
        prompt += `\nBe especially critical of claims related to these buzzwords.`;
    }

    if (ragContext.noveltyPenalty > 0.3) {
        prompt += `\n\n⚠️ **Low Novelty Warning:** This idea has a novelty penalty of ${ragContext.noveltyPenalty.toFixed(2)} (1.0 = duplicate). Push hard for differentiation.`;
    }

    if (previousCritiques && previousCritiques.length > 0) {
        prompt += `\n\n## Previous Iteration Critiques (for context)\n`;
        previousCritiques.forEach((c) => {
            prompt += `### ${c.personaType} (priority: ${c.priorityScore}/10)\n`;
            prompt += `Weaknesses: ${c.weaknesses.join("; ") || "None"}\n`;
            prompt += `Refinements: ${c.suggestedRefinements.join("; ") || "None"}\n\n`;
        });
        prompt += `Address unresolved high-priority concerns from previous critiques where relevant to your persona.`;
    }

    return prompt;
}

// ────────────────────────────────────────────────────────────────────────────────
// Retry Utilities
// ────────────────────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff retry for API calls.
 * Delays: 1s → 2s → 4s (max 3 retries).
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(
                    `[personas] API call failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`,
                    err,
                );
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ────────────────────────────────────────────────────────────────────────────────
// Core Persona Runner
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Run a single persona agent against an idea version.
 *
 * Flow:
 * 1. Build the prompt from idea + RAG context + previous critiques
 * 2. Call OpenAI with structured JSON output (response_format: json_object)
 * 3. Parse the JSON response
 * 4. Validate with PersonaCritiqueSchema (Zod)
 * 5. If validation fails: retry once with the Zod error injected into the prompt
 * 6. If API call fails: retry with exponential backoff (max 3 retries)
 * 7. Track token usage from completion.usage or fall back to estimation
 */
export async function runPersona(
    personaType: PersonaType,
    idea: IdeaVersion,
    ragContext: RAGContext,
    previousCritiques?: PersonaCritique[],
): Promise<PersonaResult> {
    const systemPrompt = SYSTEM_PROMPTS[personaType];
    const userPrompt = buildUserPrompt(idea, ragContext, previousCritiques);

    const callOpenAI = async (extraInstruction?: string) => {
        const messages: Array<{ role: "system" | "user"; content: string }> = [
            { role: "system", content: systemPrompt },
            { role: "user", content: extraInstruction ? `${userPrompt}\n\n${extraInstruction}` : userPrompt },
        ];

        return withRetry(() =>
            openai.chat.completions.create({
                model: OPENAI_MODELS.AGENT,
                messages,
                temperature: 0.7,
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
        throw new Error(`[personas/${personaType}] Invalid JSON from OpenAI: ${rawContent.slice(0, 200)}`);
    }

    // Zod validation — first attempt
    const validation = PersonaCritiqueSchema.safeParse(parsed);

    if (validation.success) {
        return { critique: validation.data, tokensUsed };
    }

    // Zod validation failed — retry once with error context
    console.warn(
        `[personas/${personaType}] Zod validation failed, retrying with error context:`,
        validation.error.message,
    );

    const retryInstruction =
        `⚠️ YOUR PREVIOUS RESPONSE FAILED VALIDATION. Fix these errors and try again:\n` +
        `${validation.error.message}\n\n` +
        `Remember: personaType MUST be exactly "${personaType}". ` +
        `priorityScore MUST be a number 0-10. ` +
        `strengths, weaknesses, and suggestedRefinements MUST be arrays of strings.`;

    const retryCompletion = await callOpenAI(retryInstruction);
    const retryContent = retryCompletion.choices[0]?.message?.content ?? "{}";
    const retryTokens = retryCompletion.usage?.total_tokens ?? estimateTokens(retryContent);

    let retryParsed: unknown;
    try {
        retryParsed = JSON.parse(retryContent);
    } catch {
        throw new Error(`[personas/${personaType}] Invalid JSON on retry: ${retryContent.slice(0, 200)}`);
    }

    const retryValidation = PersonaCritiqueSchema.safeParse(retryParsed);

    if (retryValidation.success) {
        return { critique: retryValidation.data, tokensUsed: tokensUsed + retryTokens };
    }

    // Both attempts failed — throw with full context
    throw new Error(
        `[personas/${personaType}] Zod validation failed after retry: ${retryValidation.error.message}`,
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Parallel Persona Orchestrator
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Run ALL 7 persona agents in parallel against an idea version.
 *
 * Uses Promise.all for maximum parallelism — all 7 API calls fire simultaneously.
 * Individual persona failures are caught and logged but do not block other personas.
 * Failed personas return a fallback critique with the error captured in weaknesses.
 */
export async function runAllPersonas(
    idea: IdeaVersion,
    ragContext: RAGContext,
    previousCritiques?: PersonaCritique[],
): Promise<AllPersonasResult> {
    const personaTypes: PersonaType[] = [
        "VISIONARY",
        "SYSTEMS_ARCHITECT",
        "MARKET_STRATEGIST",
        "UX_THINKER",
        "RISK_ANALYST",
        "ETHICS_REVIEWER",
        "COMPETITIVE_ANALYST",
    ];

    const results = await Promise.all(
        personaTypes.map(async (personaType): Promise<PersonaResult> => {
            try {
                return await runPersona(personaType, idea, ragContext, previousCritiques);
            } catch (err) {
                console.error(`[personas] ${personaType} failed entirely:`, err);
                return {
                    critique: {
                        personaType,
                        strengths: [],
                        weaknesses: [`Persona agent failed: ${String(err)}`],
                        suggestedRefinements: [],
                        priorityScore: 5,
                    },
                    tokensUsed: 0,
                };
            }
        }),
    );

    const perPersonaTokens: Record<string, number> = {};
    let totalTokensUsed = 0;

    for (const result of results) {
        perPersonaTokens[result.critique.personaType] = result.tokensUsed;
        totalTokensUsed += result.tokensUsed;
    }

    return {
        critiques: results.map((r) => r.critique),
        totalTokensUsed,
        perPersonaTokens,
    };
}
