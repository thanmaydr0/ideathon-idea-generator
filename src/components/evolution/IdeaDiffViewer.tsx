import { memo, useMemo } from "react";
import type { IdeaVersion, PersonaCritique } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface IdeaDiffViewerProps {
    /** The earlier version ("before"). */
    versionA: IdeaVersion;
    /** The later version ("after"). */
    versionB: IdeaVersion;
    /** Optional: critiques that drove the changes. */
    critiques?: PersonaCritique[];
    /** Optional: score delta (versionB.avg - versionA.avg). */
    scoreDelta?: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Word-Level Diff Algorithm
// ────────────────────────────────────────────────────────────────────────────────

type DiffSegment = {
    type: "equal" | "added" | "removed";
    text: string;
};

/**
 * Simple word-level diff using Longest Common Subsequence (LCS).
 *
 * ARCH: We use a lightweight O(n*m) LCS algorithm instead of pulling in
 * a full diff library. For idea texts (~50-200 words), this is fast enough
 * and avoids bloating the bundle.
 */
function diffWords(textA: string, textB: string): DiffSegment[] {
    const wordsA = textA.split(/(\s+)/);
    const wordsB = textB.split(/(\s+)/);

    // Build LCS table
    const m = wordsA.length;
    const n = wordsB.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
        Array.from({ length: n + 1 }, () => 0),
    );

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (wordsA[i - 1] === wordsB[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to build diff
    const segments: DiffSegment[] = [];
    let i = m;
    let j = n;

    const result: DiffSegment[] = [];

    while (i > 0 && j > 0) {
        if (wordsA[i - 1] === wordsB[j - 1]) {
            result.push({ type: "equal", text: wordsA[i - 1] });
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            result.push({ type: "removed", text: wordsA[i - 1] });
            i--;
        } else {
            result.push({ type: "added", text: wordsB[j - 1] });
            j--;
        }
    }

    while (i > 0) {
        result.push({ type: "removed", text: wordsA[i - 1] });
        i--;
    }
    while (j > 0) {
        result.push({ type: "added", text: wordsB[j - 1] });
        j--;
    }

    result.reverse();

    // Merge consecutive same-type segments
    for (const seg of result) {
        if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
            segments[segments.length - 1].text += seg.text;
        } else {
            segments.push({ ...seg });
        }
    }

    return segments;
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

const FIELDS = [
    { key: "problemStatement" as const, label: "Problem Statement", icon: "🎯" },
    { key: "solution" as const, label: "Solution", icon: "💡" },
    { key: "deliverable" as const, label: "Deliverable", icon: "📦" },
    { key: "technicalApproach" as const, label: "Technical Approach", icon: "⚙️" },
    { key: "expectedImpact" as const, label: "Expected Impact", icon: "📈" },
] as const;

// ────────────────────────────────────────────────────────────────────────────────
// DiffField — Renders a single field with word-level diff
// ────────────────────────────────────────────────────────────────────────────────

function DiffField({
    label,
    icon,
    textA,
    textB,
}: {
    label: string;
    icon: string;
    textA: string;
    textB: string;
}) {
    const segments = useMemo(() => diffWords(textA, textB), [textA, textB]);
    const wcA = wordCount(textA);
    const wcB = wordCount(textB);
    const changed = textA !== textB;

    return (
        <div
            className={`p-3 rounded-lg border ${changed ? "border-blue-500/20 bg-blue-500/5" : "border-zinc-800 bg-zinc-900/50"
                }`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-400">
                    {icon} {label}
                </span>
                <div className="flex gap-2 text-[10px] text-zinc-500">
                    <span>v{1}: {wcA}w</span>
                    <span>→</span>
                    <span
                        className={
                            wcB > wcA ? "text-emerald-400" : wcB < wcA ? "text-red-400" : ""
                        }
                    >
                        v{2}: {wcB}w ({wcB >= wcA ? "+" : ""}{wcB - wcA})
                    </span>
                </div>
            </div>

            {changed ? (
                <p className="text-sm leading-relaxed">
                    {segments.map((seg, i) => {
                        if (seg.type === "equal") {
                            return <span key={i}>{seg.text}</span>;
                        }
                        if (seg.type === "added") {
                            return (
                                <span
                                    key={i}
                                    className="bg-emerald-500/20 text-emerald-300 rounded px-0.5"
                                >
                                    {seg.text}
                                </span>
                            );
                        }
                        return (
                            <span
                                key={i}
                                className="bg-red-500/20 text-red-300 line-through rounded px-0.5"
                            >
                                {seg.text}
                            </span>
                        );
                    })}
                </p>
            ) : (
                <p className="text-sm text-zinc-400 leading-relaxed">{textA}</p>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────────
// IdeaDiffViewer — Side-by-side Diff Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Side-by-side comparison of two idea versions with word-level diff.
 * Additions highlighted in green, removals in red (strikethrough).
 *
 * Also shows what drove the changes (top critiques) and score impact.
 */
export const IdeaDiffViewer = memo(function IdeaDiffViewer({
    versionA,
    versionB,
    critiques,
    scoreDelta,
}: IdeaDiffViewerProps) {
    const totalChangedFields = FIELDS.filter(
        (f) => versionA[f.key] !== versionB[f.key],
    ).length;

    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-zinc-200">
                        Idea Diff
                    </h3>
                    <span className="text-xs text-zinc-500">
                        Iteration #{versionA.iteration} → #{versionB.iteration}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    <span className="text-zinc-500">
                        {totalChangedFields}/{FIELDS.length} fields changed
                    </span>
                    {scoreDelta !== undefined && (
                        <span
                            className={`font-medium ${scoreDelta > 0
                                    ? "text-emerald-400"
                                    : scoreDelta < 0
                                        ? "text-red-400"
                                        : "text-zinc-500"
                                }`}
                        >
                            Score: {scoreDelta >= 0 ? "+" : ""}
                            {scoreDelta.toFixed(2)}
                        </span>
                    )}
                </div>
            </div>

            {/* Diff Fields */}
            <div className="p-4 space-y-3">
                {FIELDS.map((field) => (
                    <DiffField
                        key={field.key}
                        label={field.label}
                        icon={field.icon}
                        textA={versionA[field.key]}
                        textB={versionB[field.key]}
                    />
                ))}
            </div>

            {/* Critiques that drove the changes */}
            {critiques && critiques.length > 0 && (
                <div className="px-4 pb-4">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                        <p className="text-xs font-medium text-zinc-400 mb-2">
                            🔍 Why it changed (top critiques)
                        </p>
                        <div className="space-y-1.5">
                            {critiques
                                .sort((a, b) => b.priorityScore - a.priorityScore)
                                .slice(0, 3)
                                .map((c) => (
                                    <div
                                        key={c.personaType}
                                        className="flex items-start gap-2 text-xs"
                                    >
                                        <span
                                            className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.priorityScore > 7
                                                    ? "bg-red-500/20 text-red-400"
                                                    : "bg-amber-500/20 text-amber-400"
                                                }`}
                                        >
                                            {c.personaType}
                                        </span>
                                        <span className="text-zinc-400">
                                            {c.weaknesses[0] ?? c.suggestedRefinements[0] ?? "—"}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
