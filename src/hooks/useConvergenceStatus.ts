import { useMemo } from "react";
import { useSimulationStore } from "@/store/simulationStore";

// ────────────────────────────────────────────────────────────────────────────────
// Convergence Config
// ────────────────────────────────────────────────────────────────────────────────

/**
 * ARCH: These thresholds mirror the orchestrator's CONVERGENCE_RULES.
 * They're duplicated here (not imported) because the orchestrator is
 * a runtime module and importing it in a derived-state hook would
 * create an unnecessary dependency for SSR/test contexts.
 */
const CONVERGENCE_TARGETS = {
    averageScore: 9.3,
    minJudgeScore: 8.8,
    noveltyScore: 9.0,
    feasibilityScore: 8.5,
    unresolvedCritiques: 0,
} as const;

/** Weight each dimension contributes to the overall convergence %. */
const DIMENSION_WEIGHTS = {
    averageScore: 0.30,
    minJudgeScore: 0.25,
    noveltyScore: 0.15,
    feasibilityScore: 0.20,
    unresolvedCritiques: 0.10,
} as const;

// ────────────────────────────────────────────────────────────────────────────────
// Return Type
// ────────────────────────────────────────────────────────────────────────────────

export interface ConvergenceStatus {
    /** Overall convergence progress 0-100%. */
    percentage: number;
    /** Per-dimension progress 0-100%. */
    dimensions: {
        averageScore: number;
        minJudgeScore: number;
        noveltyScore: number;
        feasibilityScore: number;
        unresolvedCritiques: number;
    };
    /** Estimated iterations remaining (null if insufficient data). */
    estimatedIterationsRemaining: number | null;
    /** Whether the simulation has fully converged. */
    isConverged: boolean;
    /** Improvement trend: "improving" | "plateau" | "regressing". */
    trend: "improving" | "plateau" | "regressing";
}

// ────────────────────────────────────────────────────────────────────────────────
// Linear Regression
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Simple linear regression on (x, y) pairs.
 * Returns slope and intercept, or null if insufficient data.
 *
 * Used to predict how many more iterations are needed to reach
 * the convergence threshold based on the recent score trajectory.
 */
function linearRegression(
    points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number } | null {
    const n = points.length;
    if (n < 2) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumX2 += p.x * p.x;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

// ────────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Derived state hook that computes convergence progress from iteration logs.
 *
 * ARCH: Uses the last 5 iteration logs to calculate:
 * 1. Per-dimension progress (current value / target × 100)
 * 2. Weighted overall convergence percentage
 * 3. Linear regression on average scores to estimate iterations remaining
 * 4. Trend detection (improving/plateau/regressing)
 *
 * Memoized to only recompute when iterationLogs or convergenceMetrics change.
 */
export function useConvergenceStatus(): ConvergenceStatus {
    const convergenceMetrics = useSimulationStore((s) => s.convergenceMetrics);
    const iterationLogs = useSimulationStore((s) => s.iterationLogs);
    const status = useSimulationStore((s) => s.status);

    return useMemo(() => {
        // Default state when no metrics exist yet
        if (!convergenceMetrics) {
            return {
                percentage: 0,
                dimensions: {
                    averageScore: 0,
                    minJudgeScore: 0,
                    noveltyScore: 0,
                    feasibilityScore: 0,
                    unresolvedCritiques: 0,
                },
                estimatedIterationsRemaining: null,
                isConverged: status === "CONVERGED",
                trend: "plateau" as const,
            };
        }

        // ── Per-dimension progress ─────────────────────────────────
        const dimProgress = {
            averageScore: Math.min(
                100,
                (convergenceMetrics.averageScore / CONVERGENCE_TARGETS.averageScore) * 100,
            ),
            minJudgeScore: Math.min(
                100,
                (convergenceMetrics.minJudgeScore / CONVERGENCE_TARGETS.minJudgeScore) * 100,
            ),
            noveltyScore: Math.min(
                100,
                ((convergenceMetrics.noveltyScore * 10) / CONVERGENCE_TARGETS.noveltyScore) * 100,
            ),
            feasibilityScore: Math.min(
                100,
                (convergenceMetrics.feasibilityScore / CONVERGENCE_TARGETS.feasibilityScore) * 100,
            ),
            unresolvedCritiques:
                convergenceMetrics.unresolvedCritiques === 0
                    ? 100
                    : Math.max(0, 100 - convergenceMetrics.unresolvedCritiques * 20),
        };

        // ── Weighted overall percentage ────────────────────────────
        const percentage =
            dimProgress.averageScore * DIMENSION_WEIGHTS.averageScore +
            dimProgress.minJudgeScore * DIMENSION_WEIGHTS.minJudgeScore +
            dimProgress.noveltyScore * DIMENSION_WEIGHTS.noveltyScore +
            dimProgress.feasibilityScore * DIMENSION_WEIGHTS.feasibilityScore +
            dimProgress.unresolvedCritiques * DIMENSION_WEIGHTS.unresolvedCritiques;

        // ── Linear regression on last 5 logs ───────────────────────
        const recentLogs = iterationLogs
            .slice(-5)
            .sort((a, b) => a.iterationNumber - b.iterationNumber);

        const regressionPoints = recentLogs.map((log) => ({
            x: log.iterationNumber,
            y: log.averageScore,
        }));

        const regression = linearRegression(regressionPoints);
        let estimatedIterationsRemaining: number | null = null;

        if (regression && regression.slope > 0.01) {
            // y = mx + b → solve for x when y = target
            const targetX =
                (CONVERGENCE_TARGETS.averageScore - regression.intercept) /
                regression.slope;
            const currentIter =
                recentLogs.length > 0
                    ? recentLogs[recentLogs.length - 1].iterationNumber
                    : 0;
            const remaining = Math.ceil(targetX - currentIter);
            estimatedIterationsRemaining = Math.max(0, remaining);
        } else if (regression && regression.slope <= 0.01) {
            // Not improving — can't estimate convergence
            estimatedIterationsRemaining = null;
        }

        // ── Trend detection ────────────────────────────────────────
        let trend: "improving" | "plateau" | "regressing" = "plateau";
        if (recentLogs.length >= 2) {
            const last = recentLogs[recentLogs.length - 1].averageScore;
            const secondLast = recentLogs[recentLogs.length - 2].averageScore;
            const delta = last - secondLast;
            if (delta > 0.05) trend = "improving";
            else if (delta < -0.05) trend = "regressing";
        }

        return {
            percentage: Math.min(100, Math.round(percentage * 10) / 10),
            dimensions: {
                averageScore: Math.round(dimProgress.averageScore * 10) / 10,
                minJudgeScore: Math.round(dimProgress.minJudgeScore * 10) / 10,
                noveltyScore: Math.round(dimProgress.noveltyScore * 10) / 10,
                feasibilityScore: Math.round(dimProgress.feasibilityScore * 10) / 10,
                unresolvedCritiques: Math.round(dimProgress.unresolvedCritiques * 10) / 10,
            },
            estimatedIterationsRemaining,
            isConverged: status === "CONVERGED",
            trend,
        };
    }, [convergenceMetrics, iterationLogs, status]);
}
