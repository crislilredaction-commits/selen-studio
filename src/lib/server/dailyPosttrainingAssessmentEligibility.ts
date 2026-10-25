import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

/** La page Satisfaction ne charge pas les résultats d'évaluation : elle reçoit seulement les IDs éligibles. */
export async function getFinalizedDailyAssessmentEnrolmentIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organisationId: string,
  sessionId: string,
): Promise<Set<string>> {
  const { data, error } = await admin.from("daily_learning_assessments")
    .select("enrolment_id,outcome")
    .eq("organisation_id", organisationId).eq("session_id", sessionId);
  if (error) throw new Error("Lecture des évaluations finalisées indisponible.");
  return new Set((data ?? [])
    .filter((row) => row.outcome !== "pending")
    .map((row) => row.enrolment_id));
}
