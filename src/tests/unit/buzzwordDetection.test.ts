import { detectBuzzwords } from "@/agents/judges";

// ────────────────────────────────────────────────────────────────────────────────
// Buzzword Detection Tests
// ────────────────────────────────────────────────────────────────────────────────

describe("detectBuzzwords", () => {
    it("detects known buzzwords in text", () => {
        const text =
            "We are leveraging AI-powered blockchain to create a revolutionary, " +
            "disruptive solution that is truly cutting-edge and game-changing.";

        const found = detectBuzzwords(text);

        expect(found).toContain("leveraging");
        expect(found).toContain("revolutionary");
        expect(found).toContain("disruptive");
        expect(found).toContain("cutting-edge");
        expect(found).toContain("game-changing");
        expect(found.length).toBeGreaterThanOrEqual(5);
    });

    it("returns empty array for buzzword-free text", () => {
        const text =
            "A CNN model fine-tuned on 54,000 labeled crop disease images, " +
            "deployed quantized on Raspberry Pi 4, providing real-time " +
            "disease classification with 94% accuracy.";

        const found = detectBuzzwords(text);
        expect(found).toHaveLength(0);
    });

    it("is case-insensitive", () => {
        const text = "This is LEVERAGING the BLOCKCHAIN for a SEAMLESS experience.";
        const found = detectBuzzwords(text);
        expect(found).toContain("leveraging");
        expect(found).toContain("blockchain");
        expect(found).toContain("seamless");
    });

    it("detects multi-word buzzwords", () => {
        const text = "Our paradigm shift creates a next-gen end-to-end solution.";
        const found = detectBuzzwords(text);
        expect(found).toContain("paradigm shift");
        expect(found).toContain("next-gen");
        expect(found).toContain("end-to-end solution");
    });

    it("handles empty string", () => {
        expect(detectBuzzwords("")).toHaveLength(0);
    });

    it("counts correctly for penalty threshold (>3 buzzwords)", () => {
        const cleanText = "A specific technical solution with measurable outcomes.";
        const buzzText =
            "A revolutionary, disruptive, game-changing, seamless, " +
            "cutting-edge AI-powered blockchain end-to-end solution.";

        expect(detectBuzzwords(cleanText).length).toBeLessThanOrEqual(3);
        expect(detectBuzzwords(buzzText).length).toBeGreaterThan(3);
    });
});
