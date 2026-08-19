import { NextResponse } from "next/server";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

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

  const admin = createSupabaseAdminClient();

  const [checklistResult, feedbackReceivedResult, feedbackResponseResult, documentResult] =
    await Promise.all([
      admin
        .from("daily_session_checklist_items")
        .select("id", { count: "exact", head: true })
        .in("responsibility", ["selen", "shared"])
        .in("status", ["todo", "in_progress", "to_review", "blocked"]),
      admin
        .from("daily_stakeholder_feedback")
        .select("id", { count: "exact", head: true })
        .eq("status", "received"),
      admin
        .from("daily_stakeholder_feedback")
        .select("id", { count: "exact", head: true })
        .eq("status", "forwarded_to_organisation")
        .not("organisation_response", "is", null),
      admin
        .from("daily_documents")
        .select("id", { count: "exact", head: true })
        .eq("is_current", true)
        .is("archived_at", null)
        .in("status", ["to_check", "to_validate"]),
    ]);

  const firstError = [
    checklistResult.error,
    feedbackReceivedResult.error,
    feedbackResponseResult.error,
    documentResult.error,
  ].find(Boolean);

  if (firstError) {
    console.error("Erreur chargement actions Daily dashboard:", firstError);
    return NextResponse.json(
      { error: "Impossible de charger les actions Daily." },
      { status: 500 },
    );
  }

  const categories: ActionCategory[] = [
    {
      key: "session_checklist",
      label: "Dossiers de session",
      count: checklistResult.count ?? 0,
      href: "/agent/daily/session-dossiers",
    },
    {
      key: "stakeholder_feedback",
      label: "Réclamations & suggestions",
      count:
        (feedbackReceivedResult.count ?? 0) +
        (feedbackResponseResult.count ?? 0),
      href: "/agent/daily/stakeholder-feedback",
    },
    {
      key: "documents",
      label: "Documents à contrôler",
      count: documentResult.count ?? 0,
      href: "/agent/daily/pretraining-documents",
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
