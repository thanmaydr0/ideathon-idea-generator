import { detectDiminishingReturns } from "@/agents/synthesizer";
import { createMockIterationLog } from "@/tests/mocks/mockAgents";
import type { IterationLog } from "@/types";

// ────────────────────────────────────────────────────────────────────────────────
// Diminishing Returns Detection Tests
// ────────────────────────────────────────────────────────────────────────────────

describe("detectDiminishingReturns", () => {
    it("returns false with fewer than 5 logs", () => {
        const logs = [createMockIterationLog(1), createMockIterationLog(2)];
        expect(detectDiminishingReturns(logs)).toBe(false);
    });

    it("returns false with exactly 4 logs", () => {
        const logs = Array.from({ length: 4 }, (_, i) =>
            createMockIterationLog(i + 1),
        );
        expect(detectDiminishingReturns(logs)).toBe(false);
    });

    it("returns false when scores are improving normally", () => {
        // Mock logs produce scores starting at ~7.0 and increasing by ~0.5/iter
        const logs = Array.from({ length: 5 }, (_, i) =>
            createMockIterationLog(i + 1),
        );
        // The default mock has improvement > 0.05 across 5 iterations
        expect(detectDiminishingReturns(logs)).toBe(false);
    });

    it("returns true when scores are flat (< 0.05 total improvement)", () => {
        const flatScore = 8.5;
        const logs: IterationLog[] = Array.from({ length: 6 }, (_, i) =>
        ({
            ...createMockIterationLog(i + 1),
            averageScore: flatScore + (i * 0.008), // 0.04 total — below 0.05
        }),
        );
        expect(detectDiminishingReturns(logs)).toBe(true);
    });

    it("returns true when scores are perfectly flat", () => {
        const logs: IterationLog[] = Array.from({ length: 5 }, (_, i) =>
        ({
            ...createMockIterationLog(i + 1),
            averageScore: 8.0,
        }),
        );
        expect(detectDiminishingReturns(logs)).toBe(true);
    });

    it("returns true when scores are slightly declining", () => {
        const logs: IterationLog[] = Array.from({ length: 5 }, (_, i) =>
        ({
            ...createMockIterationLog(i + 1),
            averageScore: 8.5 - i * 0.005, // Slight decline, but |delta| < 0.05
        }),
        );
        expect(detectDiminishingReturns(logs)).toBe(true);
    });

    it("only considers the last 5 logs even if more are provided", () => {
        // First 5 logs improve dramatically, last 5 are flat
        const earlyLogs: IterationLog[] = Array.from({ length: 5 }, (_, i) =>
        ({
            ...createMockIterationLog(i + 1),
            averageScore: 5.0 + i * 0.8,
        }),
        );
        const lateLogs: IterationLog[] = Array.from({ length: 5 }, (_, i) =>
        ({
            ...createMockIterationLog(i + 6),
            averageScore: 8.5 + i * 0.005, // Flat
        }),
        );

        const allLogs = [...earlyLogs, ...lateLogs];
        expect(detectDiminishingReturns(allLogs)).toBe(true);
    });
});
