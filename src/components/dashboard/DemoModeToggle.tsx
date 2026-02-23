import { Play, Square, FastForward } from "lucide-react";

interface DemoModeToggleProps {
    isPlaying: boolean;
    speed: number;
    onToggle: () => void;
    onSpeedChange: (newSpeed: number) => void;
    onStart: () => void;
}

export function DemoModeToggle({
    isPlaying,
    speed,
    onToggle,
    onSpeedChange,
    onStart,
}: DemoModeToggleProps) {
    return (
        <div className="flex items-center gap-1.5 px-3 py-1.5 ml-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-full">
            <span className="text-xs font-bold text-purple-400 tracking-wider">DEMO</span>

            <button
                onClick={isPlaying ? onToggle : onStart}
                className="p-1.5 hover:bg-white/10 rounded-md transition-colors flex items-center justify-center"
                title={isPlaying ? "Stop Demo" : "Start Demo"}
            >
                {isPlaying ? (
                    <Square size={14} className="text-red-400" fill="currentColor" />
                ) : (
                    <Play size={14} className="text-green-400" fill="currentColor" />
                )}
            </button>

            {isPlaying && (
                <button
                    onClick={() => onSpeedChange(speed === 10 ? 20 : speed === 20 ? 1 : 10)}
                    className="text-xs font-mono font-medium text-purple-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                    title="Change Playback Speed"
                >
                    <FastForward size={14} /> {speed}x
                </button>
            )}
        </div>
    );
}
