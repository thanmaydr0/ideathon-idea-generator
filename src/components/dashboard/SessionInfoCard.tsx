import { memo } from "react";
import type { SimulationStatus } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface SessionInfoCardProps {
    iteration: number;
    status: SimulationStatus;
    elapsedMs: number;
    estimatedCostUsd: number;
    totalTokens: number;
    bestScore: number;
    maxIterations: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Status Badge
// ────────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SimulationStatus, { color: string; bg: string; label: string; pulse?: boolean }> = {
    PENDING: { color: "text-zinc-400", bg: "bg-zinc-500/20", label: "Pending" },
    RUNNING: { color: "text-blue-400", bg: "bg-blue-500/20", label: "Running", pulse: true },
    CONVERGED: { color: "text-emerald-400", bg: "bg-emerald-500/20", label: "Converged ✓" },
    FAILED: { color: "text-red-400", bg: "bg-red-500/20", label: "Failed" },
    CANCELLED: { color: "text-amber-400", bg: "bg-amber-500/20", label: "Cancelled" },
};

function formatElapsed(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Session info card showing iteration count, status, elapsed time, and cost.
 * Uses React.memo to prevent re-renders when parent state changes but these
 * specific props haven't changed.
 */
export const SessionInfoCard = memo(function SessionInfoCard({
    iteration,
    status,
    elapsedMs,
    estimatedCostUsd,
    totalTokens,
    bestScore,
    maxIterations,
}: SessionInfoCardProps) {
    const cfg = STATUS_CONFIG[status];

    return (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Session
                </h3>
                <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}
                >
                    {cfg.pulse && (
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                        </span>
                    )}
                    {cfg.label}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Metric label="Iteration" value={`${iteration} / ${maxIterations}`} />
                <Metric label="Elapsed" value={formatElapsed(elapsedMs)} />
                <Metric label="Best Score" value={bestScore.toFixed(2)} highlight={bestScore >= 9.0} />
                <Metric label="Cost" value={`$${estimatedCostUsd.toFixed(4)}`} warn={estimatedCostUsd > 0.8} />
                <Metric label="Tokens" value={totalTokens.toLocaleString()} />
            </div>
        </div>
    );
});

function Metric({
    label,
    value,
    highlight,
    warn,
}: {
    label: string;
    value: string;
    highlight?: boolean;
    warn?: boolean;
}) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
                className={`text-lg font-semibold tabular-nums ${highlight ? "text-emerald-400" : warn ? "text-amber-400" : "text-foreground"
                    }`}
            >
                {value}
            </p>
        </div>
    );
}
