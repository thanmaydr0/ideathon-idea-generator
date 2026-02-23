import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.56.0";

// ── Shared: CORS ──────────────────────────────────────────────────────────────
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ── Shared: Supabase Admin ────────────────────────────────────────────────────
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// ── Shared: OpenAI Client ─────────────────────────────────────────────────────
const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiApiKey) {
    throw new Error("[IDEAForge] OPENAI_API_KEY not set. Add it via: supabase secrets set OPENAI_API_KEY=sk-...");
}
const openai = new OpenAI({ apiKey: openaiApiKey });

const MODELS = {
    AGENT: "gpt-4o" as const,
    EMBEDDING: "text-embedding-3-large" as const,
} as const;

async function generateEmbedding(text: string): Promise<{ embedding: number[]; tokensUsed: number }> {
    const response = await openai.embeddings.create({ model: MODELS.EMBEDDING, input: text });
    return {
        embedding: response.data[0].embedding,
        tokensUsed: response.usage?.total_tokens ?? 0,
    };
}

// ── Shared: Types ─────────────────────────────────────────────────────────────
type PersonaType = "VISIONARY" | "SYSTEMS_ARCHITECT" | "MARKET_STRATEGIST" | "UX_THINKER" | "RISK_ANALYST" | "ETHICS_REVIEWER" | "COMPETITIVE_ANALYST";
type JudgeType = "VC_JUDGE" | "TECHNICAL_JUDGE" | "ACADEMIC_JUDGE" | "INDUSTRY_JUDGE" | "EXECUTION_JUDGE";

const ALL_PERSONA_TYPES: PersonaType[] = ["VISIONARY", "SYSTEMS_ARCHITECT", "MARKET_STRATEGIST", "UX_THINKER", "RISK_ANALYST", "ETHICS_REVIEWER", "COMPETITIVE_ANALYST"];
const ALL_JUDGE_TYPES: JudgeType[] = ["VC_JUDGE", "TECHNICAL_JUDGE", "ACADEMIC_JUDGE", "INDUSTRY_JUDGE", "EXECUTION_JUDGE"];

interface RunIterationRequest { sessionId: string; iteration: number; }
interface PersonaCritiqueOutput { strengths: string[]; weaknesses: string[]; suggestedRefinements: string[]; priorityScore: number; }
interface JudgeScoreOutput { problemRelevance: number; innovation: number; feasibility: number; userImpact: number; presentation: number; overallScore: number; specificCritiques: string[]; improvementDirectives: string[]; passThreshold: boolean; }
interface SynthesizedIdea { problemStatement: string; targetUsers: string; existingSolutionsGap: string; proposedSolution: string; deliverableType: "SOFTWARE_PROTOTYPE" | "HARDWARE_PROTOTYPE"; implementationApproach: string; technicalFeasibility: string; expectedImpact: string; }

// ── Shared: Prompts ───────────────────────────────────────────────────────────
function getPersonaSystemPrompt(personaType: PersonaType): string {
    const base = `You are an adversarial hackathon idea evaluator. You MUST respond with ONLY valid JSON matching this exact schema:
{
  "strengths": ["string array of specific strengths"],
  "weaknesses": ["string array of specific weaknesses"],
  "suggestedRefinements": ["string array of actionable improvement suggestions"],
  "priorityScore": <number 0-10, how urgently your concerns need addressing>
}

Be specific, cite exact parts of the idea, and give actionable feedback. Do NOT be generic.`;

    const personas: Record<PersonaType, string> = {
        VISIONARY: `${base}

Your persona: THE VISIONARY
You evaluate ideas through the lens of transformative potential and moonshot thinking.
- Ask: "Could this change an entire industry in 5 years?"
- Push for ideas that are 10x better, not 10% better
- Value bold, paradigm-shifting approaches over incremental improvements
- Criticize ideas that play it safe or solve already-solved problems
- Look for network effects, platform potential, and exponential growth vectors
- Your weaknesses should focus on: lack of ambition, derivative thinking, small TAM`,

        SYSTEMS_ARCHITECT: `${base}

Your persona: THE SYSTEMS ARCHITECT
You evaluate technical architecture, scalability, and engineering feasibility.
- Ask: "Can a team of 3 actually build an MVP of this in 48 hours?"
- Scrutinize the tech stack choices, data flow, and system boundaries
- Check for single points of failure, scaling bottlenecks, and data consistency issues
- Value clean separation of concerns and well-defined APIs
- Criticize vague "AI-powered" claims without concrete implementation paths
- Your weaknesses should focus on: overengineering, infeasible tech, missing architecture`,

        MARKET_STRATEGIST: `${base}

Your persona: THE MARKET STRATEGIST
You evaluate product-market fit, competitive landscape, and go-to-market viability.
- Ask: "Who exactly would pay for this, and why would they switch from what they use now?"
- Analyze TAM/SAM/SOM with realistic numbers
- Check for existing competitors that the team may have missed
- Value ideas with clear distribution channels and network effects
- Criticize ideas that assume "if we build it, they will come"
- Your weaknesses should focus on: no PMF, crowded market, unclear monetization`,

        UX_THINKER: `${base}

Your persona: THE UX THINKER
You evaluate user experience, accessibility, and human-centered design.
- Ask: "Would a real user actually want to use this every day?"
- Check if the user journey has unnecessary friction points
- Value simplicity, intuitive interfaces, and delightful interactions
- Criticize ideas that require extensive user training or behavior change
- Look for accessibility issues and inclusive design opportunities
- Your weaknesses should focus on: poor UX, high friction, inaccessibility, complexity`,

        RISK_ANALYST: `${base}

Your persona: THE RISK ANALYST
You evaluate potential failure modes, risks, and mitigation strategies.
- Ask: "What could kill this project in the first 6 months?"
- Identify technical, legal, market, and operational risks
- Check for regulatory compliance issues (GDPR, HIPAA, etc.)
- Value ideas with clear risk mitigation strategies
- Criticize ideas that ignore obvious failure modes
- Your weaknesses should focus on: regulatory risk, security gaps, unaddressed failure modes`,

        ETHICS_REVIEWER: `${base}

Your persona: THE ETHICS REVIEWER
You evaluate ethical implications, bias potential, and social impact.
- Ask: "Could this harm vulnerable populations or widen inequality?"
- Check for algorithmic bias, data privacy issues, and consent problems
- Value ideas with positive social externalities
- Criticize ideas that extract value without creating it
- Look for dual-use concerns and unintended consequences
- Your weaknesses should focus on: bias risk, privacy, ethics violations, negative externalities`,

        COMPETITIVE_ANALYST: `${base}

Your persona: THE COMPETITIVE ANALYST
You evaluate the idea against the existing competitive landscape.
- Ask: "Why hasn't Google/Meta/a well-funded startup already done this?"
- Research and cite specific existing solutions and competitors
- Check for defensible moats: proprietary data, network effects, regulatory barriers
- Value unique angles that incumbents can't easily replicate
- Criticize "LLM wrapper" ideas with no defensibility
- Your weaknesses should focus on: no moat, existing solutions, easy to replicate`,
    };

    return personas[personaType];
}

function buildPersonaUserPrompt(
    idea: { problemStatement: string; targetUsers: string; existingSolutionsGap: string; proposedSolution: string; deliverableType: string; implementationApproach: string; technicalFeasibility: string; expectedImpact: string },
    ragContext?: string,
    iterationNumber?: number
): string {
    let prompt = `## Hackathon Idea to Evaluate (Iteration #${iterationNumber ?? 1})

**Problem Statement:** ${idea.problemStatement}

**Target Users:** ${idea.targetUsers}

**Existing Solutions Gap:** ${idea.existingSolutionsGap}

**Proposed Solution:** ${idea.proposedSolution}

**Deliverable Type:** ${idea.deliverableType}

**Implementation Approach:** ${idea.implementationApproach}

**Technical Feasibility:** ${idea.technicalFeasibility}

**Expected Impact:** ${idea.expectedImpact}`;

    if (ragContext) {
        prompt += `\n\n## Reference Context (from knowledge base)\n${ragContext}`;
    }
    return prompt;
}

function getJudgeSystemPrompt(judgeType: JudgeType): string {
    const base = `You are a hackathon judge. Score the idea across 5 dimensions (0.00-10.00 each) and provide an overall score. You MUST respond with ONLY valid JSON matching this exact schema:
{
  "problemRelevance": <number 0-10>,
  "innovation": <number 0-10>,
  "feasibility": <number 0-10>,
  "userImpact": <number 0-10>,
  "presentation": <number 0-10>,
  "overallScore": <number 0-10>,
  "specificCritiques": ["array of specific critique strings"],
  "improvementDirectives": ["array of specific improvement directives"],
  "passThreshold": <boolean — true if overall >= 8.5>
}

Score rigorously. A 7 is good. An 8 is excellent. A 9+ is exceptional and rare.
Be specific in critiques — cite exact parts of the idea.`;

    const judges: Record<JudgeType, string> = {
        VC_JUDGE: `${base}

Your role: VENTURE CAPITAL JUDGE
You think like an early-stage VC evaluating a seed pitch.
- problemRelevance: Is this a real problem with a large, growing market?
- innovation: Is this a novel approach or just an incremental improvement?
- feasibility: Can this team ship an MVP in 48 hours?
- userImpact: Would users pay for this? Is retention likely?
- presentation: Is the pitch clear, compelling, and data-driven?
- Weight heavily: market size, defensibility, and founder-market fit signals`,

        TECHNICAL_JUDGE: `${base}

Your role: TECHNICAL JUDGE
You evaluate engineering quality and technical depth.
- problemRelevance: Is the technical problem well-defined?
- innovation: Does the architecture show genuine technical creativity?
- feasibility: Is the tech stack appropriate? Are there obvious bottlenecks?
- userImpact: Does the technical approach actually serve the user well?
- presentation: Are technical decisions clearly justified?
- Weight heavily: system design, scalability, and code-level feasibility`,

        ACADEMIC_JUDGE: `${base}

Your role: ACADEMIC JUDGE
You evaluate research rigor and intellectual depth.
- problemRelevance: Is the problem well-grounded in existing literature?
- innovation: Does this advance the state of the art?
- feasibility: Is the methodology sound?
- userImpact: Does this contribute meaningful knowledge?
- presentation: Is the approach well-structured and reproducible?
- Weight heavily: novelty, methodology, and contribution to the field`,

        INDUSTRY_JUDGE: `${base}

Your role: INDUSTRY JUDGE
You evaluate practical industry applicability.
- problemRelevance: Is this a real pain point in the industry?
- innovation: Does this meaningfully improve on industry-standard solutions?
- feasibility: Can this integrate with existing enterprise systems?
- userImpact: Would this get adoption in a real organization?
- presentation: Is this ready for a stakeholder demo?
- Weight heavily: integration feasibility, compliance, and deployment readiness`,

        EXECUTION_JUDGE: `${base}

Your role: EXECUTION JUDGE
You evaluate the plan's executability within hackathon constraints.
- problemRelevance: Is the scope appropriately sized for the time constraint?
- innovation: Is the approach creative within the constraints?
- feasibility: Can 3-4 people actually build this in 48 hours?
- userImpact: Will the demo be convincing?
- presentation: Is the team's plan clear and well-organized?
- Weight heavily: realistic scope, task breakdown, and demo-ability`,
    };

    return judges[judgeType];
}

function buildJudgeUserPrompt(
    idea: { problemStatement: string; targetUsers: string; existingSolutionsGap: string; proposedSolution: string; deliverableType: string; implementationApproach: string; technicalFeasibility: string; expectedImpact: string },
    personaCritiques: Array<{ personaType: string; strengths: string[]; weaknesses: string[]; priorityScore: number }>,
    iterationNumber: number
): string {
    const critiqueSummary = personaCritiques
        .map(
            (c) =>
                `### ${c.personaType} (priority: ${c.priorityScore}/10)\n` +
                `Strengths: ${c.strengths.join("; ")}\n` +
                `Weaknesses: ${c.weaknesses.join("; ")}`
        )
        .join("\n\n");

    return `## Hackathon Idea to Score (Iteration #${iterationNumber})

**Problem Statement:** ${idea.problemStatement}

**Target Users:** ${idea.targetUsers}

**Existing Solutions Gap:** ${idea.existingSolutionsGap}

**Proposed Solution:** ${idea.proposedSolution}

**Deliverable Type:** ${idea.deliverableType}

**Implementation Approach:** ${idea.implementationApproach}

**Technical Feasibility:** ${idea.technicalFeasibility}

**Expected Impact:** ${idea.expectedImpact}

---

## Persona Critiques for this Iteration

${critiqueSummary}`;
}

// ── Main Function ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    let capturedSessionId: string | null = null;

    try {
        const body: RunIterationRequest = await req.json();
        const { sessionId, iteration } = body;
        capturedSessionId = sessionId;

        if (!sessionId || !iteration) {
            return new Response(
                JSON.stringify({ error: "sessionId and iteration are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[run-iteration] Starting iteration ${iteration} for session ${sessionId}`);

        // ── a) Fetch session + verify still running
        const { data: session, error: sessionError } = await supabaseAdmin
            .from("simulation_sessions")
            .select("*")
            .eq("id", sessionId)
            .single();

        if (sessionError || !session) {
            console.error(`[run-iteration] Session ${sessionId} not found`);
            return new Response(
                JSON.stringify({ error: "Session not found" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (session.status !== "running") {
            console.log(`[run-iteration] Session ${sessionId} is '${session.status}', skipping iteration`);
            return new Response(
                JSON.stringify({ sessionId, iteration, skipped: true, reason: `Session status is '${session.status}'` }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (iteration > session.max_iterations) {
            console.log(`[run-iteration] Max iterations (${session.max_iterations}) reached`);
            await supabaseAdmin
                .from("simulation_sessions")
                .update({ status: "failed", updated_at: new Date().toISOString() })
                .eq("id", sessionId);

            return new Response(
                JSON.stringify({ sessionId, iteration, status: "max_iterations_reached" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        await supabaseAdmin
            .from("simulation_sessions")
            .update({ current_iteration: iteration, updated_at: new Date().toISOString() })
            .eq("id", sessionId);

        // ── b) Fetch previous idea version or generate initial
        let previousIdea: Record<string, unknown> | null = null;

        if (iteration > 1) {
            const { data: prevIdea } = await supabaseAdmin
                .from("idea_versions")
                .select("*")
                .eq("session_id", sessionId)
                .eq("iteration_number", iteration - 1)
                .single();

            previousIdea = prevIdea;
        }

        // ── c) Call RAG retrieval
        let ragContext = "";
        let noveltyPenaltyFromRag = 0;

        try {
            const ragResponse = await fetch(`${supabaseUrl}/functions/v1/rag-retrieve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    query: previousIdea
                        ? `${(previousIdea as Record<string, unknown>).problem_statement} ${(previousIdea as Record<string, unknown>).proposed_solution}`
                        : session.topic,
                    domain: session.domain ?? "",
                }),
            });

            if (ragResponse.ok) {
                const ragData = await ragResponse.json();
                noveltyPenaltyFromRag = ragData.noveltyPenalty ?? 0;

                if (ragData.winningPatterns?.length > 0) {
                    ragContext += "### Winning Patterns from Knowledge Base:\n";
                    for (const p of ragData.winningPatterns) {
                        ragContext += `- **${p.title}** (similarity: ${p.similarity.toFixed(2)}): ${p.content.slice(0, 200)}...\n`;
                    }
                }
                if (ragData.failurePatterns?.length > 0) {
                    ragContext += "\n### Known Failure Patterns to AVOID:\n";
                    for (const f of ragData.failurePatterns) {
                        ragContext += `- **${f.failureType}** (similarity: ${f.similarity.toFixed(2)}): ${f.description}\n`;
                    }
                }
            }
        } catch (ragErr) {
            console.warn("[run-iteration] RAG retrieval failed, continuing without context:", ragErr);
        }

        // ── d) Run all 7 persona agents in PARALLEL
        const ideaForPersonas = previousIdea
            ? {
                problemStatement: previousIdea.problem_statement as string,
                targetUsers: previousIdea.target_users as string,
                existingSolutionsGap: previousIdea.existing_solutions_gap as string,
                proposedSolution: previousIdea.proposed_solution as string,
                deliverableType: previousIdea.deliverable_type as string,
                implementationApproach: previousIdea.implementation_approach as string,
                technicalFeasibility: previousIdea.technical_feasibility as string,
                expectedImpact: previousIdea.expected_impact as string,
            }
            : {
                problemStatement: session.topic,
                targetUsers: "To be determined",
                existingSolutionsGap: "To be determined",
                proposedSolution: "To be determined based on topic analysis",
                deliverableType: "SOFTWARE_PROTOTYPE",
                implementationApproach: "To be determined",
                technicalFeasibility: "To be determined",
                expectedImpact: "To be determined",
            };

        console.log(`[run-iteration] Running ${ALL_PERSONA_TYPES.length} persona agents in parallel...`);

        const personaResults = await Promise.all(
            ALL_PERSONA_TYPES.map(async (personaType) => {
                try {
                    const completion = await openai.chat.completions.create({
                        model: MODELS.AGENT,
                        messages: [
                            { role: "system", content: getPersonaSystemPrompt(personaType) },
                            { role: "user", content: buildPersonaUserPrompt(ideaForPersonas, ragContext, iteration) },
                        ],
                        temperature: 0.7,
                        max_tokens: 2048,
                        response_format: { type: "json_object" },
                    });

                    const rawResponse = completion.choices[0]?.message?.content ?? "{}";
                    const tokensUsed = completion.usage?.total_tokens ?? 0;
                    const parsed: PersonaCritiqueOutput = JSON.parse(rawResponse);

                    return { personaType, output: parsed, rawResponse, tokensUsed, error: null };
                } catch (err) {
                    console.error(`[run-iteration] Persona ${personaType} failed:`, err);
                    return {
                        personaType,
                        output: { strengths: [], weaknesses: [`Persona agent failed: ${String(err)}`], suggestedRefinements: [], priorityScore: 5 } as PersonaCritiqueOutput,
                        rawResponse: String(err),
                        tokensUsed: 0,
                        error: String(err),
                    };
                }
            })
        );

        console.log(`[run-iteration] All persona agents completed`);

        // ── e) Synthesize persona critiques into refined idea
        const critiqueSummary = personaResults
            .map((r) => {
                return `### ${r.personaType} (priority: ${r.output.priorityScore}/10)\n` +
                    `Strengths: ${r.output.strengths.join("; ") || "None identified"}\n` +
                    `Weaknesses: ${r.output.weaknesses.join("; ") || "None identified"}\n` +
                    `Refinements: ${r.output.suggestedRefinements.join("; ") || "None suggested"}`;
            })
            .join("\n\n");

        const synthesisCompletion = await openai.chat.completions.create({
            model: MODELS.AGENT,
            messages: [
                {
                    role: "system",
                    content: `You are the IDEAForge Synthesis Engine. Given a hackathon topic and adversarial persona critiques, produce a REFINED idea version that addresses the highest-priority feedback.

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "problemStatement": "string — clear, specific problem statement",
  "targetUsers": "string — specific target user segments",
  "existingSolutionsGap": "string — what existing solutions miss",
  "proposedSolution": "string — your refined solution",
  "deliverableType": "SOFTWARE_PROTOTYPE" or "HARDWARE_PROTOTYPE",
  "implementationApproach": "string — concrete technical approach",
  "technicalFeasibility": "string — why this is buildable in 48hrs",
  "expectedImpact": "string — measurable expected impact"
}

Rules:
- Address weaknesses identified by HIGH priority personas first (priorityScore > 7)
- Preserve strengths that multiple personas agreed on
- Be SPECIFIC — no vague "AI-powered" claims without technical detail
- Keep scope realistic for a 48-hour hackathon`,
                },
                {
                    role: "user",
                    content: `## Topic: ${session.topic}
## Domain: ${session.domain ?? "General"}
## Iteration: ${iteration}

${previousIdea ? `## Previous Idea Version:\n${JSON.stringify(ideaForPersonas, null, 2)}` : "## This is the FIRST iteration — generate an initial idea."}

## Adversarial Persona Critiques:
${critiqueSummary}

${ragContext ? `## RAG Knowledge Context:\n${ragContext}` : ""}

Synthesize a refined idea that addresses the critiques above.`,
                },
            ],
            temperature: 0.7,
            max_tokens: 4096,
            response_format: { type: "json_object" },
        });

        const synthesisRaw = synthesisCompletion.choices[0]?.message?.content ?? "{}";
        const synthesisTokens = synthesisCompletion.usage?.total_tokens ?? 0;
        const refinedIdea: SynthesizedIdea = JSON.parse(synthesisRaw);

        console.log(`[run-iteration] Idea synthesized (${synthesisTokens} tokens)`);

        // ── f) Generate embedding for the new idea
        const ideaText = `${refinedIdea.problemStatement} ${refinedIdea.proposedSolution} ${refinedIdea.implementationApproach}`;
        const { embedding: ideaEmbedding, tokensUsed: embeddingTokens } = await generateEmbedding(ideaText);

        // ── g) Store idea version + persona critiques to DB
        const { data: newIdeaVersion, error: ideaInsertError } = await supabaseAdmin
            .from("idea_versions")
            .insert({
                session_id: sessionId,
                iteration_number: iteration,
                problem_statement: refinedIdea.problemStatement,
                target_users: refinedIdea.targetUsers,
                existing_solutions_gap: refinedIdea.existingSolutionsGap,
                proposed_solution: refinedIdea.proposedSolution,
                deliverable_type: refinedIdea.deliverableType,
                implementation_approach: refinedIdea.implementationApproach,
                technical_feasibility: refinedIdea.technicalFeasibility,
                expected_impact: refinedIdea.expectedImpact,
                rag_context: ragContext ? { context: ragContext, noveltyPenalty: noveltyPenaltyFromRag } : {},
                embedding: ideaEmbedding as unknown as string,
            })
            .select("id")
            .single();

        if (ideaInsertError) {
            console.error("[run-iteration] Failed to insert idea version:", ideaInsertError);
            throw new Error(`DB insert failed: ${ideaInsertError.message}`);
        }

        const critiqueInserts = personaResults.map((r) => ({
            idea_version_id: newIdeaVersion.id,
            session_id: sessionId,
            iteration_number: iteration,
            persona_type: r.personaType,
            strengths: r.output.strengths,
            weaknesses: r.output.weaknesses,
            suggested_refinements: r.output.suggestedRefinements,
            priority_score: r.output.priorityScore,
            raw_response: r.rawResponse,
            tokens_used: r.tokensUsed,
        }));

        const { error: critiqueInsertError } = await supabaseAdmin
            .from("persona_critiques")
            .insert(critiqueInserts);

        if (critiqueInsertError) {
            console.error("[run-iteration] Failed to insert critiques:", critiqueInsertError);
        }

        // ── h) Run all 5 judge agents in PARALLEL
        console.log(`[run-iteration] Running ${ALL_JUDGE_TYPES.length} judge agents in parallel...`);

        const personaCritiquesForJudges = personaResults.map((r) => ({
            personaType: r.personaType,
            strengths: r.output.strengths,
            weaknesses: r.output.weaknesses,
            priorityScore: r.output.priorityScore,
        }));

        const judgeResults = await Promise.all(
            ALL_JUDGE_TYPES.map(async (judgeType) => {
                try {
                    const completion = await openai.chat.completions.create({
                        model: MODELS.AGENT,
                        messages: [
                            { role: "system", content: getJudgeSystemPrompt(judgeType) },
                            {
                                role: "user",
                                content: buildJudgeUserPrompt(
                                    {
                                        problemStatement: refinedIdea.problemStatement,
                                        targetUsers: refinedIdea.targetUsers,
                                        existingSolutionsGap: refinedIdea.existingSolutionsGap,
                                        proposedSolution: refinedIdea.proposedSolution,
                                        deliverableType: refinedIdea.deliverableType,
                                        implementationApproach: refinedIdea.implementationApproach,
                                        technicalFeasibility: refinedIdea.technicalFeasibility,
                                        expectedImpact: refinedIdea.expectedImpact,
                                    },
                                    personaCritiquesForJudges,
                                    iteration
                                ),
                            },
                        ],
                        temperature: 0.3,
                        max_tokens: 2048,
                        response_format: { type: "json_object" },
                    });

                    const rawResponse = completion.choices[0]?.message?.content ?? "{}";
                    const tokensUsed = completion.usage?.total_tokens ?? 0;
                    const parsed: JudgeScoreOutput = JSON.parse(rawResponse);

                    return { judgeType, output: parsed, rawResponse, tokensUsed, error: null };
                } catch (err) {
                    console.error(`[run-iteration] Judge ${judgeType} failed:`, err);
                    return {
                        judgeType,
                        output: {
                            problemRelevance: 0, innovation: 0, feasibility: 0, userImpact: 0, presentation: 0, overallScore: 0,
                            specificCritiques: [`Judge agent failed: ${String(err)}`], improvementDirectives: [], passThreshold: false,
                        } as JudgeScoreOutput,
                        rawResponse: String(err),
                        tokensUsed: 0,
                        error: String(err),
                    };
                }
            })
        );

        console.log(`[run-iteration] All judge agents completed`);

        // ── i) Store judge scores to DB
        const judgeInserts = judgeResults.map((r) => ({
            idea_version_id: newIdeaVersion.id,
            session_id: sessionId,
            iteration_number: iteration,
            judge_type: r.judgeType,
            problem_relevance: r.output.problemRelevance,
            innovation: r.output.innovation,
            feasibility: r.output.feasibility,
            user_impact: r.output.userImpact,
            presentation: r.output.presentation,
            overall_score: r.output.overallScore,
            specific_critiques: r.output.specificCritiques,
            improvement_directives: r.output.improvementDirectives,
            pass_threshold: r.output.passThreshold,
            raw_response: r.rawResponse,
            tokens_used: r.tokensUsed,
        }));

        const { error: judgeInsertError } = await supabaseAdmin
            .from("judge_scores")
            .insert(judgeInserts);

        if (judgeInsertError) {
            console.error("[run-iteration] Failed to insert judge scores:", judgeInsertError);
        }

        // ── j) Calculate convergence metrics
        const avgScore = judgeResults.reduce((sum, r) => sum + r.output.overallScore, 0) / judgeResults.length;
        const minJudgeScore = Math.min(...judgeResults.map((r) => r.output.overallScore));
        const feasibilityScore = judgeResults.reduce((sum, r) => sum + r.output.feasibility, 0) / judgeResults.length;
        const noveltyScore = Math.max(0, Math.min(10, (1 - noveltyPenaltyFromRag) * 10));
        const unresolvedCritiquesCount = personaResults.filter((r) => r.output.priorityScore > 7).length;

        let convergenceDelta = 0;
        if (iteration > 1) {
            const { data: prevLog } = await supabaseAdmin
                .from("iteration_logs")
                .select("average_score")
                .eq("session_id", sessionId)
                .eq("iteration_number", iteration - 1)
                .single();

            if (prevLog) {
                convergenceDelta = avgScore - (prevLog.average_score ?? 0);
            }
        }

        const isDiminishingReturns = iteration > 2 && Math.abs(convergenceDelta) < 0.05;

        let iterationStatus: string;
        if (
            avgScore >= session.target_avg_score &&
            minJudgeScore >= session.target_min_judge_score &&
            noveltyScore >= session.target_novelty_score &&
            feasibilityScore >= session.target_feasibility_score
        ) {
            iterationStatus = "converged";
        } else if (isDiminishingReturns) {
            iterationStatus = "plateau";
        } else if (convergenceDelta < -0.5) {
            iterationStatus = "diverged";
        } else {
            iterationStatus = "improving";
        }

        // ── k) Store iteration log to DB
        const { error: logInsertError } = await supabaseAdmin
            .from("iteration_logs")
            .insert({
                session_id: sessionId,
                iteration_number: iteration,
                average_score: avgScore,
                min_judge_score: minJudgeScore,
                novelty_score: noveltyScore,
                feasibility_score: feasibilityScore,
                unresolved_critiques_count: unresolvedCritiquesCount,
                convergence_delta: convergenceDelta,
                is_diminishing_returns: isDiminishingReturns,
                status: iterationStatus,
            });

        if (logInsertError) {
            console.error("[run-iteration] Failed to insert iteration log:", logInsertError);
        }

        console.log(
            `[run-iteration] Iteration ${iteration} complete — ` +
            `avg: ${avgScore.toFixed(2)}, min: ${minJudgeScore.toFixed(2)}, ` +
            `novelty: ${noveltyScore.toFixed(2)}, status: ${iterationStatus}`
        );

        // ── l) Check convergence conditions
        const isConverged = iterationStatus === "converged";
        const shouldContinue = !isConverged && !isDiminishingReturns && iteration < session.max_iterations;

        // ── m/n) Next iteration or finalize
        if (isConverged) {
            await supabaseAdmin
                .from("simulation_sessions")
                .update({ status: "converged", final_idea_id: newIdeaVersion.id, updated_at: new Date().toISOString() })
                .eq("id", sessionId);

            console.log(`[run-iteration] 🎉 Session ${sessionId} CONVERGED at iteration ${iteration}!`);
        } else if (shouldContinue) {
            try {
                await fetch(`${supabaseUrl}/functions/v1/run-iteration`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({ sessionId, iteration: iteration + 1 }),
                });
            } catch (err) {
                console.error("[run-iteration] Failed to trigger next iteration:", err);
            }
        } else {
            await supabaseAdmin
                .from("simulation_sessions")
                .update({
                    status: isDiminishingReturns ? "stopped" : "failed",
                    final_idea_id: newIdeaVersion.id,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", sessionId);

            console.log(
                `[run-iteration] Session ${sessionId} ended at iteration ${iteration} ` +
                `(${isDiminishingReturns ? "diminishing returns" : "max iterations"})`
            );
        }

        // ── Return response
        const totalTokens =
            personaResults.reduce((s, r) => s + r.tokensUsed, 0) +
            judgeResults.reduce((s, r) => s + r.tokensUsed, 0) +
            synthesisTokens +
            embeddingTokens;

        return new Response(
            JSON.stringify({
                sessionId, iteration, ideaVersionId: newIdeaVersion.id,
                averageScore: avgScore, minJudgeScore, noveltyScore, feasibilityScore,
                convergenceDelta, iterationStatus, isConverged, shouldContinue,
                totalTokensUsed: totalTokens,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[run-iteration] Unexpected error:", err);

        if (capturedSessionId) {
            try {
                await supabaseAdmin
                    .from("simulation_sessions")
                    .update({ status: "failed", updated_at: new Date().toISOString() })
                    .eq("id", capturedSessionId);
            } catch (_) {
                // Best-effort error recovery
            }
        }

        return new Response(
            JSON.stringify({ error: "Iteration failed", details: String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
