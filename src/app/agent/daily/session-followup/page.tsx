import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

const typeLabels: Record<string, string> = {
  note: "Note de suivi",
  incident: "Incident / cas particulier",
  adaptation: "Adaptation",
};

const levelLabels: Record<string, string> = {
  info: "Information",
  attention: "À suivre",
  critical: "Critique",
};

function learnerName(value: unknown) {
  const learner = Array.isArray(value) ? value[0] : value;
  if (!learner || typeof learner !== "object") return "";
  const row = learner as { first_name?: string | null; last_name?: string | null; email?: string | null };
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "";
}

export default async function SessionFollowupPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const { data: entries, error } = await admin
    .from("daily_session_followup_entries")
    .select("id,session_id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,daily_sessions(id,internal_reference,start_date,end_date,daily_formations(title)),daily_session_enrolments(id,daily_learners(first_name,last_name,email))")
    .order("occurred_at", { ascending: false })
    .limit(250);

  if (error) {
    return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}><p>Impossible de charger le suivi des sessions.</p></main>;
  }

  const rows = entries ?? [];
  const operationalOpen = rows.filter((entry) => entry.entry_type !== "note" && entry.status === "open");
  const criticalOpen = operationalOpen.filter((entry) => entry.level === "critical");
  const notes = rows.filter((entry) => entry.entry_type === "note");

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ marginBottom: 4 }}>Suivi pendant les sessions</h1>
        <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
          {operationalOpen.length} situation(s) opérationnelle(s) ouverte(s) · {criticalOpen.length} critique(s) · {notes.length} note(s) consignée(s)
        </p>
      </div>

      {criticalOpen.length > 0 ? (
        <p style={{ padding: 12, border: "1px solid var(--selen-danger)", borderRadius: 12, color: "var(--selen-danger)" }}>
          {criticalOpen.length} situation(s) critique(s) nécessitent une attention prioritaire.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <SelenCard><p style={{ margin: 0, color: "var(--selen-text2)" }}>Aucun suivi de session enregistré pour le moment.</p></SelenCard>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((entry) => {
            const session = Array.isArray(entry.daily_sessions) ? entry.daily_sessions[0] : entry.daily_sessions;
            const enrolment = Array.isArray(entry.daily_session_enrolments) ? entry.daily_session_enrolments[0] : entry.daily_session_enrolments;
            const formation = Array.isArray(session?.daily_formations) ? session?.daily_formations[0] : session?.daily_formations;
            const learner = learnerName(enrolment?.daily_learners);
            const isNote = entry.entry_type === "note";
            const isOpen = !isNote && entry.status === "open";

            return (
              <SelenCard key={entry.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <SelenCardTitle>{typeLabels[entry.entry_type] ?? entry.entry_type} · {entry.summary}</SelenCardTitle>
                    <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                      {new Date(entry.occurred_at).toLocaleString("fr-FR")} · {levelLabels[entry.level] ?? entry.level}
                      {isNote ? " · Consignée" : isOpen ? " · Ouverte" : " · Traitée"}
                      {learner ? ` · ${learner}` : ""}
                    </div>
                  </div>
                  {session?.id ? (
                    <Link href={`/agent/daily/session-dossiers/${session.id}`} style={{ color: "var(--selen-gold2)", fontWeight: 700, textDecoration: "none" }}>
                      Ouvrir le dossier
                    </Link>
                  ) : null}
                </div>
                <p style={{ fontSize: 13, marginBottom: entry.action_taken ? 8 : 0 }}>
                  <strong>{formation?.title ?? session?.internal_reference ?? "Session Daily"}</strong>
                  {session?.start_date ? ` · ${new Date(`${session.start_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}
                  {session?.end_date && session.end_date !== session.start_date ? ` → ${new Date(`${session.end_date}T12:00:00`).toLocaleDateString("fr-FR")}` : ""}
                </p>
                {entry.description ? <p style={{ fontSize: 13 }}>{entry.description}</p> : null}
                {entry.action_taken ? <p style={{ fontSize: 13 }}><strong>Action réalisée :</strong> {entry.action_taken}</p> : null}
              </SelenCard>
            );
          })}
        </div>
      )}
    </main>
  );
}
