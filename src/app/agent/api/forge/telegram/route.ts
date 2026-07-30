import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createClient } from "@/lib/supabase/server";
import { sendForgeTelegramTest, telegramRuntimeStatus } from "@/lib/server/forgeTelegram";

export async function GET() {
  const auth = await requireLilOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forge_telegram_settings")
    .select("enabled,updated_at")
    .eq("id", true)
    .single();
  if (error) return NextResponse.json({ error: "Configuration Telegram indisponible." }, { status: 500 });
  return NextResponse.json({ ...data, runtime: telegramRuntimeStatus() });
}

export async function PATCH(request: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "État Telegram invalide." }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase.from("forge_telegram_settings")
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return NextResponse.json({ error: "La configuration n’a pas été enregistrée." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null) as { confirm?: unknown } | null;
  if (body?.confirm !== true) {
    return NextResponse.json({ error: "Une confirmation explicite est requise." }, { status: 400 });
  }
  const runtime = telegramRuntimeStatus();
  if (!runtime.enabled || !runtime.allowed || !runtime.configured) {
    return NextResponse.json({ error: "Le canal Telegram n’est pas autorisé dans cet environnement." }, { status: 409 });
  }
  try {
    await sendForgeTelegramTest();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Le message de test n’a pas pu être envoyé." }, { status: 502 });
  }
}

