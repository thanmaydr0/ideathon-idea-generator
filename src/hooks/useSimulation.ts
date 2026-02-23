import { useEffect, useRef } from "react";
import { useSimulationStore } from "@/store/simulationStore";
import type { SimulationStore } from "@/store/simulationStore";
import { orchestrator } from "@/engine/orchestrator";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ────────────────────────────────────────────────────────────────────────────────
// useSimulation Hook
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Primary hook for consuming simulation state in React components.
 *
 * ARCH: This hook wraps the Zustand store and manages two subscription
 * lifecycles:
 *
 * 1. **Orchestrator events** — local callback subscription for in-process
 *    event delivery (fastest path, no network hop).
 *
 * 2. **Supabase Realtime** — channel subscription for cross-tab sync and
 *    server-side event delivery. Subscribes to `session-{sessionId}` channel
 *    when a session is active.
 *
 * Both subscriptions funnel through the same `updateFromRealtimeEvent()`
 * action, ensuring a single code path for all state updates.
 *
 * Returns the full store (state + actions) for direct consumption.
 */
export function useSimulation(): SimulationStore {
    const store = useSimulationStore();
    const channelRef = useRef<RealtimeChannel | null>(null);
    const unsubRef = useRef<(() => void) | null>(null);

    // ── Orchestrator event subscription ──────────────────────────
    useEffect(() => {
        const unsubscribe = orchestrator.onEvent((event) => {
            useSimulationStore.getState().updateFromRealtimeEvent(event);
        });
        unsubRef.current = unsubscribe;

        return () => {
            unsubscribe();
            unsubRef.current = null;
        };
    }, []);

    // ── Supabase Realtime subscription ───────────────────────────
    useEffect(() => {
        const sessionId = store.session?.id;

        // Clean up previous channel
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }

        if (!sessionId) return;

        /**
         * Subscribe to the session's realtime channel.
         * This provides cross-tab sync: if the simulation is running
         * in another tab or via an Edge Function, state updates still
         * arrive here.
         */
        const channel = supabase
            .channel(`session-${sessionId}`)
            .on("broadcast", { event: "iteration_update" }, (payload) => {
                const event = payload.payload;
                if (event && typeof event === "object" && "type" in event) {
                    useSimulationStore.getState().updateFromRealtimeEvent(
                        event as Parameters<SimulationStore["updateFromRealtimeEvent"]>[0],
                    );
                }
            })
            .on("broadcast", { event: "simulation_complete" }, (payload) => {
                const event = payload.payload;
                if (event && typeof event === "object" && "type" in event) {
                    useSimulationStore.getState().updateFromRealtimeEvent(
                        event as Parameters<SimulationStore["updateFromRealtimeEvent"]>[0],
                    );
                }
            })
            .subscribe((status) => {
                if (status === "SUBSCRIBED") {
                    console.log(`[realtime] Subscribed to session-${sessionId}`);
                }
                if (status === "CHANNEL_ERROR") {
                    console.error(`[realtime] Channel error for session-${sessionId}`);
                }
            });

        channelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
        // Only re-subscribe when session ID changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.session?.id]);

    return store;
}

// ────────────────────────────────────────────────────────────────────────────────
// Selector Hooks (Fine-grained subscriptions)
// ────────────────────────────────────────────────────────────────────────────────

/** Select only the loading state (avoids re-renders from data changes). */
export function useSimulationLoading(): boolean {
    return useSimulationStore((s) => s.isLoading);
}

/** Select only the status (avoids re-renders from score changes). */
export function useSimulationStatus(): SimulationStore["status"] {
    return useSimulationStore((s) => s.status);
}

/** Select the iteration count. */
export function useIterationCount(): number {
    return useSimulationStore((s) => s.session?.currentIteration ?? 0);
}

/** Select estimated cost. */
export function useEstimatedCost(): number {
    return useSimulationStore((s) => s.estimatedCostUSD);
}
