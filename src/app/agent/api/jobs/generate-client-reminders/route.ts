import { NextResponse } from "next/server";
import { generateClientReminders } from "@/lib/server/clientReminders";
import { dispatchDueClientReminders } from "@/lib/server/dailyTaskReminderDispatch";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const authHeader = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";

  return authHeader === `Bearer ${secret}` || cronHeader === secret;
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const generated = await generateClientReminders();
    const dispatched = await dispatchDueClientReminders();
    return NextResponse.json({ ok: true, result: { generated, dispatched } });
  } catch (error) {
    console.error("Job relances clients échoué.", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant le job relances.",
      },
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
