/**
 * Seed data for the RAG knowledge base.
 *
 * ARCH: 20 curated entries spanning 4 content types provide the initial
 * grounding data for persona agents. This eliminates the cold-start problem
 * where the first simulation would have zero RAG context.
 *
 * Categories:
 * - 5 winning hackathon ideas (AgriTech, HealthTech, EdTech, FinTech, ClimaTech)
 * - 5 failure patterns (common anti-patterns to avoid)
 * - 5 evaluation rubrics (scoring criteria and what judges value)
 * - 5 emerging tech trends (current technology landscape)
 */

export interface SeedEntry {
    contentType: "winning_idea" | "failure_pattern" | "rubric" | "trend";
    title: string;
    content: string;
    domain: string | null;
    year: number | null;
    score: number | null;
    metadata: Record<string, unknown>;
}

export const SEED_DATA: SeedEntry[] = [
    // ── WINNING IDEAS ─────────────────────────────────────────────────────────

    {
        contentType: "winning_idea",
        title: "CropSense: AI-Powered Precision Agriculture Advisory",
        content:
            "An edge-computing solution that combines drone imagery, soil moisture IoT sensors, and a lightweight CNN model running on Raspberry Pi 4 to provide real-time crop health assessments. The system processes multispectral imagery locally (no cloud dependency), generates field-level heatmaps showing disease probability, and pushes SMS alerts to smallholder farmers in local languages. Key differentiator: works offline in rural areas with no internet. Won 1st place at AgriHack 2024 with a working demo processing 50 hectares in under 3 minutes. TAM: 570M smallholder farms globally.",
        domain: "AgriTech",
        year: 2024,
        score: 9.2,
        metadata: { hackathon: "AgriHack 2024", teamSize: 4, prize: "1st Place" },
    },
    {
        contentType: "winning_idea",
        title: "MediLens: Differential Diagnosis Decision Support for Rural Clinics",
        content:
            "A progressive web app that assists rural healthcare workers with differential diagnosis using a fine-tuned Mistral-7B model trained on 2.3M anonymized patient records from WHO datasets. Clinicians input symptoms, vital signs, and basic lab results through a structured form (not chat). The system outputs ranked differential diagnoses with confidence scores, recommended tests, and drug interaction warnings. Key innovation: the model runs quantized (GGUF) on the clinic's local machine — no patient data leaves the premises. Integrates with OpenMRS for EHR compatibility. Won Grand Prize at HealthHack 2024.",
        domain: "HealthTech",
        year: 2024,
        score: 9.5,
        metadata: { hackathon: "HealthHack 2024", teamSize: 3, prize: "Grand Prize" },
    },
    {
        contentType: "winning_idea",
        title: "SkillGraph: Adaptive Learning Path Generator Using Knowledge Graphs",
        content:
            "A platform that builds personalized learning paths by constructing knowledge graphs from course syllabi across 15 MOOC platforms. Uses BERT-based named entity recognition to extract skill nodes, then applies topological sorting with Bloom's taxonomy weighting to sequence learning objectives. Students input their current skills and target role — the system generates a gap analysis and optimal learning path with estimated time. Differentiation: unlike recommendation engines, this uses graph algorithms (not collaborative filtering) so it works for niche skills with no historical user data. Won EdTech Track at TreeHacks 2024.",
        domain: "EdTech",
        year: 2024,
        score: 8.9,
        metadata: { hackathon: "TreeHacks 2024", teamSize: 3, prize: "Best EdTech" },
    },
    {
        contentType: "winning_idea",
        title: "MicroVault: Informal Economy Financial Identity Builder",
        content:
            "A mobile-first platform that helps unbanked micro-entrepreneurs build financial identity through activity-based credit scoring. Merchants log daily transactions via WhatsApp bot (voice notes transcribed by Whisper). The system builds cash flow models, generates verifiable financial statements, and packages creditworthiness scores that partner microfinance institutions accept for loan applications. Uses zero-knowledge proofs to share credit scores without exposing raw transaction data. Key metric: 73% of test users qualified for their first formal loan. Won FinTech Prize at HackMIT 2024.",
        domain: "FinTech",
        year: 2024,
        score: 9.1,
        metadata: { hackathon: "HackMIT 2024", teamSize: 4, prize: "Best FinTech" },
    },
    {
        contentType: "winning_idea",
        title: "GridBalance: Distributed Energy Storage Optimization with Multi-Agent RL",
        content:
            "A multi-agent reinforcement learning system that optimizes distributed energy storage across residential solar+battery installations. Each household's battery is an RL agent that learns optimal charge/discharge schedules considering: local consumption patterns, grid electricity prices, weather forecasts, and neighbor agents' states. Communication between agents uses federated averaging — no raw data shared. Simulation showed 34% reduction in peak grid demand and 22% cost savings per household. Won Sustainability Grand Prize at CalHacks 2024.",
        domain: "ClimaTech",
        year: 2024,
        score: 9.3,
        metadata: { hackathon: "CalHacks 2024", teamSize: 4, prize: "Sustainability Grand Prize" },
    },

    // ── FAILURE PATTERNS ──────────────────────────────────────────────────────

    {
        contentType: "failure_pattern",
        title: "The LLM Wrapper Trap",
        content:
            "Failure pattern: Ideas that are essentially 'take user input → send to GPT-4 API → display output' with no proprietary data, no fine-tuning, no novel retrieval, and no unique UX beyond a chat interface. Examples: 'ChatGPT for lawyers', 'AI tutor that answers questions', 'Resume builder powered by GPT'. Why it fails: zero defensibility (anyone can replicate in an afternoon), no data moat, and the differentiation disappears when OpenAI ships the same feature natively. Fix: add proprietary data, custom models, novel interaction paradigms, or domain-specific orchestration.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { failureFrequency: "very_common", severity: "critical" },
    },
    {
        contentType: "failure_pattern",
        title: "No Market Fit: Building for Imaginary Users",
        content:
            "Failure pattern: Ideas that solve a problem the team imagines exists but hasn't validated. Common signals: 'This will help millions of students' without interviewing a single student, no TAM estimation, no competitor analysis, targeting demographics the team doesn't understand ('farmers in rural India' from a Silicon Valley team). Why it fails: the idea addresses a symptom, not a root cause. Fix: talk to 5 real users before building, cite specific pain points from interviews, and size the market with real data.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { failureFrequency: "common", severity: "high" },
    },
    {
        contentType: "failure_pattern",
        title: "Over-Engineering: The Cathedral Pitch",
        content:
            "Failure pattern: Ideas that describe an impossibly complex system for a 48-hour hackathon. Signals: architecture diagrams with 15+ microservices, 'blockchain + AI + IoT + AR' tech stacks, requiring training a custom LLM from scratch, needing regulatory approval to demo. Why it fails: can't demo anything working. Judges value a polished MVP over a grand vision. Fix: scope ruthlessly — what's the ONE thing you can build and demo that proves the concept? Everything else goes in 'Future Work'.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { failureFrequency: "common", severity: "high" },
    },
    {
        contentType: "failure_pattern",
        title: "Vague Impact: 'Helping Millions' Without Metrics",
        content:
            "Failure pattern: Ideas with impact claims like 'will revolutionize healthcare', 'helps millions of people', 'transforms the education landscape' without any specific, measurable metrics. Why it fails: judges can't evaluate impact they can't measure. 'Will help millions' tells a judge nothing. Fix: use specific metrics: 'Reduces diagnosis time from 45 minutes to 8 minutes for rural clinics with <2 doctors', 'Saves average student 3.2 hours/week in course selection'.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { failureFrequency: "very_common", severity: "medium" },
    },
    {
        contentType: "failure_pattern",
        title: "Copy-Paste Idea: The Weekend Clone",
        content:
            "Failure pattern: Ideas that are direct copies of well-known products with minimal differentiation. Signals: 'Like Uber but for X', 'Airbnb for Y', 'Duolingo for Z' without explaining what's genuinely different. Why it fails: judges have seen these hundreds of times, and the comparison actively hurts — it highlights that someone already built it better with millions in funding. Fix: if inspired by an existing product, articulate the 3 specific things you do differently and why those differences matter for your specific users.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { failureFrequency: "common", severity: "high" },
    },

    // ── EVALUATION RUBRICS ────────────────────────────────────────────────────

    {
        contentType: "rubric",
        title: "Innovation Scoring Rubric",
        content:
            "Innovation is scored 0-10 based on: (10) Creates a genuinely new category or approach that didn't exist before. (8-9) Significantly novel combination of existing technologies with clear technical creativity. (6-7) Applies existing tech to a new domain with meaningful adaptation. (4-5) Incremental improvement on existing solutions. (2-3) Standard application of well-known patterns. (0-1) Direct copy of existing product. Key indicators of high innovation: novel data sources, unique algorithm design, creative interaction paradigms, surprising technical combinations that unlock new capabilities.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { rubricDimension: "innovation" },
    },
    {
        contentType: "rubric",
        title: "Feasibility Scoring Rubric",
        content:
            "Feasibility is scored 0-10 based on: (10) Complete working prototype demoed live. (8-9) Core functionality working, clear path to completion. (6-7) Key components demonstrated, some integration gaps. (4-5) Proof of concept partially working. (2-3) Only wireframes/mockups shown. (0-1) Purely conceptual, nothing built. Key indicators: defined tech stack with justification, realistic scope for team size and timeline, evidence of working code, handled edge cases discussed proactively.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { rubricDimension: "feasibility" },
    },
    {
        contentType: "rubric",
        title: "User Impact Scoring Rubric",
        content:
            "User Impact is scored 0-10 based on: (10) Measurably transforms user outcomes with quantified evidence (A/B test, user study). (8-9) Clear, specific user benefit with plausible metrics. (6-7) Defined user persona with identified pain point. (4-5) Generic user segment, unclear benefit magnitude. (2-3) Users mentioned but not characterized. (0-1) No user consideration. Key indicators: specific user stories with quantified time/money savings, accessibility consideration, user testing evidence.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { rubricDimension: "userImpact" },
    },
    {
        contentType: "rubric",
        title: "Presentation Quality Scoring Rubric",
        content:
            "Presentation is scored 0-10 based on: (10) Compelling narrative, live demo flawless, Q&A handled expertly. (8-9) Clear story arc, good demo, strong answers. (6-7) Adequate structure, demo works with minor issues. (4-5) Slides exist but story unclear, demo partially works. (2-3) Disorganized presentation, no working demo. (0-1) Could not effectively communicate the idea. Key indicators: problem→solution narrative flow, live demo (not screenshots), anticipation of judge questions, honest about limitations.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { rubricDimension: "presentation" },
    },
    {
        contentType: "rubric",
        title: "Novelty vs Existing Work Assessment",
        content:
            "Novelty is assessed by comparing against: existing academic papers (Google Scholar, Semantic Scholar), existing products (ProductHunt, Crunchbase), previous hackathon winners (Devpost, MLH), and patent databases. High novelty: no similar approach found in any source. Medium: similar concept exists but different implementation. Low: direct overlap with existing product. Critical: idea already exists as a commercial product. Judges especially penalize ideas that ignore existing work — showing awareness of competitors and explaining differentiation is crucial.",
        domain: null,
        year: 2024,
        score: null,
        metadata: { rubricDimension: "novelty" },
    },

    // ── EMERGING TECH TRENDS ──────────────────────────────────────────────────

    {
        contentType: "trend",
        title: "Edge AI: On-Device Intelligence",
        content:
            "Edge AI is moving from cloud-dependent inference to on-device execution. Key developments (2024-2025): quantized models (GGUF, GPTQ) running on consumer hardware, Apple's CoreML and Google's MediaPipe enabling real-time on-device inference, Raspberry Pi 5 handling lightweight vision models at 30fps. Hackathon opportunity: solutions that work offline, respect privacy by keeping data local, and have near-zero latency. Judge appeal: demonstrates technical depth and real-world practicality.",
        domain: null,
        year: 2025,
        score: null,
        metadata: { trendCategory: "edge_ai", maturity: "growth" },
    },
    {
        contentType: "trend",
        title: "Federated Learning: Privacy-Preserving ML",
        content:
            "Federated learning enables training ML models across distributed datasets without centralizing data. Key developments: Flower framework matured to production-ready, differential privacy integration becoming standard, cross-silo FL for healthcare consortia seeing real deployment. Hackathon opportunity: multi-institution data collaboration (hospitals sharing insights without sharing patient data), privacy-preserving recommendation systems, federated anomaly detection. Judge appeal: addresses GDPR/HIPAA compliance genuinely, not as an afterthought.",
        domain: null,
        year: 2025,
        score: null,
        metadata: { trendCategory: "federated_learning", maturity: "early_growth" },
    },
    {
        contentType: "trend",
        title: "Multimodal AI: Beyond Text-Only Systems",
        content:
            "Multimodal AI systems that process text, images, audio, and video simultaneously are exploding. Key developments: GPT-4V and Gemini handling interleaved modalities, open-source alternatives like LLaVA and Fuyu emerging, real-time multimodal processing becoming feasible. Hackathon opportunity: solutions that combine vision + language for document understanding, accessibility tools that describe visual content, multimodal search across heterogeneous media. Judge appeal: shows awareness of frontier capabilities.",
        domain: null,
        year: 2025,
        score: null,
        metadata: { trendCategory: "multimodal_ai", maturity: "rapid_growth" },
    },
    {
        contentType: "trend",
        title: "Agentic AI Systems: Autonomous Task Execution",
        content:
            "AI agents that autonomously plan, execute, and verify multi-step tasks are a defining trend. Key developments: tool-using agents (function calling), multi-agent orchestration frameworks, reflection and self-correction loops, structured output for reliable agent communication. Hackathon opportunity: agents that complete real workflows (not just answer questions), multi-agent debate systems, autonomous code generation with testing. Judge appeal: demonstrates understanding of AI system design beyond prompt engineering.",
        domain: null,
        year: 2025,
        score: null,
        metadata: { trendCategory: "agentic_systems", maturity: "early_growth" },
    },
    {
        contentType: "trend",
        title: "AI + IoT: Intelligent Sensor Networks",
        content:
            "The convergence of AI with IoT sensor networks enables real-time intelligent monitoring at scale. Key developments: TinyML models running on microcontrollers (ESP32, Arduino Nano 33), LoRaWAN enabling long-range low-power sensor communication, synthetic sensor data augmentation for training. Hackathon opportunity: environmental monitoring (air quality, water quality, soil health), predictive maintenance for industrial equipment, smart agriculture with sensor fusion. Judge appeal: hardware+software integration demonstrates full-stack capability.",
        domain: null,
        year: 2025,
        score: null,
        metadata: { trendCategory: "ai_iot", maturity: "growth" },
    },
];
