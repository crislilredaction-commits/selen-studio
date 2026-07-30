import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { processForgeTelegramQueue } from "@/lib/server/forgeTelegram";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }
  try {
    return NextResponse.json(await processForgeTelegramQueue(createSupabaseAdminClient()));
  } catch {
    return NextResponse.json({ error: "Le traitement Telegram a échoué." }, { status: 500 });
  }
}

export const POST = GET;

