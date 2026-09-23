import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import DelegatedDocumentUpload from "./DelegatedDocumentUpload";

type Props = { params: Promise<{ id: string }> };
type Row = Record<string, unknown> & { id: string };
type Option = { id: string; label: string };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function first(row: Row, keys: string[], fallback: string) {
  for (const key of keys) { const value = text(row[key]); if (value) return value; }
  return fallback;
}
function options(rows: Row[], keys: string[], fallback: string) {
  return rows.map((row) => ({ id: row.id, label: first(row, keys, fallback) }));
}
function learnerLabel(row: Row) {
  const fullName = [text(row.first_name), text(row.last_name)].filter(Boolean).join(" ");
  return fullName || text(row.email) || "Apprenant";
}
function enrolmentOptions(rows: Row[], learners: Row[], sessions: Row[]): Option[] {
  const learnerById = new Map(learners.map((row) => [row.id, learnerLabel(row)]));
  const sessionById = new Map(sessions.map((row) => [row.id, first(row, ["internal_reference"], "Session")]));
  return rows.map((row) => {
    const learner = learnerById.get(text(row.learner_id)) || "Apprenant";
    const session = sessionById.get(text(row.session_id)) || "Session";
    return { id: row.id, label: `${learner} — ${session}` };
  });
}

export default async function ImportDocumentPage({ params }: Props) {
  const auth = await requireSupportAgent();
  const { id } = await params;
  if (!auth.ok || !(await isDailyOrganisationInAgentScope(auth.email, id))) {
    return <main style={{padding:24}}><p>Accès refusé.</p></main>;
  }

  const admin = createSupabaseAdminClient();
  const [trainersRes, learnersRes, formationsRes, sessionsRes, enrolmentsRes] = await Promise.all([
    admin.from("daily_trainer_profiles").select("id, display_name, email").eq("organisation_id", id).order("display_name"),
    admin.from("daily_learners").select("id, first_name, last_name, email").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_formations").select("id, title, name").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_sessions").select("id, internal_reference").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_session_enrolments").select("id, learner_id, session_id, status").eq("organisation_id", id).order("created_at", { ascending: false }),
  ]);
  const failed = [trainersRes, learnersRes, formationsRes, sessionsRes, enrolmentsRes].find((result) => result.error);
  if (failed?.error) return <main style={{padding:24}}><p>Chargement des rattachements impossible : {failed.error.message}</p></main>;

  const learners = (learnersRes.data ?? []) as Row[];
  const sessions = (sessionsRes.data ?? []) as Row[];

  return <main style={{padding:"24px 28px 50px",maxWidth:1000,margin:"0 auto"}}>
    <Link href={`/agent/daily/organisations/${id}`} style={{textDecoration:"none"}}>← Retour au dossier organisme</Link>
    <div style={{marginTop:18}}><SelenCard><SelenCardTitle>Ajouter un document pour cet OF</SelenCardTitle><p style={{lineHeight:1.6,color:"var(--selen-text2)"}}>Utilise ce formulaire lorsqu’un client transmet une pièce par email ou un dossier papier numérisé. Un seul fichier est stocké dans la source Daily canonique, puis rattaché aux objets métier utiles. Les rattachements se choisissent par leur libellé : aucun UUID n’est demandé à l’agent.</p><DelegatedDocumentUpload
      organisationId={id}
      trainers={options((trainersRes.data ?? []) as Row[], ["display_name", "email"], "Formateur")}
      learners={learners.map((row) => ({ id: row.id, label: learnerLabel(row) }))}
      formations={options((formationsRes.data ?? []) as Row[], ["title", "name"], "Formation")}
      sessions={options(sessions, ["internal_reference"], "Session")}
      enrolments={enrolmentOptions((enrolmentsRes.data ?? []) as Row[], learners, sessions)}
    /></SelenCard></div>
  </main>;
}
