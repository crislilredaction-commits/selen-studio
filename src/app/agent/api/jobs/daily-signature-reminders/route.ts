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
    const result = await generateDailySignatureReminders();
    return NextResponse.json({ ok: true, result });
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
