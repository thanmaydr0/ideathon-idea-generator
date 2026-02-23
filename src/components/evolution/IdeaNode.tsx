import { memo } from "react";
import { Handle, Position } from "reactflow";
import type { NodeProps } from "reactflow";
import type { IterationLog } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Node Data Interface
// ────────────────────────────────────────────────────────────────────────────────

export interface IdeaNodeData {
    log: IterationLog;
    isBest: boolean;
    isPivot: boolean;
    isConverged: boolean;
    isSelected: boolean;
    onClick: (log: IterationLog) => void;
}

// ────────────────────────────────────────────────────────────────────────────────
// Score → Color Mapping
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Maps a 0-10 score to a red→yellow→green gradient.
 * - 0-5: red (#ef4444) to amber (#f59e0b)
 * - 5-10: amber (#f59e0b) to green (#22c55e)
 */
function scoreToColor(score: number): string {
    const clamped = Math.max(0, Math.min(10, score));
    if (clamped <= 5) {
        const t = clamped / 5;
        const r = Math.round(239 + (245 - 239) * t);
        const g = Math.round(68 + (158 - 68) * t);
        const b = Math.round(68 + (11 - 68) * t);
        return `rgb(${r}, ${g}, ${b})`;
    }
    const t = (clamped - 5) / 5;
    const r = Math.round(245 + (34 - 245) * t);
    const g = Math.round(158 + (197 - 158) * t);
    const b = Math.round(11 + (94 - 11) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

/** Clamp and format score for display. */
function fmt(n: number): string {
    return Math.max(0, Math.min(10, n)).toFixed(1);
}

// ────────────────────────────────────────────────────────────────────────────────
// Mini Score Bar
// ────────────────────────────────────────────────────────────────────────────────

function MiniBar({ label, value }: { label: string; value: number }) {
    const pct = (Math.min(10, Math.max(0, value)) / 10) * 100;
    return (
        <div className="flex items-center gap-1">
            <span className="text-[9px] text-zinc-500 w-[42px] shrink-0 text-right">
                {label}
            </span>
            <div className="flex-1 h-[3px] rounded-full bg-zinc-800 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: scoreToColor(value) }}
                />
            </div>
            <span className="text-[9px] text-zinc-500 w-6 tabular-nums">{fmt(value)}</span>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// IdeaNode — Custom ReactFlow Node
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Custom node for the idea evolution DAG.
 *
 * Shows:
 * - Large score badge (colored by red→yellow→green gradient)
 * - Status icon: 🔄 normal, ↩️ pivot, ✅ converged
 * - Crown icon 👑 on the highest-scoring node
 * - 5 mini score bars for each scoring dimension
 * - Iteration number label
 */
function IdeaNodeComponent({ data }: NodeProps<IdeaNodeData>) {
    const { log, isBest, isPivot, isConverged, isSelected, onClick } = data;
    const score = log.averageScore;
    const color = scoreToColor(score);

    const statusIcon = isConverged ? "✅" : isPivot ? "↩️" : "🔄";
    const borderClass = isSelected
        ? "ring-2 ring-blue-500 border-blue-500/50"
        : isConverged
            ? "border-emerald-500/50"
            : isPivot
                ? "border-amber-500/50"
                : "border-zinc-700/50";

    return (
        <div
            onClick={() => onClick(log)}
            className={`relative bg-zinc-900 rounded-xl border p-3 w-[180px] cursor-pointer hover:bg-zinc-800/80 transition-colors ${borderClass}`}
        >
            {/* Handles for react-flow edges */}
            <Handle type="target" position={Position.Top} className="!bg-zinc-600 !w-2 !h-2 !border-0" />
            <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !w-2 !h-2 !border-0" />

            {/* Crown for best node */}
            {isBest && (
                <span className="absolute -top-2 -right-2 text-sm" title="Best score">
                    👑
                </span>
            )}

            {/* Header: iteration + status + score */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs">{statusIcon}</span>
                    <span className="text-[10px] font-medium text-zinc-400">
                        Iter #{log.iterationNumber}
                    </span>
                </div>
                <div
                    className="text-lg font-bold tabular-nums leading-none"
                    style={{ color }}
                >
                    {fmt(score)}
                </div>
            </div>

            {/* Mini score bars */}
            <div className="space-y-0.5">
                <MiniBar
                    label="Relev"
                    value={
                        log.judgeScores.length > 0
                            ? log.judgeScores.reduce((s, j) => s + j.problemRelevance, 0) /
                            log.judgeScores.length
                            : 0
                    }
                />
                <MiniBar
                    label="Innov"
                    value={
                        log.judgeScores.length > 0
                            ? log.judgeScores.reduce((s, j) => s + j.innovation, 0) /
                            log.judgeScores.length
                            : 0
                    }
                />
                <MiniBar
                    label="Feas"
                    value={log.convergenceMetrics.feasibilityScore}
                />
                <MiniBar
                    label="Impact"
                    value={
                        log.judgeScores.length > 0
                            ? log.judgeScores.reduce((s, j) => s + j.userImpact, 0) /
                            log.judgeScores.length
                            : 0
                    }
                />
                <MiniBar
                    label="Novel"
                    value={log.convergenceMetrics.noveltyScore * 10}
                />
            </div>

            {/* Pass/fail count */}
            <div className="mt-2 flex items-center justify-between text-[9px] text-zinc-500">
                <span>
                    {log.judgeScores.filter((j) => j.passThreshold).length}/
                    {log.judgeScores.length} pass
                </span>
                <span>
                    {log.convergenceMetrics.unresolvedCritiques > 0
                        ? `${log.convergenceMetrics.unresolvedCritiques} unresolved`
                        : "all resolved"}
                </span>
            </div>
        </div>
    );
}

export const IdeaNode = memo(IdeaNodeComponent);
