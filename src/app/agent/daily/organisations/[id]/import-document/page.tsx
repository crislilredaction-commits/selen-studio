import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import DelegatedDocumentUpload from "./DelegatedDocumentUpload";

type Props = { params: Promise<{ id: string }> };
type Row = Record<string, unknown> & { id: string };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function first(row: Row, keys: string[], fallback: string) {
  for (const key of keys) { const value = text(row[key]); if (value) return value; }
  return fallback;
}
function options(rows: Row[], keys: string[], fallback: string) {
  return rows.map((row) => ({ id: row.id, label: first(row, keys, fallback) }));
}

export default async function ImportDocumentPage({ params }: Props) {
  const auth = await requireSupportAgent();
  const { id } = await params;
  if (!auth.ok || !(await isDailyOrganisationInAgentScope(auth.email, id))) {
    return <main style={{padding:24}}><p>Accès refusé.</p></main>;
  }

  const admin = createSupabaseAdminClient();
  const [trainersRes, learnersRes, formationsRes, sessionsRes, enrolmentsRes] = await Promise.all([
    admin.from("daily_trainer_profiles").select("*").eq("organisation_id", id).order("display_name"),
    admin.from("daily_learners").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_formations").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_sessions").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_session_enrolments").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
  ]);
  const failed = [trainersRes, learnersRes, formationsRes, sessionsRes, enrolmentsRes].find((result) => result.error);
  if (failed?.error) return <main style={{padding:24}}><p>Chargement des rattachements impossible : {failed.error.message}</p></main>;

  return <main style={{padding:"24px 28px 50px",maxWidth:1000,margin:"0 auto"}}>
    <Link href={`/agent/daily/organisations/${id}`} style={{textDecoration:"none"}}>← Retour au dossier organisme</Link>
    <div style={{marginTop:18}}><SelenCard><SelenCardTitle>Importer un document en délégation</SelenCardTitle><p style={{lineHeight:1.6,color:"var(--selen-text2)"}}>Utilise ce formulaire lorsqu’un client transmet une pièce par email ou un dossier papier numérisé. Un seul fichier est stocké dans la source Daily canonique, puis rattaché aux objets métier utiles. Les rattachements se choisissent par leur libellé : aucun UUID n’est demandé à l’agent.</p><DelegatedDocumentUpload
      organisationId={id}
      trainers={options((trainersRes.data ?? []) as Row[], ["display_name", "email"], "Formateur")}
      learners={options((learnersRes.data ?? []) as Row[], ["full_name", "display_name", "email"], "Apprenant")}
      formations={options((formationsRes.data ?? []) as Row[], ["title", "name"], "Formation")}
      sessions={options((sessionsRes.data ?? []) as Row[], ["title", "name", "label"], "Session")}
      enrolments={options((enrolmentsRes.data ?? []) as Row[], ["learner_name", "learner_email", "status"], "Inscription")}
    /></SelenCard></div>
  </main>;
}
