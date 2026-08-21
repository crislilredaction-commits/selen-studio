import { NextResponse } from "next/server";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyActionSummary } from "@/lib/server/dailyActionSummary";

export async function GET() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  try {
    const summary = await getDailyActionSummary(auth.userId);

    return NextResponse.json({
      total: summary.total,
      counts: {
        registrations: summary.candidatures,
        feedback: summary.feedback,
        unreadMessages: summary.unreadMessages,
        sensitiveFollowup: summary.sensitiveFollowups,
      },
      href: summary.href,
    });
  } catch (error) {
    const readError = error as { code?: string; message?: string };

    console.error("[daily-action-summary] read failed", {
      code: readError.code,
      message: readError.message,
    });

    return NextResponse.json(
      { error: "daily_action_summary_unavailable" },
      { status: 500 },
    );
  }
}
