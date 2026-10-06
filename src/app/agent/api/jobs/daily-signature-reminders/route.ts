import { NextResponse } from "next/server";
import { generateDailySignatureReminders } from "@/lib/server/dailySignatureReminders";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const legacy = await generateDailySignatureReminders();
    const baseUrl = (process.env.SELEN_DAILY_BASE_URL?.trim() || "https://www.selen-editions.fr").replace(/\/$/, "");
    const upstream = await fetch(`${baseUrl}/api/internal/daily/signature-followup-automation?execute=1`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET?.trim()}` },
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => ({ error: "Réponse Daily illisible." }));
    if (!upstream.ok) {
      return NextResponse.json({ ok: false, legacy, daily: payload }, { status: upstream.status });
    }
    return NextResponse.json({ ok: true, legacy, daily: payload });
  } catch (error) {
    console.error("Job relances signatures Daily échoué.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue pendant le job de relance." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
