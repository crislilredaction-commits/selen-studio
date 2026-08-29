import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type SessionRow = {
  id: string;
  organisation_id: string;
  formation_id: string;
  internal_reference: string | null;
  registration_status: string | null;
  adaptation_needed: boolean | null;
  updated_at: string | null;
};
type FormationRow = { id: string; title: string; status: string; updated_at: string | null };
type OrganisationRow = { id: string; name: string | null; legal_name?: string | null };
type ResponseRow = { id: string; session_id: string; created_at: string | null };
type Intervention = { id: string; title: string; organisation: string; reason: string; detail: string; href: string; updatedAt: string | null; tone: "program" | "registration" | "adaptation" };

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Date inconnue";
}

export default async function AgentDailyPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const [{ data: sessions, error: sessionError }, { data: formations, error: formationError }, { data: responses, error: responseError }] = await Promise.all([
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,registration_status,adaptation_needed,updated_at").neq("status", "archived").order("updated_at", { ascending: false }),
    admin.from("daily_formations").select("id,title,status,updated_at").neq("status", "archived"),
    admin.from("daily_registration_responses").select("id,session_id,created_at").order("created_at", { ascending: false }),
  ]);

  if (sessionError || formationError || responseError) {
    return <main style={s.page}><p style={s.error}>Impossible de charger le pilotage Daily : {sessionError?.message ?? formationError?.message ?? responseError?.message}</p></main>;
  }

  const sessionRows = (sessions ?? []) as SessionRow[];
  const formationRows = (formations ?? []) as FormationRow[];
  const responseRows = (responses ?? []) as ResponseRow[];
  const orgIds = [...new Set(sessionRows.map((row) => row.organisation_id).filter(Boolean))];
  const { data: organisations } = orgIds.length ? await admin.from("organisations").select("id,name,legal_name").in("id", orgIds) : { data: [] };

  const formationMap = new Map(formationRows.map((row) => [row.id, row]));
  const organisationMap = new Map(((organisations ?? []) as OrganisationRow[]).map((row) => [row.id, row.legal_name || row.name || "Organisme de formation"]));
  const responsesBySession = new Map<string, ResponseRow[]>();
  for (const response of responseRows) responsesBySession.set(response.session_id, [...(responsesBySession.get(response.session_id) ?? []), response]);

  const interventions: Intervention[] = [];
  for (const session of sessionRows) {
    const formation = formationMap.get(session.formation_id);
    if (!formation) continue;
    const organisation = organisationMap.get(session.organisation_id) ?? "Organisme de formation";
    const registrationResponses = responsesBySession.get(session.id) ?? [];

    if (formation.status === "review") {
      interventions.push({
        id: `program-${session.id}`,
        title: formation.title,
        organisation,
        reason: "Programme à valider",
        detail: "Le client a terminé son programme. Vérifie les informations puis valide-le ou demande une correction.",
        href: `/agent/daily/session-dossiers/${session.id}`,
        updatedAt: formation.updated_at ?? session.updated_at,
        tone: "program",
      });
      continue;
    }

    if (formation.status !== "validated" || registrationResponses.length === 0) continue;

    if (session.adaptation_needed === true) {
      interventions.push({
        id: `adaptation-${session.id}`,
        title: formation.title,
        organisation,
        reason: "Adaptation à examiner",
        detail: `${registrationResponses.length} dossier${registrationResponses.length > 1 ? "s" : ""} reçu${registrationResponses.length > 1 ? "s" : ""}. Un besoin d'adaptation demande ton intervention.`,
        href: `/agent/daily/sessions/${session.id}`,
        updatedAt: registrationResponses[0]?.created_at ?? session.updated_at,
        tone: "adaptation",
      });
      continue;
    }

    if (["to_review", "responses_received", "summary_to_review"].includes(session.registration_status ?? "")) {
      interventions.push({
        id: `registration-${session.id}`,
        title: formation.title,
        organisation,
        reason: "Dossier d'inscription à traiter",
        detail: `${registrationResponses.length} dossier${registrationResponses.length > 1 ? "s" : ""} d'inscription reçu${registrationResponses.length > 1 ? "s" : ""}. Vérifie les besoins, prérequis et positionnements.`,
        href: `/agent/daily/sessions/${session.id}`,
        updatedAt: registrationResponses[0]?.created_at ?? session.updated_at,
        tone: "registration",
      });
    }
  }

  interventions.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());

  return <main style={s.page}>
    <header style={s.header}>
      <div>
        <p style={s.eyebrow}>Selen Daily</p>
        <h1 style={s.h1}>Pilotage Daily</h1>
        <p style={s.lead}>Cette page ne montre que les dossiers qui attendent réellement une intervention de ta part. Une formation validée sans inscription reçue reste volontairement silencieuse.</p>
      </div>
      <div style={s.counter}><strong>{interventions.length}</strong><span>à traiter</span></div>
    </header>

    {interventions.length === 0 ? <SelenCard style={s.empty}>
      <div style={{ fontSize: 30 }}>✓</div>
      <SelenCardTitle>Rien ne demande ton intervention</SelenCardTitle>
      <p style={s.muted}>Les programmes déjà validés attendent les inscriptions côté client. Dès qu'un dossier arrive ou qu'une adaptation doit être examinée, il apparaîtra ici.</p>
    </SelenCard> : <section style={s.list}>
      {interventions.map((item) => <SelenCard key={item.id} style={s.card}>
        <div style={s.cardHead}>
          <div>
            <span style={{ ...s.badge, ...(item.tone === "adaptation" ? s.badgeDanger : item.tone === "registration" ? s.badgeInfo : {}) }}>{item.reason}</span>
            <SelenCardTitle>{item.title}</SelenCardTitle>
            <p style={s.org}>{item.organisation}</p>
          </div>
          <span style={s.date}>{formatDate(item.updatedAt)}</span>
        </div>
        <p style={s.detail}>{item.detail}</p>
        <div style={s.actions}>
          <Link href={item.href} style={s.primary}>Traiter maintenant →</Link>
          <Link href={`/agent/daily/session-dossiers/${item.href.split("/").pop()}/full`} style={s.secondary}>Voir la synthèse du dossier</Link>
        </div>
      </SelenCard>)}
    </section>}
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 22, alignItems: "center", marginBottom: 22 },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0 5px", fontFamily: "var(--font-display)", fontSize: 32 },
  lead: { margin: 0, maxWidth: 720, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 14 },
  counter: { minWidth: 105, display: "grid", justifyItems: "center", padding: "14px 18px", border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  list: { display: "grid", gap: 12 }, card: { padding: 18 }, cardHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" },
  badge: { display: "inline-block", marginBottom: 8, padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  badgeInfo: { background: "rgba(83,132,166,.12)", color: "var(--selen-info)" }, badgeDanger: { background: "rgba(180,78,70,.12)", color: "var(--selen-danger)" },
  org: { margin: "5px 0 0", fontSize: 12, color: "var(--selen-text3)" }, date: { fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap" },
  detail: { margin: "14px 0", maxWidth: 760, lineHeight: 1.55, fontSize: 13, color: "var(--selen-text2)" },
  actions: { display: "flex", gap: 9, flexWrap: "wrap" }, primary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, background: "var(--selen-gold2)", color: "var(--selen-bg)", textDecoration: "none", fontWeight: 800, fontSize: 13 },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 13 },
  empty: { padding: 30, textAlign: "center" }, muted: { margin: "8px auto 0", maxWidth: 660, lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13 }, error: { color: "var(--selen-danger)" },
};