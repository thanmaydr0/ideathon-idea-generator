import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
    SimulationSession,
    SimulationStatus,
    IdeaVersion,
    PersonaCritique,
    JudgeScore,
    IterationLog,
    ConvergenceMetrics,
} from "@/types";
import { orchestrator } from "@/engine/orchestrator";
import type { OrchestratorEvent } from "@/engine/orchestrator";

// ────────────────────────────────────────────────────────────────────────────────
// State Shape
// ────────────────────────────────────────────────────────────────────────────────

export interface SimulationState {
    /** Active simulation session (null before first run). */
    session: SimulationSession | null;
    /** Current best idea version being refined. */
    currentIdea: IdeaVersion | null;
    /** Previous idea version for diff comparison. */
    previousIdea: IdeaVersion | null;
    /** Critiques from all 7 personas for the latest iteration. */
    personaCritiques: PersonaCritique[];
    /** Scores from all 5 judges for the latest iteration. */
    judgeScores: JudgeScore[];
    /** Complete log of all iterations (append-only during a session). */
    iterationLogs: IterationLog[];
    /** Latest convergence metrics (null before first scoring). */
    convergenceMetrics: ConvergenceMetrics | null;
    /** Whether the orchestrator is currently processing. */
    isLoading: boolean;
    /** Last error message (null if no error). */
    error: string | null;
    /** Cumulative token usage across all iterations. */
    totalTokensUsed: number;
    /** Estimated cost in USD. */
    estimatedCostUSD: number;
    /** Current simulation status. */
    status: SimulationStatus;
    /** Orchestrator events log (last 100). */
    events: OrchestratorEvent[];
    /** Timestamp when the simulation started. */
    startedAt: number | null;
}

export interface SimulationActions {
    /**
     * Start a new simulation with the given topic and domain.
     * Resets all state, then delegates to the orchestrator.
     */
    startSimulation: (topic: string, domain: string) => Promise<void>;

    /** Request a graceful stop of the running simulation. */
    stopSimulation: () => void;

    /**
     * Process an orchestrator event and update store state accordingly.
     * Called by the realtime subscription or the event listener.
     */
    updateFromRealtimeEvent: (event: OrchestratorEvent) => void;

    /**
     * Set a specific iteration as the "current" view (for detail panels).
     * Updates currentIdea, judgeScores, personaCritiques from the log.
     */
    setCurrentIteration: (log: IterationLog) => void;

    /** Reset the entire store to initial state. */
    resetSession: () => void;
}

export type SimulationStore = SimulationState & SimulationActions;

// ────────────────────────────────────────────────────────────────────────────────
// Initial State
// ────────────────────────────────────────────────────────────────────────────────

const INITIAL_STATE: SimulationState = {
    session: null,
    currentIdea: null,
    previousIdea: null,
    personaCritiques: [],
    judgeScores: [],
    iterationLogs: [],
    convergenceMetrics: null,
    isLoading: false,
    error: null,
    totalTokensUsed: 0,
    estimatedCostUSD: 0,
    status: "PENDING",
    events: [],
    startedAt: null,
};

// ────────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Global Zustand store for simulation state.
 *
 * ARCH: Uses `persist` middleware with sessionStorage so state survives
 * page refreshes during a long simulation run, but not across sessions.
 * Only persists the data fields — actions are never serialized.
 *
 * The store is the single source of truth for the UI layer. Both the
 * orchestrator event listener and the Supabase Realtime subscription
 * funnel state updates through `updateFromRealtimeEvent()`.
 */
export const useSimulationStore = create<SimulationStore>()(
    persist(
        (set, get) => ({
            ...INITIAL_STATE,

            // ── Actions ────────────────────────────────────────────

            startSimulation: async (topic: string, domain: string) => {
                const now = Date.now();
                set({
                    ...INITIAL_STATE,
                    status: "RUNNING",
                    isLoading: true,
                    startedAt: now,
                    session: {
                        id: crypto.randomUUID(),
                        topic,
                        status: "RUNNING",
                        currentIteration: 0,
                        maxIterations: 1000,
                        targetScore: 9.3,
                        createdAt: new Date(now).toISOString(),
                    },
                });

                try {
                    await orchestrator.runSimulation(topic, domain);
                } catch (err) {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    set({
                        status: "FAILED",
                        isLoading: false,
                        error: message,
                    });
                }
            },

            stopSimulation: () => {
                orchestrator.requestStop();
                set((state) => ({
                    status: "CANCELLED",
                    isLoading: false,
                    session: state.session
                        ? { ...state.session, status: "CANCELLED" }
                        : null,
                }));
            },

            updateFromRealtimeEvent: (event: OrchestratorEvent) => {
                set((state) => {
                    const newEvents = [...state.events.slice(-99), event];

                    switch (event.type) {
                        case "iteration_start":
                            return {
                                ...state,
                                isLoading: true,
                                events: newEvents,
                            };

                        case "iteration_complete": {
                            // Pull complete state from orchestrator
                            const orchState = orchestrator.getState();
                            const logs = orchState.iterationLogs;
                            const latest = logs[logs.length - 1] ?? null;
                            const prev = logs.length > 1 ? logs[logs.length - 2] : null;

                            const data = event.data as {
                                iteration: number;
                                averageScore: number;
                                bestScore: number;
                                convergenceMetrics: ConvergenceMetrics;
                                costUsd: number;
                                totalTokens: number;
                            };

                            return {
                                ...state,
                                status: "RUNNING",
                                isLoading: false,
                                currentIdea: latest?.ideaVersion ?? state.currentIdea,
                                previousIdea: prev?.ideaVersion ?? state.previousIdea,
                                personaCritiques: latest?.personaCritiques ?? state.personaCritiques,
                                judgeScores: latest?.judgeScores ?? state.judgeScores,
                                iterationLogs: logs,
                                convergenceMetrics: data.convergenceMetrics,
                                totalTokensUsed: data.totalTokens,
                                estimatedCostUSD: data.costUsd,
                                error: null,
                                events: newEvents,
                                session: state.session
                                    ? {
                                        ...state.session,
                                        currentIteration: data.iteration,
                                    }
                                    : null,
                            };
                        }

                        case "convergence_reached":
                            return {
                                ...state,
                                status: "CONVERGED",
                                isLoading: false,
                                events: newEvents,
                                session: state.session
                                    ? {
                                        ...state.session,
                                        status: "CONVERGED" as const,
                                    }
                                    : null,
                            };

                        case "simulation_stopped":
                            return {
                                ...state,
                                status: "CANCELLED",
                                isLoading: false,
                                events: newEvents,
                                session: state.session
                                    ? { ...state.session, status: "CANCELLED" }
                                    : null,
                            };

                        case "error":
                            return {
                                ...state,
                                status: "FAILED",
                                isLoading: false,
                                error: (event.data as { message?: string })?.message ?? "Unknown error",
                                events: newEvents,
                                session: state.session
                                    ? { ...state.session, status: "FAILED" }
                                    : null,
                            };

                        case "drift_revert":
                        case "groupthink_detected":
                        case "cost_warning":
                            return { ...state, events: newEvents };

                        default:
                            return { ...state, events: newEvents };
                    }
                });
            },

            setCurrentIteration: (log: IterationLog) => {
                const logs = get().iterationLogs;
                const sorted = [...logs].sort(
                    (a, b) => a.iterationNumber - b.iterationNumber,
                );
                const idx = sorted.findIndex((l) => l.id === log.id);
                const prevLog = idx > 0 ? sorted[idx - 1] : null;

                set({
                    currentIdea: log.ideaVersion,
                    previousIdea: prevLog?.ideaVersion ?? null,
                    personaCritiques: log.personaCritiques,
                    judgeScores: log.judgeScores,
                    convergenceMetrics: log.convergenceMetrics,
                });
            },

            resetSession: () => {
                set(INITIAL_STATE);
            },
        }),
        {
            name: "ideaforge-simulation",
            storage: createJSONStorage(() => sessionStorage),
            /**
             * Only persist data fields, never functions.
             * Also skip large event arrays to keep storage lean.
             */
            partialize: (state) => ({
                session: state.session,
                currentIdea: state.currentIdea,
                previousIdea: state.previousIdea,
                personaCritiques: state.personaCritiques,
                judgeScores: state.judgeScores,
                iterationLogs: state.iterationLogs,
                convergenceMetrics: state.convergenceMetrics,
                totalTokensUsed: state.totalTokensUsed,
                estimatedCostUSD: state.estimatedCostUSD,
                status: state.status,
                startedAt: state.startedAt,
                // Exclude: isLoading, error, events (transient state)
            }),
        },
    ),
);
