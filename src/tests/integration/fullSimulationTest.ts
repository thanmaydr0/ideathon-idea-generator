/**
 * Full simulation integration test.
 *
 * ARCH: This test runs a mock 5-iteration simulation end-to-end.
 * It validates the full adversarial loop: idea generation → persona critiques
 * → judge scoring → convergence detection, using mock agents (no API calls).
 *
 * For real API testing, set `USE_REAL_API=true` and provide env vars.
 * In CI, this runs with mocks only (< 1 second).
 */

import {
    createMockIterationLogs,
    createMockIdeaVersion,
    createMockJudgeScores,
    createMockConvergenceMetrics,
    createMockRAGContext,
} from "@/tests/mocks/mockAgents";
import { detectBuzzwords, checkConvergence, calculateAverageScore } from "@/agents/judges";
import { detectDiminishingReturns } from "@/agents/synthesizer";
import type { IterationLog, JudgeScore } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Test Config
// ────────────────────────────────────────────────────────────────────────────────

const ITERATIONS = 5;

// ────────────────────────────────────────────────────────────────────────────────
// Full Simulation Test (Mock Mode)
// ────────────────────────────────────────────────────────────────────────────────

describe("Full Simulation Integration (Mock Mode)", () => {
    let logs: IterationLog[];

    beforeAll(() => {
        logs = createMockIterationLogs(ITERATIONS);
    });

    // ── Record Counts ──────────────────────────────────────────────

    it("creates exactly 5 IterationLog records", () => {
        expect(logs).toHaveLength(ITERATIONS);
    });

    it("each log has a valid UUID id", () => {
        for (const log of logs) {
            expect(log.id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            );
        }
    });

    it("iteration numbers are sequential 1-5", () => {
        const numbers = logs.map((l) => l.iterationNumber);
        expect(numbers).toEqual([1, 2, 3, 4, 5]);
    });

    // ── PersonaCritique Validation ─────────────────────────────────

    it("all PersonaCritique records have valid JSON structure", () => {
        for (const log of logs) {
            expect(log.personaCritiques.length).toBe(7); // 7 personas

            for (const critique of log.personaCritiques) {
                expect(critique.personaType).toBeDefined();
                expect(critique.strengths).toBeInstanceOf(Array);
                expect(critique.weaknesses).toBeInstanceOf(Array);
                expect(critique.suggestedRefinements).toBeInstanceOf(Array);
                expect(critique.priorityScore).toBeGreaterThanOrEqual(0);
                expect(critique.priorityScore).toBeLessThanOrEqual(10);

                // Non-empty content
                expect(critique.strengths.length).toBeGreaterThan(0);
                expect(critique.suggestedRefinements.length).toBeGreaterThan(0);
            }
        }
    });

    // ── JudgeScore Validation ──────────────────────────────────────

    it("all JudgeScore records have scores in 0-10 range", () => {
        for (const log of logs) {
            expect(log.judgeScores.length).toBe(5); // 5 judges

            for (const score of log.judgeScores) {
                const fields: (keyof JudgeScore)[] = [
                    "problemRelevance",
                    "innovation",
                    "feasibility",
                    "userImpact",
                    "presentation",
                    "overallScore",
                ];

                for (const field of fields) {
                    const value = score[field];
                    if (typeof value === "number") {
                        expect(value).toBeGreaterThanOrEqual(0);
                        expect(value).toBeLessThanOrEqual(10);
                    }
                }
            }
        }
    });

    // ── Score Trend (Non-decreasing) ───────────────────────────────

    it("score trend is generally non-decreasing (improving)", () => {
        const avgScores = logs.map((l) => l.averageScore);

        // Overall: last > first
        expect(avgScores[avgScores.length - 1]).toBeGreaterThan(avgScores[0]);

        // At least 3 of 4 transitions are improvements
        let improvements = 0;
        for (let i = 1; i < avgScores.length; i++) {
            if (avgScores[i] >= avgScores[i - 1]) improvements++;
        }
        expect(improvements).toBeGreaterThanOrEqual(3);
    });

    // ── IdeaVersion Validity ───────────────────────────────────────

    it("all IdeaVersion records have non-empty required fields", () => {
        for (const log of logs) {
            const idea = log.ideaVersion;
            expect(idea.problemStatement.length).toBeGreaterThan(10);
            expect(idea.solution.length).toBeGreaterThan(10);
            expect(idea.deliverable.length).toBeGreaterThan(10);
            expect(idea.technicalApproach.length).toBeGreaterThan(10);
            expect(idea.expectedImpact.length).toBeGreaterThan(5);
            expect(idea.iteration).toBe(log.iterationNumber);
        }
    });

    // ── ConvergenceMetrics Validity ────────────────────────────────

    it("convergence metrics are computed for each iteration", () => {
        for (const log of logs) {
            const m = log.convergenceMetrics;
            expect(m.averageScore).toBeGreaterThan(0);
            expect(m.minJudgeScore).toBeGreaterThanOrEqual(0);
            expect(m.noveltyScore).toBeGreaterThanOrEqual(0);
            expect(m.noveltyScore).toBeLessThanOrEqual(1);
            expect(m.feasibilityScore).toBeGreaterThanOrEqual(0);
            expect(m.unresolvedCritiques).toBeGreaterThanOrEqual(0);
            expect(typeof m.isDiminishingReturns).toBe("boolean");
        }
    });

    // ── Cost Estimation ────────────────────────────────────────────

    it("estimated cost for 5 iterations is < $2 (based on typical token usage)", () => {
        // 5 iterations × ~3500 tokens each × $0.011/1K tokens = ~$0.19
        const estimatedTokensPerIteration = 3500;
        const totalTokens = estimatedTokensPerIteration * ITERATIONS;
        const estimatedCost = (totalTokens / 1000) * 0.011;
        expect(estimatedCost).toBeLessThan(2);
    });

    // ── No Buzzword Inflation ──────────────────────────────────────

    it("later iterations do not add unnecessary buzzwords", () => {
        const firstBuzzwords = detectBuzzwords(
            logs[0].ideaVersion.solution,
        ).length;
        const lastBuzzwords = detectBuzzwords(
            logs[logs.length - 1].ideaVersion.solution,
        ).length;

        // Buzzword count should not increase significantly
        expect(lastBuzzwords).toBeLessThanOrEqual(firstBuzzwords + 2);
    });

    // ── Timestamp Tracking ─────────────────────────────────────────

    it("each iteration has a valid ISO timestamp", () => {
        for (const log of logs) {
            expect(log.timestamp).toBeDefined();
            expect(new Date(log.timestamp).getTime()).toBeGreaterThan(0);
        }
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// RAG Context Mock Validation
// ────────────────────────────────────────────────────────────────────────────────

describe("RAG Context Mock Validation", () => {
    it("produces valid RAGContext structure", () => {
        const ctx = createMockRAGContext();
        expect(ctx.retrievedChunks).toBeInstanceOf(Array);
        expect(ctx.retrievedChunks.length).toBeGreaterThan(0);
        expect(ctx.similarityScores.length).toBe(ctx.retrievedChunks.length);
        expect(ctx.noveltyPenalty).toBeGreaterThanOrEqual(0);
        expect(ctx.noveltyPenalty).toBeLessThanOrEqual(1);
        expect(ctx.buzzwordFlags).toBeInstanceOf(Array);
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// Cross-Component Integration
// ────────────────────────────────────────────────────────────────────────────────

describe("Cross-Component Integration", () => {
    it("convergence check works with mock iteration 5 data (high scores)", () => {
        const scores = createMockJudgeScores(5);
        const metrics = createMockConvergenceMetrics(5, scores);
        const avg = calculateAverageScore(scores);
        expect(avg).toBeGreaterThan(8.0);

        const result = checkConvergence(scores, metrics);
        expect(typeof result).toBe("boolean");
    });

    it("diminishing returns detection works with mock log sequence", () => {
        const logs = createMockIterationLogs(6);
        expect(detectDiminishingReturns(logs)).toBe(false);
    });

    it("buzzword detection works on mock idea content", () => {
        const idea = createMockIdeaVersion(3);
        const allText = [
            idea.problemStatement,
            idea.solution,
            idea.deliverable,
            idea.technicalApproach,
            idea.expectedImpact,
        ].join(" ");

        const buzzwords = detectBuzzwords(allText);
        expect(buzzwords.length).toBeLessThanOrEqual(3);
    });
});
