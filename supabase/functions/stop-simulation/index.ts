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

interface StopSimulationRequest {
    sessionId: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body: StopSimulationRequest = await req.json();

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
            .select("id, status")
            .eq("id", body.sessionId)
            .single();

        if (sessionError || !session) {
            return new Response(
                JSON.stringify({ error: "Session not found or access denied" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (session.status !== "running") {
            return new Response(
                JSON.stringify({
                    error: `Cannot stop session — current status is '${session.status}'`,
                    currentStatus: session.status,
                }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { error: updateError } = await supabaseAdmin
            .from("simulation_sessions")
            .update({
                status: "stopped",
                updated_at: new Date().toISOString(),
            })
            .eq("id", body.sessionId);

        if (updateError) {
            console.error("[stop-simulation] Update error:", updateError);
            return new Response(
                JSON.stringify({ error: "Failed to stop simulation", details: updateError.message }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[stop-simulation] Session ${body.sessionId} stopped by user`);

        return new Response(
            JSON.stringify({
                sessionId: body.sessionId,
                status: "stopped",
                message: "Simulation will stop after the current iteration completes",
            }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (err) {
        console.error("[stop-simulation] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(err) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
