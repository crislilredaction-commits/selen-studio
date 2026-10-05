import { projectCandidatureSummary } from "../daily/candidatureSummary";
type Admin = any;
export type CandidatureFollowup = {
    requestId: string;
    applicant: string;
    analyzedAt: string;
    learners: Array<{
        enrolmentId: string;
        name: string;
        email: string;
    }>;
    sections: Array<{
        key: string;
        label: string;
        value: string;
    }>;
};
const value = (v: unknown) => typeof v === "string" ? v.trim() : "";
async function readAll(query: () => any) {
    const rows: any[] = [];
    for (let offset = 0;; offset += 200) {
        const { data, error } = await query().range(offset, offset + 199);
        if (error)
            throw new Error("Lecture des synthèses de candidature indisponible.");
        rows.push(...(data ?? []));
        if ((data ?? []).length < 200)
            return rows;
    }
}
// The caller authorizes the OF first. Every link is checked again, without copying
// the analysis into a second table or exposing the raw dossier to the browser.
export async function loadDailyCandidatureFollowup(admin: Admin, organisationId: string, sessionId: string): Promise<CandidatureFollowup[]> {
    const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,formation_id")
        .eq("id", sessionId).eq("organisation_id", organisationId).maybeSingle();
    if (sessionError)
        throw new Error("Lecture de la session indisponible.");
    if (!session?.formation_id)
        throw new Error("Session introuvable.");
    const { data: formation, error: formationError } = await admin.from("daily_formations").select("id,organisation_id")
        .eq("id", session.formation_id).eq("organisation_id", organisationId).maybeSingle();
    if (formationError)
        throw new Error("Lecture de la formation indisponible.");
    if (!formation)
        throw new Error("Session introuvable.");
    const enrolments = (await readAll(() => admin.from("daily_session_enrolments").select("id,learner_id,status")
        .eq("organisation_id", organisationId).eq("session_id", sessionId).order("id")))
        .filter(row => !["cancelled", "declined", "abandoned"].includes(row.status));
    if (!enrolments.length)
        return [];
    const [learners, mappings] = await Promise.all([
        readAll(() => admin.from("daily_learners").select("id,first_name,last_name,email").eq("organisation_id", organisationId).in("id", [...new Set(enrolments.map(row => row.learner_id))]).order("id")),
        readAll(() => admin.from("daily_registration_request_enrolments").select("registration_request_id,enrolment_id,learner_id,participant_index").in("enrolment_id", enrolments.map(row => row.id)).order("registration_request_id").order("participant_index")),
    ]);
    const byLearner = new Map(learners.map(row => [row.id, row]));
    const byEnrolment = new Map(enrolments.map(row => [row.id, row]));
    const bound = mappings.filter(row => byEnrolment.get(row.enrolment_id)?.learner_id === row.learner_id && byLearner.has(row.learner_id));
    if (!bound.length)
        return [];
    const requests = await readAll(() => admin.from("daily_formation_registration_requests")
        .select("id,company_name,agent_analysis_summary,agent_analysis_completed_at,submitted_at,decision_status")
        .eq("formation_id", formation.id).eq("attached_session_id", sessionId).eq("decision_status", "accepted")
        .in("id", [...new Set(bound.map(row => row.registration_request_id))]).order("id"));
    return requests.flatMap(request => {
        const people = [...new Map(bound.filter(row => row.registration_request_id === request.id).map(row => {
                const person = byLearner.get(row.learner_id)!;
                return [row.enrolment_id, { enrolmentId: row.enrolment_id, name: [value(person.first_name), value(person.last_name)].filter(Boolean).join(" ") || "Apprenant", email: value(person.email) }];
            })).values()];
        const projected = projectCandidatureSummary({ ...request, applicant_label: value(request.company_name) || people.map(person => person.name).join(", ") });
        return projected.available ? [{ requestId: request.id, applicant: projected.applicant, analyzedAt: projected.analyzedAt, learners: people, sections: projected.sections }] : [];
    });
}
