import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────────
// Enums — Persona & Judge Types
// ────────────────────────────────────────────────────────────────────────────────

/**
 * PersonaType — Each persona represents a distinct stakeholder lens through
 * which an idea is evaluated. The adversarial loop cycles through all personas
 * to produce multi-dimensional critiques.
 *
 * Design decision: Using const enums + Zod enums for runtime validation AND
 * compile-time type safety. This avoids the TS enum pitfalls while keeping
 * full validation in the orchestrator.
 */
export const PersonaType = {
    VISIONARY: "VISIONARY",
    SYSTEMS_ARCHITECT: "SYSTEMS_ARCHITECT",
    MARKET_STRATEGIST: "MARKET_STRATEGIST",
    UX_THINKER: "UX_THINKER",
    RISK_ANALYST: "RISK_ANALYST",
    ETHICS_REVIEWER: "ETHICS_REVIEWER",
    COMPETITIVE_ANALYST: "COMPETITIVE_ANALYST",
} as const;

export type PersonaType = (typeof PersonaType)[keyof typeof PersonaType];

export const PersonaTypeSchema = z.enum([
    "VISIONARY",
    "SYSTEMS_ARCHITECT",
    "MARKET_STRATEGIST",
    "UX_THINKER",
    "RISK_ANALYST",
    "ETHICS_REVIEWER",
    "COMPETITIVE_ANALYST",
]);

/**
 * JudgeType — Each judge represents a domain-specific evaluator that scores
 * the refined idea on standardized criteria. Multiple judges ensure no single
 * bias dominates the convergence signal.
 */
export const JudgeType = {
    VC_JUDGE: "VC_JUDGE",
    TECHNICAL_JUDGE: "TECHNICAL_JUDGE",
    ACADEMIC_JUDGE: "ACADEMIC_JUDGE",
    INDUSTRY_JUDGE: "INDUSTRY_JUDGE",
    EXECUTION_JUDGE: "EXECUTION_JUDGE",
} as const;

export type JudgeType = (typeof JudgeType)[keyof typeof JudgeType];

export const JudgeTypeSchema = z.enum([
    "VC_JUDGE",
    "TECHNICAL_JUDGE",
    "ACADEMIC_JUDGE",
    "INDUSTRY_JUDGE",
    "EXECUTION_JUDGE",
]);

// ────────────────────────────────────────────────────────────────────────────────
// Core Domain Types
// ────────────────────────────────────────────────────────────────────────────────

/**
 * IdeaVersion — Immutable snapshot of an idea at a specific iteration.
 * Each iteration in the adversarial loop produces a new IdeaVersion.
 * The DAG visualization traces the lineage across iterations.
 */
export const IdeaVersionSchema = z.object({
    id: z.string().uuid(),
    iteration: z.number().int().min(0),
    problemStatement: z.string().min(1),
    solution: z.string().min(1),
    deliverable: z.string().min(1),
    technicalApproach: z.string().min(1),
    expectedImpact: z.string().min(1),
    createdAt: z.string().datetime(),
});

export type IdeaVersion = z.infer<typeof IdeaVersionSchema>;

/**
 * PersonaCritique — Structured output from a persona agent.
 * Each persona produces one critique per iteration, highlighting strengths,
 * weaknesses, and concrete refinement suggestions with a priority score
 * that the orchestrator uses to weight refinement directives.
 */
export const PersonaCritiqueSchema = z.object({
    personaType: PersonaTypeSchema,
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    suggestedRefinements: z.array(z.string()),
    priorityScore: z.number().min(0).max(10),
});

export type PersonaCritique = z.infer<typeof PersonaCritiqueSchema>;

/**
 * JudgeScore — Structured scoring output from a judge agent.
 * Each judge evaluates the idea across 5 standardized dimensions (0-10 each)
 * plus an overall score. The passThreshold flag indicates whether this judge
 * would "pass" the idea to the next round without further refinement.
 *
 * Design decision: Separating per-dimension scores from overall allows the
 * convergence detector to identify specific weak dimensions that need targeted
 * refinement, rather than treating the score as a monolithic number.
 */
export const JudgeScoreSchema = z.object({
    judgeType: JudgeTypeSchema,
    problemRelevance: z.number().min(0).max(10),
    innovation: z.number().min(0).max(10),
    feasibility: z.number().min(0).max(10),
    userImpact: z.number().min(0).max(10),
    presentation: z.number().min(0).max(10),
    overallScore: z.number().min(0).max(10),
    specificCritiques: z.array(z.string()),
    improvementDirectives: z.array(z.string()),
    passThreshold: z.boolean(),
});

export type JudgeScore = z.infer<typeof JudgeScoreSchema>;

// ────────────────────────────────────────────────────────────────────────────────
// Convergence & Session Types
// ────────────────────────────────────────────────────────────────────────────────

/**
 * ConvergenceMetrics — Computed after each iteration to decide whether the
 * adversarial loop should continue or terminate.
 *
 * The convergence detector uses a multi-signal approach:
 * - averageScore & minJudgeScore: raw quality thresholds
 * - noveltyScore: prevents stagnation (low novelty = diminishing returns)
 * - feasibilityScore: ensures ideas remain buildable
 * - unresolvedCritiques: count of critiques not yet addressed
 * - isDiminishingReturns: true when delta between iterations < epsilon
 */
export const ConvergenceMetricsSchema = z.object({
    averageScore: z.number().min(0).max(10),
    minJudgeScore: z.number().min(0).max(10),
    noveltyScore: z.number().min(0).max(1),
    feasibilityScore: z.number().min(0).max(10),
    unresolvedCritiques: z.number().int().min(0),
    isDiminishingReturns: z.boolean(),
});

export type ConvergenceMetrics = z.infer<typeof ConvergenceMetricsSchema>;

/**
 * IterationLog — Complete record of a single iteration in the adversarial loop.
 * Contains the idea version, all persona critiques, all judge scores,
 * the computed average, and convergence metrics.
 *
 * This is the primary data structure persisted to Supabase and streamed
 * via Realtime channels to the frontend dashboard.
 */
export const IterationLogSchema = z.object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    iterationNumber: z.number().int().min(0),
    ideaVersion: IdeaVersionSchema,
    personaCritiques: z.array(PersonaCritiqueSchema),
    judgeScores: z.array(JudgeScoreSchema),
    averageScore: z.number().min(0).max(10),
    convergenceMetrics: ConvergenceMetricsSchema,
    timestamp: z.string().datetime(),
});

export type IterationLog = z.infer<typeof IterationLogSchema>;

/**
 * SimulationSession — Top-level container for an adversarial idea refinement run.
 * Tracks the topic, current status, iteration progress, and termination criteria.
 *
 * Status lifecycle: PENDING → RUNNING → CONVERGED | FAILED | CANCELLED
 */
export const SimulationStatusSchema = z.enum([
    "PENDING",
    "RUNNING",
    "CONVERGED",
    "FAILED",
    "CANCELLED",
]);

export type SimulationStatus = z.infer<typeof SimulationStatusSchema>;

export const SimulationSessionSchema = z.object({
    id: z.string().uuid(),
    topic: z.string().min(1),
    status: SimulationStatusSchema,
    currentIteration: z.number().int().min(0),
    maxIterations: z.number().int().min(1),
    targetScore: z.number().min(0).max(10),
    createdAt: z.string().datetime(),
});

export type SimulationSession = z.infer<typeof SimulationSessionSchema>;

// ────────────────────────────────────────────────────────────────────────────────
// RAG Context
// ────────────────────────────────────────────────────────────────────────────────

/**
 * RAGContext — Retrieval-Augmented Generation context injected into persona
 * and judge prompts. Contains chunks retrieved from the pgvector store,
 * their similarity scores, a novelty penalty (to discourage rehashing
 * existing ideas), and buzzword flags for quality control.
 *
 * Design decision: Novelty penalty and buzzword detection are computed
 * server-side in the RAG pipeline to keep the agent prompts focused on
 * reasoning rather than meta-analysis.
 */
export const RAGContextSchema = z.object({
    retrievedChunks: z.array(z.string()),
    similarityScores: z.array(z.number().min(0).max(1)),
    noveltyPenalty: z.number().min(0).max(1),
    buzzwordFlags: z.array(z.string()),
});

export type RAGContext = z.infer<typeof RAGContextSchema>;
