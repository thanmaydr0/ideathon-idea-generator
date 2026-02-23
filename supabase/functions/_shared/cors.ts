/**
 * IDEAForge — Shared CORS Headers
 *
 * ARCH: Every Edge Function must return these headers to allow
 * cross-origin requests from the Vite dev server (localhost:5173)
 * and the production frontend domain.
 *
 * OPTIONS preflight is handled automatically when these headers
 * are applied to the response.
 */
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
