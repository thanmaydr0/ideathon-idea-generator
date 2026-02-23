/**
 * IDEAForge — Shared Type Definitions for Edge Functions
 *
 * ARCH: These types mirror the frontend types/index.ts but are defined
 * separately for the Deno runtime. In a monorepo with shared packages,
 * these would be imported from a common package. For Supabase Edge Functions
 * (Deno), we keep a lean copy to avoid bundling issues.
 */

/** Valid persona types for adversarial critique agents. */
export type PersonaType =
    | "VISIONARY"
    | "SYSTEMS_ARCHITECT"
    | "MARKET_STRATEGIST"
    | "UX_THINKER"
    | "RISK_ANALYST"
    | "ETHICS_REVIEWER"
    | "COMPETITIVE_ANALYST";

/** Valid judge types for scoring agents. */
export type JudgeType =
    | "VC_JUDGE"
    | "TECHNICAL_JUDGE"
    | "ACADEMIC_JUDGE"
    | "INDUSTRY_JUDGE"
    | "EXECUTION_JUDGE";

/** Simulation session status lifecycle. */
export type SimulationStatus =
    | "pending"
    | "running"
    | "converged"
    | "failed"
    | "stopped";

/** Iteration convergence status. */
export type IterationStatus = "improving" | "plateau" | "converged" | "diverged";

/** Full list of all persona types — iterated by the orchestrator. */
export const ALL_PERSONA_TYPES: PersonaType[] = [
    "VISIONARY",
    "SYSTEMS_ARCHITECT",
    "MARKET_STRATEGIST",
    "UX_THINKER",
    "RISK_ANALYST",
    "ETHICS_REVIEWER",
    "COMPETITIVE_ANALYST",
];

/** Full list of all judge types — iterated by the orchestrator. */
export const ALL_JUDGE_TYPES: JudgeType[] = [
    "VC_JUDGE",
    "TECHNICAL_JUDGE",
    "ACADEMIC_JUDGE",
    "INDUSTRY_JUDGE",
    "EXECUTION_JUDGE",
];

// ────────────────────────────────────────────────────────────────────────────────
// Request / Response interfaces for each Edge Function
// ────────────────────────────────────────────────────────────────────────────────

export interface StartSimulationRequest {
    topic: string;
    domain: string;
    maxIterations?: number;
}

export interface StartSimulationResponse {
    sessionId: string;
    status: "started";
}

export interface RunIterationRequest {
    sessionId: string;
    iteration: number;
}

export interface RagRetrieveRequest {
    query: string;
    domain: string;
    ideaEmbedding?: number[];
}

export interface RagRetrieveResponse {
    winningPatterns: Array<{
        id: string;
        title: string;
        content: string;
        similarity: number;
    }>;
    failurePatterns: Array<{
        failureType: string;
        description: string;
        similarity: number;
    }>;
    noveltyPenalty: number;
}

export interface GetSessionStateRequest {
    sessionId: string;
}

export interface StopSimulationRequest {
    sessionId: string;
}

// ────────────────────────────────────────────────────────────────────────────────
// Persona & Judge structured output schemas
// ────────────────────────────────────────────────────────────────────────────────

/** Expected JSON output from a persona agent. */
export interface PersonaCritiqueOutput {
    strengths: string[];
    weaknesses: string[];
    suggestedRefinements: string[];
    priorityScore: number;
}

/** Expected JSON output from a judge agent. */
export interface JudgeScoreOutput {
    problemRelevance: number;
    innovation: number;
    feasibility: number;
    userImpact: number;
    presentation: number;
    overallScore: number;
    specificCritiques: string[];
    improvementDirectives: string[];
    passThreshold: boolean;
}

/** Synthesized idea version produced by the refinement step. */
export interface SynthesizedIdea {
    problemStatement: string;
    targetUsers: string;
    existingSolutionsGap: string;
    proposedSolution: string;
    deliverableType: "SOFTWARE_PROTOTYPE" | "HARDWARE_PROTOTYPE";
    implementationApproach: string;
    technicalFeasibility: string;
    expectedImpact: string;
}

/** Convergence metrics computed after each iteration. */
export interface ConvergenceCheck {
    averageScore: number;
    minJudgeScore: number;
    noveltyScore: number;
    feasibilityScore: number;
    unresolvedCritiquesCount: number;
    convergenceDelta: number;
    isDiminishingReturns: boolean;
    status: IterationStatus;
    shouldContinue: boolean;
}
