-- ============================================================================
-- IDEAForge Simulation Engine — Production Schema Migration
-- ============================================================================
-- Architecture: Adversarial Multi-Agent Loop with RAG-augmented persona
-- reasoning, structured JSON scoring, and convergence detection.
--
-- This migration creates the complete data model for:
--   1. Simulation session lifecycle management
--   2. Versioned idea snapshots per iteration
--   3. Persona critiques (7 adversarial personas)
--   4. Judge scoring (5 domain-specific judges)
--   5. Iteration-level convergence tracking
--   6. RAG knowledge base with pgvector embeddings
--   7. Failure pattern embeddings for anti-pattern detection
--
-- Design decisions documented inline with -- ARCH: comments.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────────
-- 0. Extensions
-- ────────────────────────────────────────────────────────────────────────────────

-- ARCH: pgvector enables ANN similarity search for novelty scoring and
-- RAG retrieval. We use vector(1536) to match text-embedding-3-large output.
CREATE EXTENSION IF NOT EXISTS vector;

-- ARCH: moddatetime auto-updates `updated_at` columns on row modification,
-- eliminating the need for application-level timestamp management.
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- ────────────────────────────────────────────────────────────────────────────────
-- 1. simulation_sessions
-- ────────────────────────────────────────────────────────────────────────────────
-- Top-level container for an adversarial refinement run.
-- Status lifecycle: pending → running → converged | failed | stopped
-- Holds convergence thresholds that the orchestrator evaluates each iteration.

CREATE TABLE simulation_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  topic           TEXT NOT NULL,
  domain          TEXT, -- Healthcare, EdTech, FinTech, AgriTech, etc.
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'converged', 'failed', 'stopped')),

  current_iteration       INTEGER NOT NULL DEFAULT 0,
  max_iterations          INTEGER NOT NULL DEFAULT 1000,

  -- ARCH: Four independent convergence thresholds give the orchestrator
  -- fine-grained control. A session converges only when ALL thresholds are met.
  target_avg_score        DECIMAL(4,2) NOT NULL DEFAULT 9.30,
  target_min_judge_score  DECIMAL(4,2) NOT NULL DEFAULT 8.80,
  target_novelty_score    DECIMAL(4,2) NOT NULL DEFAULT 9.00,
  target_feasibility_score DECIMAL(4,2) NOT NULL DEFAULT 8.50,

  -- Set when status transitions to 'converged'; FK added after idea_versions exists.
  final_idea_id   UUID,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on every modification.
CREATE TRIGGER set_simulation_sessions_updated_at
  BEFORE UPDATE ON simulation_sessions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON TABLE simulation_sessions IS
  'Top-level adversarial refinement session. Owns all iterations, critiques, and scores.';

-- ────────────────────────────────────────────────────────────────────────────────
-- 2. idea_versions
-- ────────────────────────────────────────────────────────────────────────────────
-- Immutable snapshot of an idea at a specific iteration.
-- Each iteration in the adversarial loop produces exactly one new IdeaVersion.
-- The embedding column enables cosine-similarity novelty scoring across iterations.

CREATE TABLE idea_versions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  iteration_number        INTEGER NOT NULL,

  problem_statement       TEXT NOT NULL,
  target_users            TEXT NOT NULL,
  existing_solutions_gap  TEXT NOT NULL,
  proposed_solution       TEXT NOT NULL,
  deliverable_type        TEXT NOT NULL
                            CHECK (deliverable_type IN ('SOFTWARE_PROTOTYPE', 'HARDWARE_PROTOTYPE')),
  implementation_approach TEXT NOT NULL,
  technical_feasibility   TEXT NOT NULL,
  expected_impact         TEXT NOT NULL,

  -- ARCH: Store the RAG chunks that informed this version's generation.
  -- This enables retroactive analysis of which knowledge influenced refinements.
  rag_context             JSONB DEFAULT '{}',

  -- ARCH: text-embedding-3-large produces 1536-dim vectors.
  -- Used for cross-iteration novelty scoring and inter-session dedup.
  embedding               vector(1536),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each session can have at most one idea per iteration.
  UNIQUE (session_id, iteration_number)
);

-- Now add the FK from simulation_sessions.final_idea_id → idea_versions.id
ALTER TABLE simulation_sessions
  ADD CONSTRAINT fk_final_idea
  FOREIGN KEY (final_idea_id) REFERENCES idea_versions(id)
  ON DELETE SET NULL;

COMMENT ON TABLE idea_versions IS
  'Immutable idea snapshot per iteration. Embedding enables novelty scoring via pgvector.';

-- ────────────────────────────────────────────────────────────────────────────────
-- 3. persona_critiques
-- ────────────────────────────────────────────────────────────────────────────────
-- Each of the 7 adversarial personas produces one critique per iteration.
-- priority_score (0-10) weights how much the orchestrator should prioritize
-- this persona's refinement suggestions in the next iteration.

CREATE TABLE persona_critiques (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_version_id       UUID NOT NULL REFERENCES idea_versions(id) ON DELETE CASCADE,
  session_id            UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  iteration_number      INTEGER NOT NULL,

  persona_type          TEXT NOT NULL
                          CHECK (persona_type IN (
                            'VISIONARY', 'SYSTEMS_ARCHITECT', 'MARKET_STRATEGIST',
                            'UX_THINKER', 'RISK_ANALYST', 'ETHICS_REVIEWER',
                            'COMPETITIVE_ANALYST'
                          )),

  strengths             JSONB NOT NULL DEFAULT '[]',  -- string[]
  weaknesses            JSONB NOT NULL DEFAULT '[]',  -- string[]
  suggested_refinements JSONB NOT NULL DEFAULT '[]',  -- string[]
  priority_score        DECIMAL(4,2) CHECK (priority_score >= 0 AND priority_score <= 10),

  -- ARCH: Store raw LLM response for debugging, prompt auditing, and fine-tuning data.
  raw_response          TEXT,
  tokens_used           INTEGER,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One critique per persona per iteration per session.
  UNIQUE (session_id, iteration_number, persona_type)
);

COMMENT ON TABLE persona_critiques IS
  'Adversarial persona critique output. 7 personas × N iterations per session.';

-- ────────────────────────────────────────────────────────────────────────────────
-- 4. judge_scores
-- ────────────────────────────────────────────────────────────────────────────────
-- Each of the 5 judges evaluates each iteration across 5 dimensions (0-10 each).
-- pass_threshold indicates if this judge alone would approve the idea.

CREATE TABLE judge_scores (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_version_id         UUID NOT NULL REFERENCES idea_versions(id) ON DELETE CASCADE,
  session_id              UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  iteration_number        INTEGER NOT NULL,

  judge_type              TEXT NOT NULL
                            CHECK (judge_type IN (
                              'VC_JUDGE', 'TECHNICAL_JUDGE', 'ACADEMIC_JUDGE',
                              'INDUSTRY_JUDGE', 'EXECUTION_JUDGE'
                            )),

  -- ARCH: 5 independent scoring dimensions prevent a single high score
  -- from masking weaknesses in other areas.
  problem_relevance       DECIMAL(4,2) CHECK (problem_relevance >= 0 AND problem_relevance <= 10),
  innovation              DECIMAL(4,2) CHECK (innovation >= 0 AND innovation <= 10),
  feasibility             DECIMAL(4,2) CHECK (feasibility >= 0 AND feasibility <= 10),
  user_impact             DECIMAL(4,2) CHECK (user_impact >= 0 AND user_impact <= 10),
  presentation            DECIMAL(4,2) CHECK (presentation >= 0 AND presentation <= 10),
  overall_score           DECIMAL(4,2) CHECK (overall_score >= 0 AND overall_score <= 10),

  specific_critiques      JSONB DEFAULT '[]',   -- string[]
  improvement_directives  JSONB DEFAULT '[]',   -- string[]
  pass_threshold          BOOLEAN NOT NULL DEFAULT false,

  raw_response            TEXT,
  tokens_used             INTEGER,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One score per judge per iteration per session.
  UNIQUE (session_id, iteration_number, judge_type)
);

COMMENT ON TABLE judge_scores IS
  'Domain-specific judge scoring. 5 judges × N iterations per session.';

-- ────────────────────────────────────────────────────────────────────────────────
-- 5. iteration_logs
-- ────────────────────────────────────────────────────────────────────────────────
-- Aggregated convergence metrics computed after each iteration.
-- The orchestrator reads the latest row to decide continue/stop.
-- Streamed via Realtime to the frontend dashboard.

CREATE TABLE iteration_logs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                  UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
  iteration_number            INTEGER NOT NULL,

  average_score               DECIMAL(4,2),
  min_judge_score             DECIMAL(4,2),
  novelty_score               DECIMAL(4,2),
  feasibility_score           DECIMAL(4,2),
  unresolved_critiques_count  INTEGER NOT NULL DEFAULT 0,

  -- ARCH: convergence_delta tracks the score diff from the previous iteration.
  -- When |delta| < epsilon for N consecutive iterations → diminishing returns.
  convergence_delta           DECIMAL(6,4) DEFAULT 0.0000,
  is_diminishing_returns      BOOLEAN NOT NULL DEFAULT false,

  status                      TEXT NOT NULL DEFAULT 'improving'
                                CHECK (status IN ('improving', 'plateau', 'converged', 'diverged')),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (session_id, iteration_number)
);

COMMENT ON TABLE iteration_logs IS
  'Per-iteration convergence metrics. Primary signal for loop termination decisions.';

-- ────────────────────────────────────────────────────────────────────────────────
-- 6. rag_knowledge_base
-- ────────────────────────────────────────────────────────────────────────────────
-- Pre-loaded knowledge chunks for RAG retrieval. Persona agents query this
-- via pgvector similarity search to ground their critiques in real-world data.

CREATE TABLE rag_knowledge_base (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  content_type  TEXT NOT NULL
                  CHECK (content_type IN (
                    'winning_idea', 'failure_pattern', 'rubric', 'trend', 'patent_abstract'
                  )),

  title         TEXT,
  content       TEXT NOT NULL,
  domain        TEXT,
  year          INTEGER,
  score         DECIMAL(4,2), -- historical score if available

  -- ARCH: Same 1536-dim embedding space as idea_versions, enabling
  -- cross-table similarity queries (idea ↔ knowledge).
  embedding     vector(1536),
  metadata      JSONB DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rag_knowledge_base IS
  'RAG knowledge store. Queried via pgvector ANN for persona prompt augmentation.';

-- ────────────────────────────────────────────────────────────────────────────────
-- 7. failure_embeddings
-- ────────────────────────────────────────────────────────────────────────────────
-- Tracks recurring failure modes as embeddings. When a new idea is generated,
-- its embedding is checked against this table — high similarity to known
-- failures triggers a warning in the convergence detector.

CREATE TABLE failure_embeddings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID REFERENCES simulation_sessions(id) ON DELETE SET NULL,
  iteration_number    INTEGER,

  failure_type        TEXT NOT NULL
                        CHECK (failure_type IN (
                          'vague_solution', 'llm_wrapper', 'no_novelty',
                          'infeasible', 'buzzword_heavy', 'overused_idea'
                        )),

  failure_description TEXT NOT NULL,
  embedding           vector(1536),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE failure_embeddings IS
  'Anti-pattern embeddings. Used to penalize ideas similar to known failure modes.';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Session lookups (all child tables reference session_id heavily)
CREATE INDEX idx_idea_versions_session       ON idea_versions(session_id);
CREATE INDEX idx_persona_critiques_session   ON persona_critiques(session_id);
CREATE INDEX idx_judge_scores_session        ON judge_scores(session_id);
CREATE INDEX idx_iteration_logs_session      ON iteration_logs(session_id);
CREATE INDEX idx_failure_embeddings_session  ON failure_embeddings(session_id);

-- Idea version lookups by iteration
CREATE INDEX idx_idea_versions_iteration     ON idea_versions(session_id, iteration_number);

-- Foreign key indexes for join performance
CREATE INDEX idx_persona_critiques_idea      ON persona_critiques(idea_version_id);
CREATE INDEX idx_judge_scores_idea           ON judge_scores(idea_version_id);

-- User session lookups
CREATE INDEX idx_simulation_sessions_user    ON simulation_sessions(user_id);
CREATE INDEX idx_simulation_sessions_status  ON simulation_sessions(status);

-- RAG content type filtering
CREATE INDEX idx_rag_knowledge_base_type     ON rag_knowledge_base(content_type);
CREATE INDEX idx_rag_knowledge_base_domain   ON rag_knowledge_base(domain);

-- Failure type filtering
CREATE INDEX idx_failure_embeddings_type     ON failure_embeddings(failure_type);

-- ────────────────────────────────────────────────────────────────────────────────
-- VECTOR INDEXES (IVFFlat for fast ANN search)
-- ────────────────────────────────────────────────────────────────────────────────
-- ARCH: IVFFlat is chosen over HNSW for these tables because:
--   - Lower memory footprint (important for Supabase free/pro tier)
--   - Acceptable recall at our expected data volumes (<100K rows)
--   - Faster index build time during migrations
-- lists = sqrt(expected_rows) is the standard tuning heuristic.

CREATE INDEX idx_idea_versions_embedding
  ON idea_versions
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_rag_knowledge_base_embedding
  ON rag_knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_failure_embeddings_embedding
  ON failure_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- ARCH: RLS ensures multi-tenant isolation. Each user can only access their
-- own simulation sessions and all child data linked to those sessions.
-- The pattern: check auth.uid() = user_id on the session, then join through
-- session_id for child tables.

ALTER TABLE simulation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idea_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_critiques ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE iteration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_embeddings ENABLE ROW LEVEL SECURITY;

-- ── simulation_sessions ──────────────────────────────────────────────────────

CREATE POLICY "Users can view their own sessions"
  ON simulation_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create sessions"
  ON simulation_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON simulation_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
  ON simulation_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- ── idea_versions (access via session ownership) ─────────────────────────────

CREATE POLICY "Users can view ideas from their sessions"
  ON idea_versions FOR SELECT
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create ideas in their sessions"
  ON idea_versions FOR INSERT
  WITH CHECK (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update ideas in their sessions"
  ON idea_versions FOR UPDATE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete ideas in their sessions"
  ON idea_versions FOR DELETE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

-- ── persona_critiques (access via session ownership) ─────────────────────────

CREATE POLICY "Users can view critiques from their sessions"
  ON persona_critiques FOR SELECT
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create critiques in their sessions"
  ON persona_critiques FOR INSERT
  WITH CHECK (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update critiques in their sessions"
  ON persona_critiques FOR UPDATE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete critiques in their sessions"
  ON persona_critiques FOR DELETE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

-- ── judge_scores (access via session ownership) ──────────────────────────────

CREATE POLICY "Users can view scores from their sessions"
  ON judge_scores FOR SELECT
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create scores in their sessions"
  ON judge_scores FOR INSERT
  WITH CHECK (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update scores in their sessions"
  ON judge_scores FOR UPDATE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete scores in their sessions"
  ON judge_scores FOR DELETE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

-- ── iteration_logs (access via session ownership) ────────────────────────────

CREATE POLICY "Users can view logs from their sessions"
  ON iteration_logs FOR SELECT
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create logs in their sessions"
  ON iteration_logs FOR INSERT
  WITH CHECK (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update logs in their sessions"
  ON iteration_logs FOR UPDATE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete logs in their sessions"
  ON iteration_logs FOR DELETE
  USING (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

-- ── rag_knowledge_base (read-only for authenticated users) ───────────────────
-- ARCH: RAG data is shared global knowledge. All authenticated users can read,
-- but only service_role (Edge Functions) can write.

CREATE POLICY "Authenticated users can read knowledge base"
  ON rag_knowledge_base FOR SELECT
  USING (auth.role() = 'authenticated');

-- ── failure_embeddings (read via session, write via service_role) ─────────────

CREATE POLICY "Users can view failure patterns from their sessions"
  ON failure_embeddings FOR SELECT
  USING (
    session_id IS NULL  -- global patterns are readable by all authed users
    OR session_id IN (
      SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create failure patterns in their sessions"
  ON failure_embeddings FOR INSERT
  WITH CHECK (session_id IN (
    SELECT id FROM simulation_sessions WHERE user_id = auth.uid()
  ));

-- ============================================================================
-- REALTIME
-- ============================================================================
-- ARCH: Enable Supabase Realtime on tables that stream live updates to the
-- frontend dashboard during an active simulation.
-- - iteration_logs: Score evolution graph updates in real-time
-- - judge_scores: Judge score cards animate as they arrive
-- - persona_critiques: Persona cards populate as critiques stream in

ALTER PUBLICATION supabase_realtime ADD TABLE iteration_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE judge_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE persona_critiques;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to compute average judge score for an iteration.
-- Called by the orchestrator after all 5 judges have scored.
CREATE OR REPLACE FUNCTION compute_iteration_avg_score(
  p_session_id UUID,
  p_iteration_number INTEGER
)
RETURNS DECIMAL(4,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  avg_score DECIMAL(4,2);
BEGIN
  SELECT COALESCE(AVG(overall_score), 0.00)
  INTO avg_score
  FROM judge_scores
  WHERE session_id = p_session_id
    AND iteration_number = p_iteration_number;

  RETURN avg_score;
END;
$$;

-- Function to get the minimum judge score for convergence checks.
CREATE OR REPLACE FUNCTION compute_iteration_min_score(
  p_session_id UUID,
  p_iteration_number INTEGER
)
RETURNS DECIMAL(4,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  min_score DECIMAL(4,2);
BEGIN
  SELECT COALESCE(MIN(overall_score), 0.00)
  INTO min_score
  FROM judge_scores
  WHERE session_id = p_session_id
    AND iteration_number = p_iteration_number;

  RETURN min_score;
END;
$$;

-- Function to perform RAG similarity search against the knowledge base.
-- Returns the top-K most similar chunks for a given embedding.
CREATE OR REPLACE FUNCTION match_rag_knowledge(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INTEGER DEFAULT 5,
  filter_content_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  content_type TEXT,
  domain TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rkb.id,
    rkb.title,
    rkb.content,
    rkb.content_type,
    rkb.domain,
    1 - (rkb.embedding <=> query_embedding) AS similarity
  FROM rag_knowledge_base rkb
  WHERE rkb.embedding IS NOT NULL
    AND 1 - (rkb.embedding <=> query_embedding) > match_threshold
    AND (filter_content_type IS NULL OR rkb.content_type = filter_content_type)
  ORDER BY rkb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to check idea novelty against failure embeddings.
-- Returns the maximum similarity to any known failure pattern.
CREATE OR REPLACE FUNCTION check_failure_similarity(
  query_embedding vector(1536),
  threshold FLOAT DEFAULT 0.8
)
RETURNS TABLE (
  failure_type TEXT,
  failure_description TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fe.failure_type,
    fe.failure_description,
    1 - (fe.embedding <=> query_embedding) AS similarity
  FROM failure_embeddings fe
  WHERE fe.embedding IS NOT NULL
    AND 1 - (fe.embedding <=> query_embedding) > threshold
  ORDER BY fe.embedding <=> query_embedding
  LIMIT 5;
END;
$$;

COMMENT ON FUNCTION compute_iteration_avg_score IS
  'Computes the mean overall_score across all 5 judges for a given iteration.';
COMMENT ON FUNCTION compute_iteration_min_score IS
  'Returns the lowest judge overall_score for convergence threshold checks.';
COMMENT ON FUNCTION match_rag_knowledge IS
  'pgvector ANN search over the RAG knowledge base. Used by persona agents.';
COMMENT ON FUNCTION check_failure_similarity IS
  'Checks a new idea embedding against known failure patterns for quality control.';
