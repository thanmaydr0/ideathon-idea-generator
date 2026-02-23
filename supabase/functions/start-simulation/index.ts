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

interface StartSimulationRequest {
    topic: string;
    domain: string;
    maxIterations?: number;
}

interface StartSimulationResponse {
    sessionId: string;
    status: "started";
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body: StartSimulationRequest = await req.json();

        if (!body.topic || typeof body.topic !== "string" || body.topic.trim().length === 0) {
            return new Response(
                JSON.stringify({ error: "topic is required and must be a non-empty string" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!body.domain || typeof body.domain !== "string") {
            return new Response(
                JSON.stringify({ error: "domain is required (e.g., Healthcare, EdTech, FinTech)" }),
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
        const { data: { user }, error: authError } = await userClient.auth.getUser();

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: "Invalid or expired authentication token" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const maxIterations = body.maxIterations ?? 1000;

        const { data: session, error: insertError } = await supabaseAdmin
            .from("simulation_sessions")
            .insert({
                user_id: user.id,
                topic: body.topic.trim(),
                domain: body.domain.trim(),
                status: "running",
                current_iteration: 0,
                max_iterations: maxIterations,
            })
            .select("id")
            .single();

        if (insertError || !session) {
            console.error("[start-simulation] DB insert error:", insertError);
            return new Response(
                JSON.stringify({ error: "Failed to create simulation session", details: insertError?.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[start-simulation] Created session ${session.id} for topic: "${body.topic}"`);

        try {
            await fetch(`${supabaseUrl}/functions/v1/run-iteration`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                    sessionId: session.id,
                    iteration: 1,
                }),
            });
        } catch (err) {
            console.error("[start-simulation] Failed to trigger first iteration:", err);
        }

        const response: StartSimulationResponse = {
            sessionId: session.id,
            status: "started",
        };

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err) {
        console.error("[start-simulation] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
