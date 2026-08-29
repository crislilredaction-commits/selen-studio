import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { getDailySessionPhase, phaseLabel } from "@/lib/daily/sessionPhase";

const taskLabels: Record<string, string> = {
  training_ready: "Vérifier et valider le programme",
  trainer_assignment: "Vérifier l'affectation du formateur",
  participants_ready: "Vérifier les participants et leurs besoins",
  schedule_location: "Contrôler les dates, horaires et le lieu",
  pretraining_documents: "Préparer les documents avant formation",
  attendance_followup: "Suivre l'émargement et le déroulement",
  end_evaluations: "Contrôler les évaluations de fin",
  posttraining_documents: "Préparer les documents de fin de formation",
  quality_analysis_review: "Relire l'analyse qualité de la session",
  selen_closure_review: "Clôturer le dossier de session",
};

const phaseOrder = { during: 0, before: 1, after: 2 } as const;

export default async function SessionDossiersPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const { data: dossiers } = await admin
    .from("daily_session_dossiers")
    .select("session_id,organisation_id,status,assigned_agent_profile_id,completed_at,updated_at")
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  const sessionIds = (dossiers ?? []).map((row) => row.session_id);
  const orgIds = [...new Set((dossiers ?? []).map((row) => row.organisation_id))];

  const [{ data: sessions }, { data: organisations }, { data: items }, { data: agents }] = await Promise.all([
    sessionIds.length
      ? admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").in("id", sessionIds)
      : Promise.resolve({ data: [] }),
    orgIds.length
      ? admin.from("organisations").select("id,name").in("id", orgIds)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? admin.from("daily_session_checklist_items").select("session_id,item_key,phase,status").in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),
    admin.from("agent_profiles").select("id,first_name,last_name,email").eq("is_active", true),
  ]);

  const formationIds = [...new Set((sessions ?? []).map((row) => row.formation_id).filter(Boolean))];
  const { data: formations } = formationIds.length
    ? await admin.from("daily_formations").select("id,title").in("id", formationIds)
    : { data: [] };

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
  const sessionMap = byId((sessions ?? []) as Array<{ id: string; formation_id: string; internal_reference: string | null; start_date: string | null; end_date: string | null; status: string }>);
  const orgMap = byId((organisations ?? []) as Array<{ id: string; name: string }>);
  const formationMap = byId((formations ?? []) as Array<{ id: string; title: string }>);
  const agentMap = byId((agents ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string }>);

  const rows = (dossiers ?? [])
    .map((dossier) => {
      const session = sessionMap.get(dossier.session_id);
      const currentPhase = getDailySessionPhase(session ?? {});
      const openTasks = (items ?? []).filter(
        (item) =>
          item.session_id === dossier.session_id &&
          item.phase === currentPhase &&
          !["validated", "not_applicable"].includes(item.status),
      );
      return { dossier, session, currentPhase, openTasks };
    })
    .filter((row) => row.openTasks.length > 0 || row.dossier.status === "active")
    .sort((a, b) => {
      const phaseDiff = phaseOrder[a.currentPhase] - phaseOrder[b.currentPhase];
      if (phaseDiff) return phaseDiff;
      const aDate = a.currentPhase === "after" ? a.session?.end_date : a.session?.start_date;
      const bDate = b.currentPhase === "after" ? b.session?.end_date : b.session?.start_date;
      return String(aDate ?? "9999-12-31").localeCompare(String(bDate ?? "9999-12-31"));
    });

  const totalTasks = rows.reduce((sum, row) => sum + row.openTasks.length, 0);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.kicker}>Selen Daily</p>
          <h1 style={s.h1}>Tâches agent</h1>
          <p style={s.muted}>Ici, tu ne vois que les actions à réaliser. La checklist technique reste en arrière-plan et n'encombre plus ton pilotage.</p>
        </div>
        <div style={s.counter}><strong>{totalTasks}</strong><span>tâche{totalTasks > 1 ? "s" : ""} à traiter</span></div>
      </header>

      <div style={s.list}>
        {rows.map(({ dossier, session, currentPhase, openTasks }) => {
          const org = orgMap.get(dossier.organisation_id);
          const formation = session ? formationMap.get(session.formation_id) : null;
          const agent = dossier.assigned_agent_profile_id ? agentMap.get(dossier.assigned_agent_profile_id) : null;
          const agentName = agent ? `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || agent.email : "Non assigné";

          return (
            <SelenCard key={dossier.session_id} style={s.card}>
              <div style={s.cardHead}>
                <div>
                  <SelenCardTitle>{formation?.title ?? "Session Daily"}</SelenCardTitle>
                  <p style={s.meta}>{org?.name ?? "OF"} · {session?.internal_reference || "Sans référence"} · {phaseLabel(currentPhase)}</p>
                </div>
                <span style={s.agentBadge}>{agentName}</span>
              </div>

              {openTasks.length > 0 ? (
                <div style={s.tasks}>
                  {openTasks.map((task) => (
                    <div key={task.item_key} style={s.taskRow}>
                      <span style={s.dot} />
                      <span>{taskLabels[task.item_key] ?? task.item_key.replaceAll("_", " ")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={s.done}>Aucune action immédiate sur cette session.</p>
              )}

              <div style={s.actions}>
                <Link href={`/agent/daily/session-dossiers/${dossier.session_id}`} style={s.primaryLink}>
                  Traiter cette session →
                </Link>
                <Link href={`/agent/daily/session-dossiers/${dossier.session_id}/followup`} style={s.secondaryLink}>
                  Fiche de suivi
                </Link>
                <Link href={`/agent/daily/session-dossiers/${dossier.session_id}/closure`} style={s.secondaryLink}>
                  Clôture
                </Link>
              </div>
            </SelenCard>
          );
        })}

        {rows.length === 0 ? <SelenCard>Aucune tâche agent pour le moment.</SelenCard> : null}
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "28px 28px 70px" },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", marginBottom: 18, flexWrap: "wrap" },
  kicker: { margin: 0, color: "var(--selen-gold2)", fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".16em" },
  h1: { margin: "4px 0", fontFamily: "var(--font-display)", fontSize: 31 },
  muted: { margin: "4px 0", color: "var(--selen-text2)", lineHeight: 1.55, maxWidth: 700 },
  counter: { minWidth: 120, display: "grid", justifyItems: "center", gap: 2, padding: 12, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)" },
  list: { display: "grid", gap: 12 },
  card: { padding: 18 },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" },
  meta: { margin: "5px 0 0", color: "var(--selen-text2)", fontSize: 12 },
  agentBadge: { border: "1px solid var(--selen-border)", borderRadius: 999, padding: "6px 9px", color: "var(--selen-text2)", fontSize: 11, fontWeight: 800 },
  tasks: { display: "grid", gap: 7, marginTop: 14, padding: 12, borderRadius: 10, background: "var(--selen-bg3)" },
  taskRow: { display: "flex", alignItems: "center", gap: 9, color: "var(--selen-text)", fontSize: 13 },
  dot: { width: 7, height: 7, borderRadius: 999, background: "var(--selen-gold2)", flexShrink: 0 },
  done: { color: "var(--selen-text2)", marginTop: 14 },
  actions: { marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" },
  primaryLink: { textDecoration: "none", background: "var(--selen-gold2)", color: "var(--selen-bg)", padding: "9px 12px", borderRadius: 9, fontWeight: 850, fontSize: 12 },
  secondaryLink: { textDecoration: "none", border: "1px solid var(--selen-border)", color: "var(--selen-text)", padding: "9px 12px", borderRadius: 9, fontWeight: 750, fontSize: 12 },
};
