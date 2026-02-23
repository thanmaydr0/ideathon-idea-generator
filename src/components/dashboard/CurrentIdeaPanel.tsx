import { memo } from "react";
import type { IdeaVersion } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface CurrentIdeaPanelProps {
    currentIdea: IdeaVersion | null;
    previousIdea?: IdeaVersion | null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function avgSentenceLength(text: string): number {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    const totalWords = sentences.reduce((sum, s) => sum + wordCount(s), 0);
    return Math.round(totalWords / sentences.length);
}

const IDEA_FIELDS = [
    { key: "problemStatement" as const, label: "Problem Statement", icon: "🎯" },
    { key: "solution" as const, label: "Solution", icon: "💡" },
    { key: "deliverable" as const, label: "Deliverable", icon: "📦" },
    { key: "technicalApproach" as const, label: "Technical Approach", icon: "⚙️" },
    { key: "expectedImpact" as const, label: "Expected Impact", icon: "📈" },
] as const;

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Displays the current best idea version with all fields.
 * Shows word count and specificity score (avg sentence length as proxy).
 * When a previous idea is available, shows word count delta for each field.
 */
export const CurrentIdeaPanel = memo(function CurrentIdeaPanel({
    currentIdea,
    previousIdea,
}: CurrentIdeaPanelProps) {
    if (!currentIdea) {
        return (
            <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                    Current Best Idea
                </h3>
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                    Waiting for first iteration...
                </div>
            </div>
        );
    }

    const totalWords = IDEA_FIELDS.reduce(
        (sum, f) => sum + wordCount(currentIdea[f.key]),
        0,
    );
    const prevTotalWords = previousIdea
        ? IDEA_FIELDS.reduce((sum, f) => sum + wordCount(previousIdea[f.key]), 0)
        : 0;

    const allText = IDEA_FIELDS.map((f) => currentIdea[f.key]).join(". ");
    const specificity = avgSentenceLength(allText);

    return (
        <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Current Best Idea
                    <span className="ml-2 text-xs text-foreground/60">
                        v{currentIdea.iteration}
                    </span>
                </h3>
                <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                        Words: <strong className="text-foreground">{totalWords}</strong>
                        {previousIdea && (
                            <span
                                className={
                                    totalWords > prevTotalWords
                                        ? "text-emerald-400 ml-1"
                                        : totalWords < prevTotalWords
                                            ? "text-red-400 ml-1"
                                            : "ml-1"
                                }
                            >
                                ({totalWords >= prevTotalWords ? "+" : ""}
                                {totalWords - prevTotalWords})
                            </span>
                        )}
                    </span>
                    <span>
                        Specificity: <strong className="text-foreground">{specificity}</strong>
                        <span className="text-muted-foreground ml-0.5">words/sentence</span>
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {IDEA_FIELDS.map((field) => {
                    const currentText = currentIdea[field.key];
                    const prevText = previousIdea ? previousIdea[field.key] : null;
                    const currentWc = wordCount(currentText);
                    const prevWc = prevText ? wordCount(prevText) : 0;
                    const changed = prevText && prevText !== currentText;

                    return (
                        <div
                            key={field.key}
                            className={`p-3 rounded-lg border ${changed ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-muted/30"
                                }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-muted-foreground">
                                    {field.icon} {field.label}
                                </span>
                                {previousIdea && (
                                    <span
                                        className={`text-xs tabular-nums ${currentWc > prevWc
                                                ? "text-emerald-400"
                                                : currentWc < prevWc
                                                    ? "text-red-400"
                                                    : "text-muted-foreground"
                                            }`}
                                    >
                                        {currentWc}w
                                        {currentWc !== prevWc && ` (${currentWc >= prevWc ? "+" : ""}${currentWc - prevWc})`}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">
                                {currentText}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
