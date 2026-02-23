import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

function createUserClient(authHeader: string) {
    return createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

interface GetSessionStateRequest {
    sessionId: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body: GetSessionStateRequest = await req.json();

        if (!body.sessionId) {
            return new Response(
                JSON.stringify({ error: "sessionId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing Authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const userClient = createUserClient(authHeader);

        const { data: session, error: sessionError } = await userClient
            .from("simulation_sessions")
            .select("*")
            .eq("id", body.sessionId)
            .single();

        if (sessionError || !session) {
            return new Response(
                JSON.stringify({ error: "Session not found or access denied" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { data: iterationLogs, error: logsError } = await userClient
            .from("iteration_logs")
            .select("*")
            .eq("session_id", body.sessionId)
            .order("iteration_number", { ascending: true });

        if (logsError) {
            console.error("[get-session-state] Error fetching iteration logs:", logsError);
        }

        const { data: latestIdea, error: ideaError } = await userClient
            .from("idea_versions")
            .select("*")
            .eq("session_id", body.sessionId)
            .order("iteration_number", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (ideaError) {
            console.error("[get-session-state] Error fetching latest idea:", ideaError);
        }

        const latestIteration = session.current_iteration;
        const { data: personaCritiques } = await userClient
            .from("persona_critiques")
            .select("*")
            .eq("session_id", body.sessionId)
            .eq("iteration_number", latestIteration)
            .order("persona_type", { ascending: true });

        const { data: judgeScores } = await userClient
            .from("judge_scores")
            .select("*")
            .eq("session_id", body.sessionId)
            .eq("iteration_number", latestIteration)
            .order("judge_type", { ascending: true });

        const lastLog = iterationLogs && iterationLogs.length > 0
            ? iterationLogs[iterationLogs.length - 1]
            : null;

        const convergenceStatus = {
            currentIteration: session.current_iteration,
            maxIterations: session.max_iterations,
            averageScore: lastLog?.average_score ?? 0,
            minJudgeScore: lastLog?.min_judge_score ?? 0,
            noveltyScore: lastLog?.novelty_score ?? 0,
            feasibilityScore: lastLog?.feasibility_score ?? 0,
            targetAvgScore: session.target_avg_score,
            targetMinJudgeScore: session.target_min_judge_score,
            isConverged: session.status === "converged",
            isDiminishingReturns: lastLog?.is_diminishing_returns ?? false,
        };

        return new Response(
            JSON.stringify({
                session,
                iterationLogs: iterationLogs ?? [],
                latestIdea: latestIdea ?? null,
                personaCritiques: personaCritiques ?? [],
                judgeScores: judgeScores ?? [],
                convergenceStatus,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (err) {
        console.error("[get-session-state] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: "Failed to fetch session state", details: String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
