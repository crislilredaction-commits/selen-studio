import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { processForgeTelegramQueue } from "@/lib/server/forgeTelegram";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json(
      { error: "Le worker Telegram est réservé à la production." },
      { status: 409 },
    );
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  const invocationKey = request.headers.get("x-forge-invocation-key")?.trim();
  if (!invocationKey) {
    return NextResponse.json({ error: "Identifiant d’exécution manquant." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const dryRun = request.headers.get("x-forge-dry-run") === "true";
  const { data: runId, error: beginError } = await admin.rpc(
    "forge_begin_telegram_worker_run",
    {
      p_invocation_key: invocationKey,
      p_source: dryRun ? "manual_mock" : "supabase_cron",
    },
  );
  if (beginError) {
    return NextResponse.json({ error: "Le verrou du worker est indisponible." }, { status: 500 });
  }
  if (!runId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_or_running" });
  }
  try {
    const result = dryRun
      ? { processed: 0, sent: 0, skipped: true, dryRun: true }
      : await processForgeTelegramQueue(admin);
    await admin.rpc("forge_finish_telegram_worker_run", {
      p_run_id: runId,
      p_status: result.skipped ? "skipped" : "completed",
      p_processed_count: result.processed,
      p_sent_count: result.sent,
      p_error_code: null,
    });
    return NextResponse.json(result);
  } catch {
    await admin.rpc("forge_finish_telegram_worker_run", {
      p_run_id: runId,
      p_status: "failed",
      p_processed_count: null,
      p_sent_count: null,
      p_error_code: "telegram_worker_failed",
    });
    return NextResponse.json({ error: "Le traitement Telegram a échoué." }, { status: 500 });
  }
}

export const POST = GET;
