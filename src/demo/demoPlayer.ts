import { useState, useEffect, useCallback, useRef } from "react";
import { getDemoIterationLogs, DEMO_EVENTS } from "./demoMode";
import type { OrchestratorEvent } from "@/engine/orchestrator";
import { INITIAL_STATE, type DashboardState } from "@/pages/SimulationDashboard";

export function useDemoPlayer() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState<number>(10);
    const [currentIteration, setCurrentIteration] = useState(0);
    const [activeEvent, setActiveEvent] = useState<typeof DEMO_EVENTS[0] | null>(null);

    // Maintain a completely isolated mock dashboard state for playback
    const [demoState, setDemoState] = useState<DashboardState>(INITIAL_STATE);
    const timerRef = useRef<number>(0);

    const togglePlay = useCallback(() => {
        setIsPlaying((prev) => !prev);
    }, []);

    const resetDemo = useCallback(() => {
        setIsPlaying(false);
        setCurrentIteration(0);
        setActiveEvent(null);
        setDemoState(INITIAL_STATE);
    }, []);

    const startDemo = useCallback(() => {
        setDemoState({
            ...INITIAL_STATE,
            status: "RUNNING",
            isProcessing: true,
        });
        setCurrentIteration(0);
        setIsPlaying(true);
        timerRef.current = Date.now();
    }, []);

    // Simulated playback loop
    useEffect(() => {
        if (!isPlaying) return;

        const allLogs = getDemoIterationLogs();

        if (currentIteration >= allLogs.length) {
            setIsPlaying(false);
            setDemoState(prev => ({ ...prev, status: "CONVERGED", isProcessing: false }));
            return;
        }

        const intervalMs = 10000 / speed; // 1x = 10s per iteration, 10x = 1s

        const timer = setTimeout(() => {
            const log = allLogs[currentIteration];
            const eventInfo = DEMO_EVENTS.find(e => e.iteration === log.iterationNumber) || null;
            setActiveEvent(eventInfo);

            const orchEvent: OrchestratorEvent = {
                type: eventInfo?.type === "warning" ? "error" : "iteration_complete",
                sessionId: log.sessionId,
                iteration: log.iterationNumber,
                data: {
                    message: eventInfo ? `[SYSTEM]: ${eventInfo.title} - ${eventInfo.description}` : `Iteration ${log.iterationNumber} completed.`,
                },
                timestamp: new Date().toISOString(),
            };

            setDemoState(prev => {
                const newEvents = [...prev.events, orchEvent];
                const newLogs = [...prev.iterationLogs, log];
                const prevLog = newLogs.length > 1 ? newLogs[newLogs.length - 2] : undefined;

                return {
                    ...prev,
                    status: "RUNNING",
                    iteration: log.iterationNumber,
                    estimatedCostUsd: log.iterationNumber * 0.12, // mock cost
                    totalTokens: log.iterationNumber * 8500,
                    bestScore: log.averageScore,
                    currentIdea: log.ideaVersion,
                    previousIdea: prevLog?.ideaVersion ?? prev.previousIdea,
                    personaCritiques: log.personaCritiques,
                    judgeScores: log.judgeScores,
                    previousJudgeScores: prevLog?.judgeScores ?? prev.previousJudgeScores,
                    iterationLogs: newLogs,
                    isProcessing: log.iterationNumber < 20,
                    events: newEvents,
                    elapsedMs: Date.now() - timerRef.current,
                };
            });

            setCurrentIteration(currentIteration + 1);
        }, intervalMs);

        return () => clearTimeout(timer);
    }, [isPlaying, currentIteration, speed]);

    return {
        isPlaying,
        speed,
        currentIteration,
        activeEvent,
        demoState,
        togglePlay,
        setSpeed,
        startDemo,
        resetDemo,
    };
}
