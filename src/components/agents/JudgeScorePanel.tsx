import { memo } from "react";
import type { JudgeScore } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Judge Config
// ────────────────────────────────────────────────────────────────────────────────

const JUDGE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    VC_JUDGE: { icon: "💰", label: "VC Judge", color: "text-emerald-400" },
    TECHNICAL_JUDGE: { icon: "🔬", label: "Technical", color: "text-blue-400" },
    ACADEMIC_JUDGE: { icon: "🎓", label: "Academic", color: "text-violet-400" },
    INDUSTRY_JUDGE: { icon: "🏢", label: "Industry", color: "text-amber-400" },
    EXECUTION_JUDGE: { icon: "🚀", label: "Execution", color: "text-cyan-400" },
};

const SCORE_DIMENSIONS: { key: keyof Pick<JudgeScore, "problemRelevance" | "innovation" | "feasibility" | "userImpact" | "presentation">; label: string }[] = [
    { key: "problemRelevance", label: "Relevance" },
    { key: "innovation", label: "Innovation" },
    { key: "feasibility", label: "Feasibility" },
    { key: "userImpact", label: "Impact" },
    { key: "presentation", label: "Presentation" },
];

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface JudgeScorePanelProps {
    scores: JudgeScore[];
    isLoading?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Panel showing 5 judge score cards with dimension breakdown bars,
 * overall score, pass/fail badge, and improvement directives.
 * Red highlight on any dimension below 8.8.
 */
export const JudgeScorePanel = memo(function JudgeScorePanel({
    scores,
    isLoading,
}: JudgeScorePanelProps) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Judge Scores
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
                            <div className="h-4 bg-muted rounded w-24 mb-4" />
                            <div className="h-10 bg-muted rounded w-16 mx-auto mb-3" />
                            <div className="space-y-2">
                                {Array.from({ length: 5 }).map((_, j) => (
                                    <div key={j} className="h-2 bg-muted rounded" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (scores.length === 0) {
        return (
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Judge Scores
                </h3>
                <div className="text-center py-8 text-muted-foreground">
                    Waiting for judge evaluation...
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Judge Scores
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {scores.map((score) => (
                    <JudgeCard key={score.judgeType} score={score} />
                ))}
            </div>
        </div>
    );
});

// ────────────────────────────────────────────────────────────────────────────────
// Judge Card
// ────────────────────────────────────────────────────────────────────────────────

const JudgeCard = memo(function JudgeCard({ score }: { score: JudgeScore }) {
    const config = JUDGE_CONFIG[score.judgeType] ?? {
        icon: "⚖️",
        label: score.judgeType,
        color: "text-foreground",
    };

    const anyBelowThreshold = SCORE_DIMENSIONS.some(
        (d) => score[d.key] < 8.8,
    );

    return (
        <div
            className={`rounded-lg border bg-card p-4 space-y-3 ${anyBelowThreshold ? "border-red-500/30" : "border-border"
                }`}
        >
            {/* Header + Overall Score */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{config.icon}</span>
                    <span className={`text-sm font-medium ${config.color}`}>
                        {config.label}
                    </span>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums text-foreground">
                        {score.overallScore.toFixed(1)}
                    </div>
                    <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${score.passThreshold
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                    >
                        {score.passThreshold ? "PASS" : "FAIL"}
                    </span>
                </div>
            </div>

            {/* Score Bars */}
            <div className="space-y-1.5">
                {SCORE_DIMENSIONS.map((dim) => {
                    const value = score[dim.key];
                    const pct = (value / 10) * 100;
                    const belowThreshold = value < 8.8;

                    return (
                        <div key={dim.key} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-20 shrink-0">
                                {dim.label}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${belowThreshold ? "bg-red-500" : "bg-blue-500"
                                        }`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span
                                className={`text-xs tabular-nums w-8 text-right ${belowThreshold ? "text-red-400" : "text-muted-foreground"
                                    }`}
                            >
                                {value.toFixed(1)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Improvement Directives */}
            {score.improvementDirectives.length > 0 && (
                <div className="pt-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                        Directives
                    </p>
                    <ol className="space-y-0.5">
                        {score.improvementDirectives.slice(0, 3).map((d, i) => (
                            <li
                                key={i}
                                className="text-xs text-muted-foreground leading-relaxed"
                            >
                                <span className="text-foreground/40">{i + 1}.</span> {d}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
});
