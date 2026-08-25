import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

function parisDateString(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDay(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }).format(date);
}

function overlaps(day: string, start: string | null, end: string | null) {
  if (!start) return false;
  const last = end || start;
  return day >= start && day <= last;
}

function stateForSession(args: {
  today: string;
  start: string | null;
  end: string | null;
  dossierStatus: string;
  openChecklist: number;
}) {
  const { today, start, end, dossierStatus, openChecklist } = args;
  if (dossierStatus === "completed" || dossierStatus === "archived") return "Clôturée";
  if (!start) return "Dates à vérifier";
  const last = end || start;
  if (today > last) return "À clôturer";
  if (today >= start && today <= last) return "En cours";
  if (today < start && openChecklist > 0) return "À préparer";
  return "Prête";
}

function stateStyle(state: string) {
  if (state === "Clôturée") return { color: "var(--selen-text3)", background: "var(--selen-bg3)" };
  if (state === "En cours") return { color: "#9dd3ff", background: "rgba(80,145,220,.12)" };
  if (state === "À clôturer") return { color: "#f0b86a", background: "rgba(240,184,106,.12)" };
  if (state === "À préparer" || state === "Dates à vérifier") return { color: "#f0c56a", background: "rgba(240,197,106,.12)" };
  return { color: "#8bd49c", background: "rgba(139,212,156,.12)" };
}

export default async function DailyPlanningPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const today = parisDateString();
  const days = Array.from({ length: 21 }, (_, index) => addDays(today, index));
  const horizonEnd = days[days.length - 1];
  const recentStart = addDays(today, -7);

  const { data: dossiers } = await admin
    .from("daily_session_dossiers")
    .select("session_id,organisation_id,status,updated_at")
    .order("updated_at", { ascending: false });

  const sessionIds = (dossiers ?? []).map((d) => d.session_id);
  const orgIds = [...new Set((dossiers ?? []).map((d) => d.organisation_id))];

  const [{ data: sessions }, { data: organisations }, { data: items }] = await Promise.all([
    sessionIds.length
      ? admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").in("id", sessionIds)
      : Promise.resolve({ data: [] }),
    orgIds.length
      ? admin.from("organisations").select("id,name").in("id", orgIds)
      : Promise.resolve({ data: [] }),
    sessionIds.length
      ? admin.from("daily_session_checklist_items").select("session_id,status").in("session_id", sessionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const formationIds = [...new Set((sessions ?? []).map((s) => s.formation_id).filter(Boolean))];
  const { data: formations } = formationIds.length
    ? await admin.from("daily_formations").select("id,title").in("id", formationIds)
    : { data: [] };

  const sessionMap = new Map((sessions ?? []).map((row) => [row.id, row]));
  const orgMap = new Map((organisations ?? []).map((row) => [row.id, row]));
  const formationMap = new Map((formations ?? []).map((row) => [row.id, row]));

  const rows = (dossiers ?? [])
    .map((dossier) => {
      const session = sessionMap.get(dossier.session_id);
      if (!session) return null;
      const last = session.end_date || session.start_date;
      if (session.start_date && session.start_date > horizonEnd) return null;
      if (last && last < recentStart && dossier.status !== "active") return null;

      const checklist = (items ?? []).filter((item) => item.session_id === dossier.session_id);
      const openChecklist = checklist.filter((item) => !["validated", "not_applicable"].includes(item.status)).length;
      const organisation = orgMap.get(dossier.organisation_id);
      const formation = session.formation_id ? formationMap.get(session.formation_id) : null;
      const state = stateForSession({
        today,
        start: session.start_date,
        end: session.end_date,
        dossierStatus: dossier.status,
        openChecklist,
      });

      return {
        sessionId: dossier.session_id,
        organisationName: organisation?.name ?? "Organisme",
        formationTitle: formation?.title ?? "Session Daily",
        reference: session.internal_reference || "Sans référence",
        start: session.start_date,
        end: session.end_date,
        openChecklist,
        state,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aStart = a?.start ?? "9999-12-31";
      const bStart = b?.start ?? "9999-12-31";
      return aStart.localeCompare(bStart) || (a?.organisationName ?? "").localeCompare(b?.organisationName ?? "", "fr");
    });

  return (
    <main style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ marginBottom: 4 }}>Planning Daily</h1>
        <p style={{ color: "var(--selen-text2)", marginTop: 0 }}>
          Vue opérationnelle des sessions à venir, en cours et récemment terminées. Chaque ligne ouvre directement le dossier de session.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
        {["À préparer", "Prête", "En cours", "À clôturer"].map((state) => (
          <SelenCard key={state}>
            <div style={{ fontSize: 12, color: "var(--selen-text3)" }}>{state}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{rows.filter((row) => row?.state === state).length}</div>
          </SelenCard>
        ))}
      </div>

      <SelenCard>
        <SelenCardTitle>21 prochains jours</SelenCardTitle>
        <div style={{ marginTop: 14, overflowX: "auto", border: "1px solid var(--selen-border)", borderRadius: 12 }}>
          <div style={{ minWidth: 1180 }}>
            <div style={{ display: "grid", gridTemplateColumns: `260px repeat(${days.length}, 44px) 140px`, background: "var(--selen-bg3)", borderBottom: "1px solid var(--selen-border)" }}>
              <div style={{ padding: "10px 12px", fontSize: 11, color: "var(--selen-text3)", position: "sticky", left: 0, zIndex: 2, background: "var(--selen-bg3)" }}>Organisme / session</div>
              {days.map((day) => (
                <div key={day} style={{ padding: "8px 2px", textAlign: "center", fontSize: 10, color: day === today ? "var(--selen-gold2)" : "var(--selen-text3)", borderLeft: "1px solid var(--selen-border)" }}>
                  {formatDay(day)}
                </div>
              ))}
              <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--selen-text3)", borderLeft: "1px solid var(--selen-border)" }}>État</div>
            </div>

            {rows.map((row) => {
              if (!row) return null;
              const style = stateStyle(row.state);
              return (
                <Link key={row.sessionId} href={`/agent/daily/session-dossiers/${row.sessionId}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "grid", gridTemplateColumns: `260px repeat(${days.length}, 44px) 140px`, borderBottom: "1px solid var(--selen-border)", minHeight: 58 }}>
                    <div style={{ padding: "9px 12px", position: "sticky", left: 0, zIndex: 1, background: "var(--selen-bg2)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{row.organisationName}</div>
                      <div style={{ fontSize: 11, color: "var(--selen-text2)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.formationTitle}</div>
                      <div style={{ fontSize: 10, color: "var(--selen-text3)", marginTop: 2 }}>{row.reference}</div>
                    </div>
                    {days.map((day) => {
                      const active = overlaps(day, row.start, row.end);
                      return (
                        <div key={day} style={{ borderLeft: "1px solid var(--selen-border)", display: "flex", alignItems: "center", justifyContent: "center", background: day === today ? "rgba(255,255,255,.025)" : undefined }}>
                          {active ? <div style={{ width: 30, height: 18, borderRadius: 6, background: style.color, opacity: 0.72 }} /> : null}
                        </div>
                      );
                    })}
                    <div style={{ borderLeft: "1px solid var(--selen-border)", padding: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                      <span style={{ ...style, borderRadius: 999, padding: "5px 8px", fontSize: 10, fontWeight: 700, width: "fit-content" }}>{row.state}</span>
                      {row.openChecklist > 0 ? <span style={{ marginTop: 4, fontSize: 10, color: "var(--selen-text3)" }}>{row.openChecklist} point(s) ouvert(s)</span> : null}
                    </div>
                  </div>
                </Link>
              );
            })}

            {rows.length === 0 ? (
              <div style={{ padding: 18, color: "var(--selen-text3)", fontSize: 13 }}>Aucune session Daily sur cette période.</div>
            ) : null}
          </div>
        </div>
      </SelenCard>
    </main>
  );
}
