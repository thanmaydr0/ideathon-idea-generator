/**
 * Mock agents for CI/offline testing.
 *
 * ARCH: These mocks replace all OpenAI API calls with deterministic,
 * realistic responses. They produce valid typed output matching the
 * production Zod schemas, with scores that improve each iteration
 * to test convergence detection.
 */

import type {
    IdeaVersion,
    PersonaCritique,
    PersonaType,
    JudgeScore,
    JudgeType,
    RAGContext,
    IterationLog,
    ConvergenceMetrics,
} from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Mock Idea Generator
// ────────────────────────────────────────────────────────────────────────────────

export function createMockIdeaVersion(iteration: number): IdeaVersion {
    return {
        id: crypto.randomUUID(),
        iteration,
        problemStatement: `Smallholder farmers in rural India lose 20-40% of crop yield to undetected diseases. (v${iteration})`,
        solution: `An edge-computing solution combining drone imagery and soil sensors with a lightweight CNN model for real-time crop health assessment. Iteration ${iteration} adds ${iteration > 1 ? "multi-spectral analysis and local language alerts" : "basic disease detection"}.`,
        deliverable: `A Raspberry Pi-based device with camera module that processes field imagery locally, generates disease heatmaps, and sends SMS alerts to farmers in ${iteration > 2 ? "12 regional languages" : "Hindi and English"}.`,
        technicalApproach: `MobileNetV2 fine-tuned on PlantVillage dataset (54K images, 38 disease classes). ${iteration > 1 ? `Quantized to INT8 for edge deployment. Uses transfer learning with ${iteration * 500} additional locally-collected images.` : "Running inference on Raspberry Pi 4."}`,
        expectedImpact: `Reduce crop loss from 35% to ${Math.max(5, 35 - iteration * 5)}% for ${iteration * 50}K pilot farmers in Maharashtra state. ${iteration > 2 ? "Projected ₹2.3Cr annual savings across pilot regions." : ""}`,
        createdAt: new Date().toISOString(),
    };
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock Persona Critiques
// ────────────────────────────────────────────────────────────────────────────────

const PERSONA_TYPES: PersonaType[] = [
    "VISIONARY",
    "SYSTEMS_ARCHITECT",
    "MARKET_STRATEGIST",
    "UX_THINKER",
    "RISK_ANALYST",
    "ETHICS_REVIEWER",
    "COMPETITIVE_ANALYST",
];

export function createMockPersonaCritiques(
    iteration: number,
): PersonaCritique[] {
    return PERSONA_TYPES.map((personaType, i) => ({
        personaType,
        strengths: [
            `Strong technical foundation for ${personaType.toLowerCase()} perspective`,
            `Clear problem identification in iteration ${iteration}`,
            `Improved specificity over previous version`,
        ],
        weaknesses:
            iteration < 3
                ? [
                    `Lacks ${personaType === "MARKET_STRATEGIST" ? "market sizing" : "scalability analysis"}`,
                    `${personaType === "RISK_ANALYST" ? "No risk mitigation plan" : "Insufficient user testing data"}`,
                ]
                : [`Minor refinement needed in ${personaType.toLowerCase()} area`],
        suggestedRefinements: [
            `Add ${personaType === "UX_THINKER" ? "user journey mapping" : "quantitative metrics"}`,
            `Include ${personaType === "ETHICS_REVIEWER" ? "data privacy framework" : "competitive analysis"}`,
        ],
        priorityScore: Math.max(1, 8 - iteration - i * 0.3),
    }));
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock Judge Scores (Improving Pattern)
// ────────────────────────────────────────────────────────────────────────────────

const JUDGE_TYPES: JudgeType[] = [
    "VC_JUDGE",
    "TECHNICAL_JUDGE",
    "ACADEMIC_JUDGE",
    "INDUSTRY_JUDGE",
    "EXECUTION_JUDGE",
];

/**
 * Returns mock judge scores that improve each iteration.
 * Starts at ~7.0, reaches ~9.5 by iteration 5.
 * Judge variance is ±0.3 to test min-score logic.
 */
export function createMockJudgeScores(iteration: number): JudgeScore[] {
    const baseScore = Math.min(9.8, 7.0 + iteration * 0.5);

    return JUDGE_TYPES.map((judgeType, i) => {
        const variance = (i - 2) * 0.15; // -0.3 to +0.3
        const overall = Math.min(10, Math.max(0, baseScore + variance));

        return {
            judgeType,
            problemRelevance: Math.min(10, overall + 0.2),
            innovation: Math.min(10, overall - 0.1),
            feasibility: Math.min(10, overall + 0.1),
            userImpact: Math.min(10, overall + 0.3),
            presentation: Math.min(10, overall - 0.2),
            overallScore: overall,
            specificCritiques: [
                `Critique 1 from ${judgeType} for iteration ${iteration}`,
                `Needs ${judgeType === "VC_JUDGE" ? "revenue model" : "technical depth"}`,
            ],
            improvementDirectives: [
                `Improve ${judgeType === "TECHNICAL_JUDGE" ? "architecture diagram" : "market analysis"}`,
            ],
            passThreshold: overall >= 8.8,
        };
    });
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock RAG Context
// ────────────────────────────────────────────────────────────────────────────────

export function createMockRAGContext(): RAGContext {
    return {
        retrievedChunks: [
            "[WINNING] CropSense: Edge AI for multi-spectral crop analysis",
            "[FAILURE] LLM wrapper with no proprietary data source",
        ],
        similarityScores: [0.72, 0.45],
        noveltyPenalty: 0.25,
        buzzwordFlags: [],
    };
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock Convergence Metrics
// ────────────────────────────────────────────────────────────────────────────────

export function createMockConvergenceMetrics(
    iteration: number,
    scores: JudgeScore[],
): ConvergenceMetrics {
    const avgScore =
        scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
    const minScore = Math.min(...scores.map((s) => s.overallScore));

    return {
        averageScore: avgScore,
        minJudgeScore: minScore,
        noveltyScore: Math.min(1, 0.3 + iteration * 0.12),
        feasibilityScore: Math.min(10, 6.5 + iteration * 0.6),
        unresolvedCritiques: Math.max(0, 5 - iteration),
        isDiminishingReturns: false,
    };
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock Iteration Log Builder
// ────────────────────────────────────────────────────────────────────────────────

export function createMockIterationLog(iteration: number): IterationLog {
    const idea = createMockIdeaVersion(iteration);
    const scores = createMockJudgeScores(iteration);
    const critiques = createMockPersonaCritiques(iteration);
    const metrics = createMockConvergenceMetrics(iteration, scores);
    const avgScore =
        scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;

    return {
        id: crypto.randomUUID(),
        sessionId: "mock-session-id",
        iterationNumber: iteration,
        ideaVersion: idea,
        personaCritiques: critiques,
        judgeScores: scores,
        convergenceMetrics: metrics,
        averageScore: avgScore,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Create a full mock run of N iterations with improving scores.
 * Used by the integration test and convergence checks.
 */
export function createMockIterationLogs(count: number): IterationLog[] {
    return Array.from({ length: count }, (_, i) =>
        createMockIterationLog(i + 1),
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// Mock Embeddings (deterministic)
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Generate a deterministic mock embedding from a seed number.
 * Returns a 1536-dim vector (matching DB schema) with reproducible values.
 */
export function createMockEmbedding(seed: number): number[] {
    const embedding = new Array(1536);
    let s = seed;
    for (let i = 0; i < 1536; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        embedding[i] = (s / 0x7fffffff) * 2 - 1;
    }
    const norm = Math.sqrt(embedding.reduce((sum: number, v: number) => sum + v * v, 0));
    return embedding.map((v: number) => v / norm);
}
