import { useState, useMemo, useCallback, memo } from "react";
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    type Node,
    type Edge,
} from "reactflow";
import "reactflow/dist/style.css";

import type { IterationLog } from "@/types";
import { IdeaNode } from "@/components/evolution/IdeaNode";
import type { IdeaNodeData } from "@/components/evolution/IdeaNode";
import { IdeaDiffViewer } from "@/components/evolution/IdeaDiffViewer";

// ────────────────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────────────────

interface IdeaEvolutionGraphProps {
    logs: IterationLog[];
    /** Iteration numbers where drift-revert (pivot) occurred. */
    pivotIterations?: Set<number>;
    /** Iteration number that achieved convergence (if any). */
    convergedIteration?: number;
}

// ────────────────────────────────────────────────────────────────────────────────
// Node Types Registration
// ────────────────────────────────────────────────────────────────────────────────

/**
 * ARCH: nodeTypes must be defined OUTSIDE the component to prevent
 * react-flow from re-registering on every render. This is a common
 * react-flow performance requirement.
 */
const NODE_TYPES = { ideaNode: IdeaNode };

// ────────────────────────────────────────────────────────────────────────────────
// Layout Helpers
// ────────────────────────────────────────────────────────────────────────────────

/** Layout config for the DAG. */
const NODE_WIDTH = 180;
const NODE_HEIGHT = 160;
const X_SPACING = 220;
const Y_SPACING = 200;
const NODES_PER_ROW = 5;

/**
 * Position nodes in a left-to-right, top-to-bottom grid with wrapping.
 * This creates a readable flow for potentially many iterations.
 */
function getNodePosition(index: number): { x: number; y: number } {
    const col = index % NODES_PER_ROW;
    const row = Math.floor(index / NODES_PER_ROW);
    return { x: col * X_SPACING + 50, y: row * Y_SPACING + 50 };
}

// ────────────────────────────────────────────────────────────────────────────────
// Edge Styling
// ────────────────────────────────────────────────────────────────────────────────

function scoreToEdgeColor(scoreDelta: number): string {
    if (scoreDelta > 0.2) return "#22c55e";  // green — improving
    if (scoreDelta < -0.2) return "#ef4444"; // red — regressing
    return "#71717a";                         // zinc — flat
}

// ────────────────────────────────────────────────────────────────────────────────
// IdeaEvolutionGraph — Main Component
// ────────────────────────────────────────────────────────────────────────────────

/**
 * DAG visualization of the idea evolution across iterations.
 *
 * Features:
 * - Each iteration is a custom node showing scores and mini bars
 * - Nodes colored by score (red→yellow→green gradient)
 * - Special markers: PIVOT (drift revert), CONVERGED (final), BEST (crown)
 * - Edges colored by score delta (green=improving, red=regressing)
 * - Click node → opens diff viewer comparing that iteration with the previous
 * - Pannable and zoomable via react-flow defaults
 */
export const IdeaEvolutionGraph = memo(function IdeaEvolutionGraph({
    logs,
    pivotIterations = new Set<number>(),
    convergedIteration,
}: IdeaEvolutionGraphProps) {
    const [selectedLog, setSelectedLog] = useState<IterationLog | null>(null);

    // Find the best scoring iteration
    const bestIterationNumber = useMemo(() => {
        if (logs.length === 0) return -1;
        return logs.reduce(
            (best, log) =>
                log.averageScore > (logs.find((l) => l.iterationNumber === best)?.averageScore ?? 0)
                    ? log.iterationNumber
                    : best,
            logs[0].iterationNumber,
        );
    }, [logs]);

    const handleNodeClick = useCallback((log: IterationLog) => {
        setSelectedLog((prev) => (prev?.id === log.id ? null : log));
    }, []);

    // Build nodes and edges from iteration logs
    const { nodes, edges } = useMemo(() => {
        const sorted = [...logs].sort(
            (a, b) => a.iterationNumber - b.iterationNumber,
        );

        const builtNodes: Node<IdeaNodeData>[] = sorted.map((log, index) => ({
            id: `iter-${log.iterationNumber}`,
            type: "ideaNode",
            position: getNodePosition(index),
            data: {
                log,
                isBest: log.iterationNumber === bestIterationNumber,
                isPivot: pivotIterations.has(log.iterationNumber),
                isConverged: log.iterationNumber === convergedIteration,
                isSelected: selectedLog?.id === log.id,
                onClick: handleNodeClick,
            },
        }));

        const builtEdges: Edge[] = [];
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            const delta = curr.averageScore - prev.averageScore;

            builtEdges.push({
                id: `edge-${prev.iterationNumber}-${curr.iterationNumber}`,
                source: `iter-${prev.iterationNumber}`,
                target: `iter-${curr.iterationNumber}`,
                animated: curr.iterationNumber === convergedIteration,
                style: {
                    stroke: scoreToEdgeColor(delta),
                    strokeWidth: 2,
                },
                label: delta !== 0 ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : undefined,
                labelStyle: {
                    fill: scoreToEdgeColor(delta),
                    fontSize: 10,
                    fontWeight: 600,
                },
                labelBgStyle: {
                    fill: "#09090b",
                    fillOpacity: 0.8,
                },
                labelBgPadding: [4, 2] as [number, number],
                labelBgBorderRadius: 4,
            });
        }

        return { nodes: builtNodes, edges: builtEdges };
    }, [logs, bestIterationNumber, pivotIterations, convergedIteration, selectedLog, handleNodeClick]);

    // Find previous log for diff viewer
    const previousLog = useMemo(() => {
        if (!selectedLog) return null;
        const sorted = [...logs].sort(
            (a, b) => a.iterationNumber - b.iterationNumber,
        );
        const idx = sorted.findIndex((l) => l.id === selectedLog.id);
        return idx > 0 ? sorted[idx - 1] : null;
    }, [logs, selectedLog]);

    if (logs.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-500">
                No iterations yet — start a simulation to see the evolution graph.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Graph */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-200">
                        Idea Evolution Graph
                    </h3>
                    <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Improving
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-zinc-500" /> Flat
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500" /> Regressing
                        </span>
                        <span>👑 Best</span>
                        <span>↩️ Pivot</span>
                        <span>✅ Converged</span>
                    </div>
                </div>

                <div style={{ height: Math.min(600, Math.ceil(logs.length / NODES_PER_ROW) * Y_SPACING + 120) }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={NODE_TYPES}
                        fitView
                        fitViewOptions={{ padding: 0.2 }}
                        minZoom={0.3}
                        maxZoom={1.5}
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#27272a" gap={20} />
                        <Controls
                            showInteractive={false}
                            className="!bg-zinc-900 !border-zinc-700 !shadow-none [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-700"
                        />
                        <MiniMap
                            nodeColor={(node) => {
                                const data = node.data as IdeaNodeData;
                                const score = data.log.averageScore;
                                if (score >= 8) return "#22c55e";
                                if (score >= 6) return "#f59e0b";
                                return "#ef4444";
                            }}
                            maskColor="rgba(0, 0, 0, 0.7)"
                            className="!bg-zinc-900 !border-zinc-700"
                        />
                    </ReactFlow>
                </div>
            </div>

            {/* Diff Viewer — shown when a node is clicked */}
            {selectedLog && previousLog && (
                <IdeaDiffViewer
                    versionA={previousLog.ideaVersion}
                    versionB={selectedLog.ideaVersion}
                    critiques={selectedLog.personaCritiques}
                    scoreDelta={selectedLog.averageScore - previousLog.averageScore}
                />
            )}

            {/* First iteration detail (no diff) */}
            {selectedLog && !previousLog && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                    <h3 className="text-sm font-medium text-zinc-200 mb-3">
                        Initial Idea (Iteration #{selectedLog.iterationNumber})
                    </h3>
                    <div className="space-y-2">
                        {[
                            { label: "🎯 Problem", value: selectedLog.ideaVersion.problemStatement },
                            { label: "💡 Solution", value: selectedLog.ideaVersion.solution },
                            { label: "📦 Deliverable", value: selectedLog.ideaVersion.deliverable },
                            { label: "⚙️ Technical", value: selectedLog.ideaVersion.technicalApproach },
                            { label: "📈 Impact", value: selectedLog.ideaVersion.expectedImpact },
                        ].map((f) => (
                            <div key={f.label} className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800">
                                <p className="text-xs text-zinc-400 mb-1">{f.label}</p>
                                <p className="text-sm text-zinc-200">{f.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});
