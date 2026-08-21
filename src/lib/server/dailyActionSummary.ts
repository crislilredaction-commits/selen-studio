import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type FeedbackRow = {
  status: string;
  organisation_response: string | null;
};

export type DailyActionSummary = {
  total: number;
  candidatures: number;
  feedback: number;
  unreadMessages: number;
  sensitiveFollowups: number;
  href: "/agent/daily/actions";
};

export async function getDailyActionSummary(
  userId: string,
): Promise<DailyActionSummary> {
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
        .or(`target_user_id.eq.${userId},target_user_id.is.null`),
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
    throw readError;
  }

  const feedbackCount = ((feedbackResult.data ?? []) as FeedbackRow[]).filter(
    (row) =>
      row.status === "received" ||
      row.status === "selen_reviewed" ||
      (row.status === "forwarded_to_organisation" &&
        Boolean(row.organisation_response?.trim())),
  ).length;

  const summary = {
    candidatures: sessionResult.count ?? 0,
    feedback: feedbackCount,
    unreadMessages: notificationResult.count ?? 0,
    sensitiveFollowups: followupResult.count ?? 0,
  };

  return {
    total:
      summary.candidatures +
      summary.feedback +
      summary.unreadMessages +
      summary.sensitiveFollowups,
    ...summary,
    href: "/agent/daily/actions",
  };
}
