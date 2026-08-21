import { NextResponse } from "next/server";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type FeedbackRow = {
  status: string;
  organisation_response: string | null;
};

export async function GET() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const [feedbackResult, notificationResult, followupResult, sessionResult] =
    await Promise.all([
      admin
        .from("daily_stakeholder_feedback")
        .select("status,organisation_response")
        .in("status", [
          "received",
          "selen_reviewed",
          "forwarded_to_organisation",
        ]),
      admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "client_message")
        .is("read_at", null)
        .is("dismissed_at", null)
        .or(`target_user_id.eq.${auth.userId},target_user_id.is.null`),
      admin
        .from("daily_session_followup_entries")
        .select("id", { count: "exact", head: true })
        .in("entry_type", ["incident", "adaptation"])
        .in("level", ["high", "critical"])
        .neq("status", "resolved"),
      admin
        .from("daily_sessions")
        .select("id", { count: "exact", head: true })
        .in("registration_status", [
          "to_review",
          "responses_received",
          "summary_to_review",
        ])
        .neq("status", "archived"),
    ]);

  const readError =
    feedbackResult.error ??
    notificationResult.error ??
    followupResult.error ??
    sessionResult.error;

  if (readError) {
    console.error("[daily-action-summary] read failed", {
      code: readError.code,
      message: readError.message,
    });
    return NextResponse.json(
      { error: "daily_action_summary_unavailable" },
      { status: 500 },
    );
  }

  const feedbackCount = ((feedbackResult.data ?? []) as FeedbackRow[]).filter(
    (row) =>
      row.status === "received" ||
      row.status === "selen_reviewed" ||
      (row.status === "forwarded_to_organisation" &&
        Boolean(row.organisation_response?.trim())),
  ).length;

  const counts = {
    registrations: sessionResult.count ?? 0,
    feedback: feedbackCount,
    unreadMessages: notificationResult.count ?? 0,
    sensitiveFollowup: followupResult.count ?? 0,
  };

  return NextResponse.json({
    total:
      counts.registrations +
      counts.feedback +
      counts.unreadMessages +
      counts.sensitiveFollowup,
    counts,
    href: "/agent/daily/actions",
  });
}
