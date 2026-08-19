import { NextResponse } from "next/server";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createClient } from "@/lib/supabase/server";

type ActionCategory = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export async function GET() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await createClient();
  const admin = createSupabaseAdminClient();

  const [notificationsResult, feedbackResult, registrationsResult, assessmentsResult] =
    await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .like("source_kind", "daily_%")
        .is("dismissed_at", null),
      admin
        .from("daily_stakeholder_feedback")
        .select("id,status,organisation_response,resolved_at")
        .in("status", [
          "received",
          "selen_reviewed",
          "forwarded_to_organisation",
        ]),
      admin
        .from("daily_sessions")
        .select("id", { count: "exact", head: true })
        .in("registration_status", ["to_review", "summary_to_review"])
        .neq("status", "archived"),
      admin
        .from("daily_learning_assessments")
        .select("id", { count: "exact", head: true })
        .eq("outcome", "pending")
        .eq("method", "Selen quiz"),
    ]);

  const firstError =
    notificationsResult.error ??
    feedbackResult.error ??
    registrationsResult.error ??
    assessmentsResult.error;

  if (firstError) {
    console.error("Erreur chargement résumé actions Daily:", firstError);
    return NextResponse.json(
      { error: "Impossible de charger les actions Daily." },
      { status: 500 },
    );
  }

  const feedbackCount = (feedbackResult.data ?? []).filter((row) => {
    if (row.status === "received" || row.status === "selen_reviewed") return true;
    return (
      row.status === "forwarded_to_organisation" &&
      Boolean(row.organisation_response?.trim()) &&
      !row.resolved_at
    );
  }).length;

  const categories: ActionCategory[] = [
    {
      key: "notifications",
      label: "Alertes Daily",
      count: notificationsResult.count ?? 0,
      href: "/agent/daily/actions",
    },
    {
      key: "registrations",
      label: "Candidatures à contrôler",
      count: registrationsResult.count ?? 0,
      href: "/agent/daily/actions",
    },
    {
      key: "assessments",
      label: "Évaluations à valider",
      count: assessmentsResult.count ?? 0,
      href: "/agent/daily/actions",
    },
    {
      key: "feedback",
      label: "Réclamations & suggestions",
      count: feedbackCount,
      href: "/agent/daily/actions",
    },
  ].filter((category) => category.count > 0);

  return NextResponse.json(
    {
      total: categories.reduce((sum, category) => sum + category.count, 0),
      categories,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
