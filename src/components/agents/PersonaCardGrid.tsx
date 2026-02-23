import { memo } from "react";
import type { PersonaCritique } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Persona Config
// ────────────────────────────────────────────────────────────────────────────────

const PERSONA_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    VISIONARY: { icon: "🔭", color: "border-violet-500/40", label: "Visionary" },
    SYSTEMS_ARCHITECT: { icon: "🏗️", color: "border-blue-500/40", label: "Systems Architect" },
    MARKET_STRATEGIST: { icon: "📊", color: "border-emerald-500/40", label: "Market Strategist" },
    UX_THINKER: { icon: "🎨", color: "border-pink-500/40", label: "UX Thinker" },
    RISK_ANALYST: { icon: "⚠️", color: "border-amber-500/40", label: "Risk Analyst" },
    ETHICS_REVIEWER: { icon: "⚖️", color: "border-cyan-500/40", label: "Ethics Reviewer" },
    COMPETITIVE_ANALYST: { icon: "🏆", color: "border-orange-500/40", label: "Competitive Analyst" },
};

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface PersonaCardGridProps {
    critiques: PersonaCritique[];
    isLoading?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Grid of 7 persona cards showing strengths, weaknesses, and priority score.
 * Shows skeleton placeholders when loading (between iterations).
 */
export const PersonaCardGrid = memo(function PersonaCardGrid({
    critiques,
    isLoading,
}: PersonaCardGridProps) {
    if (isLoading) {
        return (
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Persona Critiques
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
                            <div className="h-4 bg-muted rounded w-32 mb-3" />
                            <div className="space-y-2">
                                <div className="h-3 bg-muted rounded w-full" />
                                <div className="h-3 bg-muted rounded w-3/4" />
                                <div className="h-3 bg-muted rounded w-5/6" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (critiques.length === 0) {
        return (
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Persona Critiques
                </h3>
                <div className="text-center py-8 text-muted-foreground">
                    Waiting for persona analysis...
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Persona Critiques
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {critiques.map((critique) => (
                    <PersonaCard key={critique.personaType} critique={critique} />
                ))}
            </div>
        </div>
    );
});

// ────────────────────────────────────────────────────────────────────────────────
// Persona Card
// ────────────────────────────────────────────────────────────────────────────────

const PersonaCard = memo(function PersonaCard({
    critique,
}: {
    critique: PersonaCritique;
}) {
    const config = PERSONA_CONFIG[critique.personaType] ?? {
        icon: "🤖",
        color: "border-zinc-500/40",
        label: critique.personaType,
    };

    const priorityColor =
        critique.priorityScore > 7
            ? "bg-red-500/20 text-red-400"
            : critique.priorityScore > 4
                ? "bg-amber-500/20 text-amber-400"
                : "bg-emerald-500/20 text-emerald-400";

    return (
        <div className={`rounded-lg border-l-2 ${config.color} border border-border bg-card p-4 space-y-3`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{config.icon}</span>
                    <span className="text-sm font-medium text-foreground">{config.label}</span>
                </div>
                <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${priorityColor}`}
                >
                    {critique.priorityScore.toFixed(1)}
                </span>
            </div>

            {/* Strengths */}
            {critique.strengths.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-emerald-400 mb-1">Strengths</p>
                    <ul className="space-y-0.5">
                        {critique.strengths.slice(0, 3).map((s, i) => (
                            <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                                <span className="text-emerald-500">+</span> {s}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Weaknesses */}
            {critique.weaknesses.length > 0 && (
                <div>
                    <p className="text-xs font-medium text-red-400 mb-1">Weaknesses</p>
                    <ul className="space-y-0.5">
                        {critique.weaknesses.slice(0, 3).map((w, i) => (
                            <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                                <span className="text-red-500">−</span> {w}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Refinements (collapsed to save space) */}
            {critique.suggestedRefinements.length > 0 && (
                <div>
                    <p className="text-xs text-blue-400">
                        {critique.suggestedRefinements.length} refinement{critique.suggestedRefinements.length > 1 ? "s" : ""} suggested
                    </p>
                </div>
            )}
        </div>
    );
});
