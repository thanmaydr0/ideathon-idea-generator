/**
 * Deterministic Demo Mode Data Generator
 *
 * ARCH: This file generates a full 20-iteration simulation run for the
 * "Federated Learning HealthTech" scenario. It produces perfectly valid
 * Zod-schema-compliant data to drive the UI without incurring real
 * OpenAI API costs. Used for presentations and fast testing.
 */

import type {
    IterationLog,
    IdeaVersion,
    JudgeScore,
    PersonaCritique,
    ConvergenceMetrics,
} from "@/types";

export interface DemoEvent {
    iteration: number;
    title: string;
    description: string;
    type: "warning" | "info" | "success";
}

export const DEMO_EVENTS: DemoEvent[] = [
    {
        iteration: 3,
        title: "Buzzword Penalty",
        description: "Buzzword penalty applied (-0.5 innovation score) due to excessive use of 'revolutionary' and 'blockchain'.",
        type: "warning",
    },
    {
        iteration: 5,
        title: "Groupthink Detected",
        description: "Groupthink detected — Competitive Analyst forced contrarian stance to inject variance.",
        type: "warning",
    },
    {
        iteration: 8,
        title: "Idea Drift",
        description: "Idea drift warning — core value prop lost. Reverting to best version from Iteration 7.",
        type: "warning",
    },
    {
        iteration: 12,
        title: "Diminishing Returns",
        description: "Diminishing returns — scores plateaued. Triggering radical refinement via Systems Architect.",
        type: "info",
    },
    {
        iteration: 18,
        title: "Convergence Reached",
        description: "All convergence thresholds met — CONVERGED. High confidence in execution and market fit.",
        type: "success",
    },
];

export function getDemoIterationLogs(): IterationLog[] {
    const logs: IterationLog[] = [];
    const sessionId = crypto.randomUUID();

    // Baseline stats
    let currentScore = 6.5;

    for (let i = 1; i <= 20; i++) {
        // Progression logic
        if (i === 3) {
            currentScore -= 0.2; // Buzzword penalty
        } else if (i === 8) {
            currentScore -= 0.3; // Drift drop
        } else if (i >= 10 && i <= 12) {
            currentScore += 0.02; // Diminishing returns plateau
        } else if (i === 13) {
            currentScore += 0.6; // Radical pivot bounce
        } else if (i === 18) {
            currentScore = Math.max(8.8, currentScore + 0.2); // Forced convergence
        } else {
            // Normal progression
            currentScore += (9.5 - currentScore) * 0.15;
        }

        // Add some jitter
        const jitteredScore = currentScore + (Math.random() * 0.1 - 0.05);
        const finalScore = Math.min(10, Math.max(0, jitteredScore));

        const ideaVersion: IdeaVersion = {
            id: crypto.randomUUID(),
            iteration: i,
            problemStatement: `Hospitals cannot share patient data to train AI models due to HIPAA/GDPR constraints, siloing diagnostic knowledge. (v${i})`,
            solution: i === 3
                ? `A revolutionary AI-powered blockchain network leveraging seamless smart contracts for disruptive federated learning.`
                : `A federated learning platform that deploys models to hospital edge servers. Only model weights are aggregated globally, ensuring zero patient data leaves the premises. ${i >= 13 ? "Now features differential privacy layers." : ""}`,
            deliverable: `A secure edge node appliance and a centralized aggregation dashboard for model performance tracking. ${i >= 5 ? "Includes compliance reporting tools." : ""}`,
            technicalApproach: `PySyft for federated coordination. Models trained locally on hospital GPUs. ${i >= 13 ? "Differential privacy noise added via Opacus before weight aggregation." : ""}`,
            expectedImpact: `Unlock 10x more training data for rare diseases without violating privacy laws. ${i >= 18 ? "Targeting $50M ARR within 3 years via top 10 US hospital networks." : ""}`,
            createdAt: new Date().toISOString(),
        };

        const critiques: PersonaCritique[] = [
            "VISIONARY",
            "SYSTEMS_ARCHITECT",
            "MARKET_STRATEGIST",
            "UX_THINKER",
            "RISK_ANALYST",
            "ETHICS_REVIEWER",
            "COMPETITIVE_ANALYST",
        ].map((type) => {
            // Simulate forced contrarian for Competitive Analyst at iter 5
            const priority = (i === 5 && type === "COMPETITIVE_ANALYST") ? 9.5 : Math.max(1, 8 - (i * 0.2));
            return {
                personaType: type as any,
                strengths: [`Strong ${type.toLowerCase()} alignment in v${i}.`],
                weaknesses: i >= 18 ? [] : [`Needs broader ${type.toLowerCase()} coverage.`],
                suggestedRefinements: [`Focus on ${type.toLowerCase()} execution.`],
                priorityScore: priority,
            };
        });

        const judges: JudgeScore[] = [
            "VC_JUDGE",
            "TECHNICAL_JUDGE",
            "ACADEMIC_JUDGE",
            "INDUSTRY_JUDGE",
            "EXECUTION_JUDGE",
        ].map((type) => {
            // Add variance per judge
            const variance = (Math.random() * 0.6 - 0.3);
            let judgeScore = finalScore + variance;

            // Apply buzzword penalty to specific judges in iter 3
            if (i === 3 && (type === "TECHNICAL_JUDGE" || type === "VC_JUDGE")) {
                judgeScore -= 1.0;
            }

            const overall = Math.min(10, Math.max(0, judgeScore));

            return {
                judgeType: type as any,
                problemRelevance: Math.min(10, overall + 0.2),
                innovation: i === 3 ? overall - 0.8 : Math.min(10, overall + 0.1),
                feasibility: Math.min(10, overall - 0.1),
                userImpact: Math.min(10, overall + 0.3),
                presentation: Math.min(10, overall - 0.2),
                overallScore: overall,
                specificCritiques: [`Detailed critique from ${type} for v${i}`],
                improvementDirectives: [`Improvement directive from ${type}`],
                passThreshold: overall >= 8.8,
            };
        });

        const actualAvg = judges.reduce((a, b) => a + b.overallScore, 0) / judges.length;
        const actualMin = Math.min(...judges.map(j => j.overallScore));

        const metrics: ConvergenceMetrics = {
            averageScore: actualAvg,
            minJudgeScore: actualMin,
            noveltyScore: Math.min(1, 0.4 + (i * 0.03)),
            feasibilityScore: actualAvg * 0.9,
            unresolvedCritiques: Math.max(0, 8 - Math.floor(i / 2)),
            isDiminishingReturns: i >= 10 && i <= 12,
        };

        logs.push({
            id: crypto.randomUUID(),
            sessionId,
            iterationNumber: i,
            ideaVersion,
            personaCritiques: critiques,
            judgeScores: judges,
            averageScore: actualAvg,
            convergenceMetrics: metrics,
            timestamp: new Date().toISOString(),
        });
    }

    return logs;
}
