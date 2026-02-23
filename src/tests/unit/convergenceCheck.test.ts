import { checkConvergence, calculateAverageScore } from "@/agents/judges";
import {
    createMockJudgeScores,
    createMockConvergenceMetrics,
} from "@/tests/mocks/mockAgents";
import type { JudgeScore, ConvergenceMetrics } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Convergence Check Tests
// ────────────────────────────────────────────────────────────────────────────────

describe("checkConvergence", () => {
    it("returns false when scores are too low (iteration 1, ~7.0 avg)", () => {
        const scores = createMockJudgeScores(1);
        const metrics = createMockConvergenceMetrics(1, scores);
        expect(checkConvergence(scores, metrics)).toBe(false);
    });

    it("returns false when average is high but min judge is below threshold", () => {
        const scores = createMockJudgeScores(4); // ~9.0 avg
        // Force one judge way below threshold
        const modified: JudgeScore[] = scores.map((s, i) =>
            i === 0 ? { ...s, overallScore: 5.0, passThreshold: false } : s,
        );
        const metrics = createMockConvergenceMetrics(4, modified);
        expect(checkConvergence(modified, metrics)).toBe(false);
    });

    it("returns false when novelty score is too low", () => {
        const scores = createMockJudgeScores(5);
        const metrics: ConvergenceMetrics = {
            ...createMockConvergenceMetrics(5, scores),
            noveltyScore: 0.1, // Below 0.3 threshold
        };
        expect(checkConvergence(scores, metrics)).toBe(false);
    });

    it("returns false when feasibility score is too low", () => {
        const scores = createMockJudgeScores(5);
        const metrics: ConvergenceMetrics = {
            ...createMockConvergenceMetrics(5, scores),
            feasibilityScore: 4.0, // Below 7.0 threshold
        };
        expect(checkConvergence(scores, metrics)).toBe(false);
    });

    it("returns false when too many unresolved critiques", () => {
        const scores = createMockJudgeScores(5);
        const metrics: ConvergenceMetrics = {
            ...createMockConvergenceMetrics(5, scores),
            unresolvedCritiques: 5, // Above 2 threshold
        };
        expect(checkConvergence(scores, metrics)).toBe(false);
    });

    it("returns false when diminishing returns detected", () => {
        const scores = createMockJudgeScores(5);
        const metrics: ConvergenceMetrics = {
            ...createMockConvergenceMetrics(5, scores),
            isDiminishingReturns: true,
        };
        expect(checkConvergence(scores, metrics)).toBe(false);
    });

    it("returns false when not all judges pass threshold", () => {
        const scores = createMockJudgeScores(5).map((s) => ({
            ...s,
            overallScore: 9.0,
            passThreshold: false, // Force fail
        }));
        const metrics: ConvergenceMetrics = {
            ...createMockConvergenceMetrics(5, scores),
            unresolvedCritiques: 0,
        };
        expect(checkConvergence(scores, metrics)).toBe(false);
    });

    it("returns true when ALL convergence conditions are met", () => {
        const scores: JudgeScore[] = createMockJudgeScores(5).map((s) => ({
            ...s,
            overallScore: 9.0,
            passThreshold: true,
        }));
        const metrics: ConvergenceMetrics = {
            averageScore: 9.0,
            minJudgeScore: 9.0,
            noveltyScore: 0.5,
            feasibilityScore: 8.0,
            unresolvedCritiques: 1,
            isDiminishingReturns: false,
        };
        expect(checkConvergence(scores, metrics)).toBe(true);
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// calculateAverageScore Tests
// ────────────────────────────────────────────────────────────────────────────────

describe("calculateAverageScore", () => {
    it("returns 0 for empty array", () => {
        expect(calculateAverageScore([])).toBe(0);
    });

    it("calculates correct average for valid scores", () => {
        const scores = createMockJudgeScores(3);
        const avg = calculateAverageScore(scores);
        const expected =
            scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
        expect(avg).toBeCloseTo(expected, 5);
    });

    it("returns positive number for non-empty scores", () => {
        const scores = createMockJudgeScores(1);
        expect(calculateAverageScore(scores)).toBeGreaterThan(0);
    });
});
