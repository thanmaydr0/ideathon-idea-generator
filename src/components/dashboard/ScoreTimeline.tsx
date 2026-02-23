import { memo } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Legend,
} from "recharts";
import type { IterationLog } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface ScoreTimelineProps {
    logs: IterationLog[];
}

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Line chart showing score evolution across iterations.
 * Tracks 4 key metrics: average score, min judge score, novelty, and feasibility.
 * A dashed red reference line at 9.3 marks the convergence threshold.
 */
export const ScoreTimeline = memo(function ScoreTimeline({ logs }: ScoreTimelineProps) {
    const chartData = logs.map((log) => ({
        iteration: log.iterationNumber,
        average: Number(log.averageScore.toFixed(2)),
        minJudge: Number(log.convergenceMetrics.minJudgeScore.toFixed(2)),
        novelty: Number((log.convergenceMetrics.noveltyScore * 10).toFixed(2)), // 0-1 → 0-10
        feasibility: Number(log.convergenceMetrics.feasibilityScore.toFixed(2)),
    }));

    return (
        <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Score Timeline
            </h3>
            <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                        dataKey="iteration"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        label={{ value: "Iteration", position: "insideBottom", offset: -5, fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <YAxis
                        domain={[0, 10]}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: 12,
                        }}
                    />

                    {/* Convergence threshold */}
                    <ReferenceLine
                        y={9.3}
                        stroke="#ef4444"
                        strokeDasharray="6 3"
                        strokeWidth={1.5}
                        label={{ value: "Target 9.3", fill: "#ef4444", fontSize: 10, position: "right" }}
                    />

                    <Line
                        type="monotone"
                        dataKey="average"
                        name="Average"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#3b82f6" }}
                        animationDuration={600}
                    />
                    <Line
                        type="monotone"
                        dataKey="minJudge"
                        name="Min Judge"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        dot={{ r: 2 }}
                        animationDuration={600}
                    />
                    <Line
                        type="monotone"
                        dataKey="novelty"
                        name="Novelty"
                        stroke="#8b5cf6"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        animationDuration={600}
                    />
                    <Line
                        type="monotone"
                        dataKey="feasibility"
                        name="Feasibility"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        animationDuration={600}
                    />

                    <Legend
                        wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
});
