export async function loadDailyPretrainingPreparation(admin: any, sessionId: string, organisationIds: string[]) {
  const { data: session, error } = await admin.from("daily_sessions")
    .select("id,organisation_id,status,companies")
    .eq("id", sessionId).in("organisation_id", organisationIds).maybeSingle();
  if (error) throw new Error("Lecture de la session indisponible.");
  if (!session || ["archived", "cancelled"].includes(session.status)) return null;
  const { data, error: enrolmentError } = await admin.from("daily_session_enrolments")
    .select("id,learner_id,status,updated_at,contracting_party_type,company_name,daily_learners(organisation_id,first_name,last_name)")
    .eq("organisation_id", session.organisation_id).eq("session_id", session.id)
    .not("status", "in", "(declined,cancelled,abandoned)");
  if (enrolmentError) throw new Error("Lecture des inscriptions indisponible.");
  const companies: string[] = [...new Set<string>((Array.isArray(session.companies) ? session.companies : [])
    .map((company: any) => String(company.name ?? "").trim()).filter(Boolean))];
  const enrolments = (data ?? []).map((row: any) => {
    const learner = Array.isArray(row.daily_learners) ? row.daily_learners[0] : row.daily_learners;
    if (!learner || learner.organisation_id !== session.organisation_id) throw new Error("Rattachement apprenant incohérent.");
    const issue = !["individual", "company"].includes(row.contracting_party_type)
      ? "Choisissez qui signe : particulier ou entreprise commanditaire."
      : row.contracting_party_type === "company" && !companies.includes(String(row.company_name ?? "").trim())
        ? "Sélectionnez une entreprise commanditaire enregistrée dans la session."
        : null;
    return { id: row.id, learner_id: row.learner_id, name: [learner.first_name, learner.last_name].filter(Boolean).join(" ") || "Apprenant", updated_at: row.updated_at, contracting_party_type: row.contracting_party_type, company_name: row.company_name, issue };
  });
  return { session_id: session.id, organisation_id: session.organisation_id, companies, enrolments, ready: enrolments.length > 0 && enrolments.every((row: any) => !row.issue) };
}
