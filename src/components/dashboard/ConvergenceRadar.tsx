import { memo } from "react";
import {
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
    ResponsiveContainer,
    Legend,
} from "recharts";
import type { JudgeScore } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface ConvergenceRadarProps {
    currentScores: JudgeScore[];
    previousScores?: JudgeScore[];
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

const DIMENSIONS = [
    { key: "problemRelevance", label: "Relevance" },
    { key: "innovation", label: "Innovation" },
    { key: "feasibility", label: "Feasibility" },
    { key: "userImpact", label: "Impact" },
    { key: "presentation", label: "Presentation" },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]["key"];

function averageDimension(scores: JudgeScore[], key: DimensionKey): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s[key], 0) / scores.length;
}

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Radar chart showing the 5 scoring dimensions averaged across all judges.
 * Overlays current vs previous iteration for visual comparison.
 * A target threshold ring at 9.0 shows how close the idea is to convergence.
 */
export const ConvergenceRadar = memo(function ConvergenceRadar({
    currentScores,
    previousScores,
}: ConvergenceRadarProps) {
    const radarData = DIMENSIONS.map((dim) => ({
        dimension: dim.label,
        current: Number(averageDimension(currentScores, dim.key).toFixed(2)),
        previous: previousScores
            ? Number(averageDimension(previousScores, dim.key).toFixed(2))
            : 0,
        target: 9.0,
    }));

    return (
        <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Convergence Radar
            </h3>
            <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                        dataKey="dimension"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 10]}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    />
                    {/* Target threshold ring */}
                    <Radar
                        name="Target (9.0)"
                        dataKey="target"
                        stroke="#ef444480"
                        fill="transparent"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                    />
                    {/* Previous iteration (faded) */}
                    {previousScores && previousScores.length > 0 && (
                        <Radar
                            name="Previous"
                            dataKey="previous"
                            stroke="#64748b"
                            fill="#64748b"
                            fillOpacity={0.1}
                            strokeWidth={1}
                        />
                    )}
                    {/* Current iteration (vivid) */}
                    <Radar
                        name="Current"
                        dataKey="current"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.2}
                        strokeWidth={2}
                    />
                    <Legend
                        wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
});
