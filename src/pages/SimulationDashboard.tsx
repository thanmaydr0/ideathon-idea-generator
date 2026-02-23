import { useState, useEffect, useCallback, useRef } from "react";
import type {
    IdeaVersion,
    PersonaCritique,
    JudgeScore,
    IterationLog,
    SimulationStatus,
    ConvergenceMetrics,
} from "@/types";
import { supabase } from "@/lib/supabase";
import { orchestrator } from "@/engine/orchestrator";
import type { OrchestratorEvent } from "@/engine/orchestrator";

import { SessionInfoCard } from "@/components/dashboard/SessionInfoCard";
import { ConvergenceRadar } from "@/components/dashboard/ConvergenceRadar";
import { ScoreTimeline } from "@/components/dashboard/ScoreTimeline";
import { CurrentIdeaPanel } from "@/components/dashboard/CurrentIdeaPanel";
import { IterationHistoryTable } from "@/components/dashboard/IterationHistoryTable";
import { PersonaCardGrid } from "@/components/agents/PersonaCardGrid";
import { JudgeScorePanel } from "@/components/agents/JudgeScorePanel";
import { DemoModeToggle } from "@/components/dashboard/DemoModeToggle";
import { useDemoPlayer } from "@/demo/demoPlayer";

// ────────────────────────────────────────────────────────────────────────────────
// Domain Options
// ────────────────────────────────────────────────────────────────────────────────

const DOMAINS = [
    "HealthTech",
    "EdTech",
    "FinTech",
    "AgriTech",
    "ClimaTech",
    "CivicTech",
    "LegalTech",
    "Gaming",
    "Accessibility",
    "Other",
] as const;

// ────────────────────────────────────────────────────────────────────────────────
// Dashboard State
// ────────────────────────────────────────────────────────────────────────────────

export interface DashboardState {
    status: SimulationStatus;
    iteration: number;
    maxIterations: number;
    elapsedMs: number;
    estimatedCostUsd: number;
    totalTokens: number;
    bestScore: number;
    currentIdea: IdeaVersion | null;
    previousIdea: IdeaVersion | null;
    personaCritiques: PersonaCritique[];
    judgeScores: JudgeScore[];
    previousJudgeScores: JudgeScore[];
    iterationLogs: IterationLog[];
    isProcessing: boolean;
    events: OrchestratorEvent[];
}

export const INITIAL_STATE: DashboardState = {
    status: "PENDING",
    iteration: 0,
    maxIterations: 1000,
    elapsedMs: 0,
    estimatedCostUsd: 0,
    totalTokens: 0,
    bestScore: 0,
    currentIdea: null,
    previousIdea: null,
    personaCritiques: [],
    judgeScores: [],
    previousJudgeScores: [],
    iterationLogs: [],
    isProcessing: false,
    events: [],
};

// ────────────────────────────────────────────────────────────────────────────────
// SimulationDashboard — Main Page
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Primary interface for the IDEAForge Simulation Engine.
 *
 * ARCH: This component subscribes to orchestrator events (local callbacks)
 * and Supabase Realtime (for cross-tab sync). It manages the entire
 * dashboard state in a single useState to reduce render cycles.
 *
 * Layout: Dense information design inspired by AI research lab dashboards.
 * - Top bar: topic input, domain select, run button
 * - Row 1: session info | convergence radar | score timeline
 * - Row 2: current best idea (full width)
 * - Row 3: persona cards | judge scores
 * - Row 4: iteration history table
 */
export default function SimulationDashboard() {
    const [topic, setTopic] = useState("");
    const [domain, setDomain] = useState<string>("HealthTech");
    const [state, setState] = useState<DashboardState>(INITIAL_STATE);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);

    const demo = useDemoPlayer();

    // Switch between real state and demo state based on playback
    const activeState = demo.isPlaying ? demo.demoState : state;

    // ── Elapsed time ticker ────────────────────────────────────────
    useEffect(() => {
        if (state.status === "RUNNING") {
            timerRef.current = setInterval(() => {
                setState((prev) => ({
                    ...prev,
                    elapsedMs: Date.now() - startTimeRef.current,
                }));
            }, 1000);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [state.status]);

    // ── Orchestrator event subscription ────────────────────────────
    useEffect(() => {
        const unsubscribe = orchestrator.onEvent(handleOrchestratorEvent);
        return unsubscribe;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleOrchestratorEvent = useCallback((event: OrchestratorEvent) => {
        setState((prev) => {
            const newEvents = [...prev.events.slice(-50), event]; // keep last 50 events

            switch (event.type) {
                case "iteration_start":
                    return {
                        ...prev,
                        isProcessing: true,
                        events: newEvents,
                    };

                case "iteration_complete": {
                    const data = event.data as {
                        iteration: number;
                        averageScore: number;
                        bestScore: number;
                        convergenceMetrics: ConvergenceMetrics;
                        costUsd: number;
                        totalTokens: number;
                    };

                    // Get full state from orchestrator for complete data
                    const orchState = orchestrator.getState();
                    const logs = orchState.iterationLogs;
                    const latestLog = logs[logs.length - 1];
                    const prevLog = logs.length > 1 ? logs[logs.length - 2] : undefined;

                    return {
                        ...prev,
                        status: "RUNNING",
                        iteration: data.iteration,
                        estimatedCostUsd: data.costUsd,
                        totalTokens: data.totalTokens,
                        bestScore: data.bestScore,
                        currentIdea: latestLog?.ideaVersion ?? prev.currentIdea,
                        previousIdea: prevLog?.ideaVersion ?? prev.previousIdea,
                        personaCritiques: latestLog?.personaCritiques ?? prev.personaCritiques,
                        judgeScores: latestLog?.judgeScores ?? prev.judgeScores,
                        previousJudgeScores: prevLog?.judgeScores ?? prev.previousJudgeScores,
                        iterationLogs: logs,
                        isProcessing: false,
                        events: newEvents,
                    };
                }

                case "convergence_reached":
                    return {
                        ...prev,
                        status: "CONVERGED",
                        isProcessing: false,
                        events: newEvents,
                    };

                case "simulation_stopped":
                case "error":
                    return {
                        ...prev,
                        status: event.type === "error" ? "FAILED" : "CANCELLED",
                        isProcessing: false,
                        events: newEvents,
                    };

                case "drift_revert":
                case "groupthink_detected":
                case "cost_warning":
                    return {
                        ...prev,
                        events: newEvents,
                    };

                default:
                    return { ...prev, events: newEvents };
            }
        });
    }, []);

    // ── Run simulation ─────────────────────────────────────────────
    const handleRun = useCallback(async () => {
        if (!topic.trim()) return;

        setState({ ...INITIAL_STATE, status: "RUNNING", isProcessing: true });
        startTimeRef.current = Date.now();

        try {
            await orchestrator.runSimulation(topic.trim(), domain);
        } catch (err) {
            console.error("[dashboard] Simulation failed:", err);
            setState((prev) => ({ ...prev, status: "FAILED", isProcessing: false }));
        }
    }, [topic, domain]);

    // ── Stop simulation ────────────────────────────────────────────
    const handleStop = useCallback(() => {
        orchestrator.requestStop();
        setState((prev) => ({ ...prev, status: "CANCELLED" }));
    }, []);

    const isRunning = activeState.status === "RUNNING";

    return (
        <div className="min-h-screen bg-background text-foreground dark">
            {/* ── Top Bar ─────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
                <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center gap-4">
                    <h1 className="text-lg font-bold tracking-tight whitespace-nowrap">
                        <span className="text-blue-400">🔥</span> IDEAForge
                    </h1>

                    <DemoModeToggle
                        isPlaying={demo.isPlaying}
                        speed={demo.speed}
                        onToggle={demo.togglePlay}
                        onSpeedChange={demo.setSpeed}
                        onStart={demo.startDemo}
                    />

                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Enter hackathon topic..."
                        disabled={isRunning}
                        className="flex-1 max-w-md px-3 py-1.5 text-sm rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
                    />

                    <select
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        disabled={isRunning}
                        className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50"
                    >
                        {DOMAINS.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>

                    {isRunning ? (
                        <button
                            onClick={handleStop}
                            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                            ⏹ Stop
                        </button>
                    ) : (
                        <button
                            onClick={handleRun}
                            disabled={!topic.trim()}
                            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            ▶ Run
                        </button>
                    )}
                </div>
            </header>

            {/* ── Dashboard Content ───────────────────────────────────────── */}
            <main className="max-w-[1920px] mx-auto px-4 py-4 space-y-4">
                {/* Row 1: Session Info | Convergence Radar | Score Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 relative">
                    {/* Demo Alert Overlay */}
                    {demo.activeEvent && (
                        <div className="absolute -top-4 right-0 z-50 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className={`p-4 rounded-xl border shadow-2xl backdrop-blur-md space-y-1 w-80 
                                ${demo.activeEvent.type === 'warning' ? 'border-red-500/50 bg-red-500/10 shadow-red-500/5' :
                                    demo.activeEvent.type === 'success' ? 'border-emerald-500/50 bg-emerald-500/10 shadow-emerald-500/5' :
                                        'border-blue-500/50 bg-blue-500/10 shadow-blue-500/5'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">
                                        {demo.activeEvent.type === 'warning' ? '⚠️' : demo.activeEvent.type === 'success' ? '✅' : 'ℹ️'}
                                    </span>
                                    <h3 className="font-bold text-sm uppercase tracking-wider">{demo.activeEvent.title}</h3>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed pl-7">{demo.activeEvent.description}</p>
                            </div>
                        </div>
                    )}

                    <div className="lg:col-span-3">
                        <SessionInfoCard
                            iteration={activeState.iteration}
                            status={activeState.status}
                            elapsedMs={demo.isPlaying ? demo.demoState.elapsedMs : state.elapsedMs}
                            estimatedCostUsd={activeState.estimatedCostUsd}
                            totalTokens={activeState.totalTokens}
                            bestScore={activeState.bestScore}
                            maxIterations={activeState.maxIterations}
                        />
                    </div>
                    <div className="lg:col-span-4">
                        <ConvergenceRadar
                            currentScores={activeState.judgeScores}
                            previousScores={
                                activeState.previousJudgeScores.length > 0
                                    ? activeState.previousJudgeScores
                                    : undefined
                            }
                        />
                    </div>
                    <div className="lg:col-span-5">
                        <ScoreTimeline logs={activeState.iterationLogs} />
                    </div>
                </div>

                {/* Row 2: Current Best Idea */}
                <CurrentIdeaPanel
                    currentIdea={activeState.currentIdea}
                    previousIdea={activeState.previousIdea}
                />

                {/* Row 3: Persona Cards | Judge Scores */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <PersonaCardGrid
                        critiques={activeState.personaCritiques}
                        isLoading={activeState.isProcessing}
                    />
                    <JudgeScorePanel
                        scores={activeState.judgeScores}
                        isLoading={activeState.isProcessing}
                    />
                </div>

                {/* Row 4: Iteration History */}
                <IterationHistoryTable logs={activeState.iterationLogs} />

                {/* Event Log (collapsible footer) */}
                {activeState.events.length > 0 && (
                    <details className="rounded-xl border border-border bg-card">
                        <summary className="px-4 py-3 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                            Event Log ({activeState.events.length})
                        </summary>
                        <div className="px-4 pb-3 max-h-48 overflow-auto">
                            {activeState.events
                                .slice()
                                .reverse()
                                .map((evt, i) => (
                                    <div
                                        key={`${evt.timestamp}-${i}`}
                                        className="text-xs text-muted-foreground py-0.5 font-mono"
                                    >
                                        <span className="text-foreground/40">
                                            {new Date(evt.timestamp).toLocaleTimeString()}
                                        </span>{" "}
                                        <span
                                            className={
                                                evt.type === "error"
                                                    ? "text-red-400"
                                                    : evt.type === "convergence_reached"
                                                        ? "text-emerald-400"
                                                        : "text-blue-400"
                                            }
                                        >
                                            {evt.type}
                                        </span>{" "}
                                        iter:{evt.iteration}
                                    </div>
                                ))}
                        </div>
                    </details>
                )}
            </main>
        </div>
    );
}
