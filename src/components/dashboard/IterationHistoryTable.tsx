import { memo, useState } from "react";
import type { IterationLog } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface IterationHistoryTableProps {
    logs: IterationLog[];
    onRowClick?: (log: IterationLog) => void;
}

// ────────────────────────────────────────────────────────────────────────────────
// Sorting
// ────────────────────────────────────────────────────────────────────────────────

type SortKey = "iterationNumber" | "averageScore" | "minJudge" | "novelty" | "feasibility" | "delta";
type SortDir = "asc" | "desc";

function getRowColor(log: IterationLog, prevLog?: IterationLog): string {
    if (!prevLog) return ""; // first iteration
    const delta = log.averageScore - prevLog.averageScore;
    if (delta > 0.1) return "border-l-2 border-l-emerald-500/60";
    if (delta < -0.1) return "border-l-2 border-l-red-500/60";
    return "border-l-2 border-l-amber-500/40"; // plateau
}

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Sortable iteration history table with color-coded rows:
 * - Green left border: converging (score increased >0.1)
 * - Yellow left border: plateau (|delta| <= 0.1)
 * - Red left border: diverging (score decreased >0.1)
 */
export const IterationHistoryTable = memo(function IterationHistoryTable({
    logs,
    onRowClick,
}: IterationHistoryTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("iterationNumber");
    const [sortDir, setSortDir] = useState<SortDir>("desc");

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const getSortValue = (log: IterationLog, key: SortKey): number => {
        switch (key) {
            case "iterationNumber": return log.iterationNumber;
            case "averageScore": return log.averageScore;
            case "minJudge": return log.convergenceMetrics.minJudgeScore;
            case "novelty": return log.convergenceMetrics.noveltyScore;
            case "feasibility": return log.convergenceMetrics.feasibilityScore;
            case "delta": {
                const idx = logs.findIndex((l) => l.id === log.id);
                return idx > 0 ? log.averageScore - logs[idx - 1].averageScore : 0;
            }
        }
    };

    const sorted = [...logs].sort((a, b) => {
        const aVal = getSortValue(a, sortKey);
        const bVal = getSortValue(b, sortKey);
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    const COLUMNS: { key: SortKey; label: string; width: string }[] = [
        { key: "iterationNumber", label: "Iter", width: "w-16" },
        { key: "averageScore", label: "Avg Score", width: "w-24" },
        { key: "minJudge", label: "Min Judge", width: "w-24" },
        { key: "novelty", label: "Novelty", width: "w-20" },
        { key: "feasibility", label: "Feasibility", width: "w-24" },
        { key: "delta", label: "Δ", width: "w-16" },
    ];

    return (
        <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Iteration History
                </h3>
            </div>

            <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card/95 backdrop-blur-sm">
                        <tr>
                            {COLUMNS.map((col) => (
                                <th
                                    key={col.key}
                                    className={`${col.width} px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none`}
                                    onClick={() => toggleSort(col.key)}
                                >
                                    {col.label}
                                    {sortKey === col.key && (
                                        <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                                    )}
                                </th>
                            ))}
                            <th className="w-24 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                                Unresolved
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((log, idx) => {
                            // Find the actual previous log by iteration number for color coding
                            const prevLog = logs.find(
                                (l) => l.iterationNumber === log.iterationNumber - 1,
                            );
                            const delta = prevLog
                                ? log.averageScore - prevLog.averageScore
                                : 0;

                            return (
                                <tr
                                    key={log.id}
                                    className={`hover:bg-muted/40 cursor-pointer transition-colors ${getRowColor(log, prevLog)} ${idx % 2 === 0 ? "bg-transparent" : "bg-muted/10"
                                        }`}
                                    onClick={() => onRowClick?.(log)}
                                >
                                    <td className="px-3 py-2 tabular-nums font-medium">
                                        #{log.iterationNumber}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        {log.averageScore.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        <span
                                            className={
                                                log.convergenceMetrics.minJudgeScore < 8.8
                                                    ? "text-red-400"
                                                    : ""
                                            }
                                        >
                                            {log.convergenceMetrics.minJudgeScore.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        {(log.convergenceMetrics.noveltyScore * 10).toFixed(1)}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        {log.convergenceMetrics.feasibilityScore.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        <span
                                            className={
                                                delta > 0.05
                                                    ? "text-emerald-400"
                                                    : delta < -0.05
                                                        ? "text-red-400"
                                                        : "text-muted-foreground"
                                            }
                                        >
                                            {delta >= 0 ? "+" : ""}
                                            {delta.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 tabular-nums">
                                        <span
                                            className={
                                                log.convergenceMetrics.unresolvedCritiques > 0
                                                    ? "text-amber-400"
                                                    : "text-emerald-400"
                                            }
                                        >
                                            {log.convergenceMetrics.unresolvedCritiques}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {logs.length === 0 && (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-3 py-8 text-center text-muted-foreground"
                                >
                                    No iterations yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});
