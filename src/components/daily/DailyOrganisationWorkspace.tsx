import Link from "next/link";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { loadDailyOrganisationWorkspace, isPrivateDailyOrganisationDocument, type DailyOrganisationProgram, type DailyOrganisationDocument } from "@/lib/server/dailyStudioOrganisationDocuments";

const editableStatuses = new Set(["draft", "review", "correction_requested"]);
const statusLabels: Record<string, string> = { draft: "Brouillon", review: "À valider", correction_requested: "Correction demandée", validated: "Validé", to_check: "À vérifier", active: "Actif", published: "Publié", signed: "Signé" };
const documentLabels: Record<string, string> = {
  insee_notice: "Avis INSEE", qualiopi_certificate: "Certificat Qualiopi", bpf: "NDA / BPF", organisation_logo: "Logo de l’organisme",
  training_program_source: "Programme transmis par le client", positioning_questionnaire_source: "Questionnaire de positionnement original",
  trainer_cv: "CV formateur", trainer_contract: "Contrat formateur", trainer_qualification_proof: "Justificatif formateur",
  trainer_training_attestation: "Attestation de formation du formateur", delegated_upload: "Document déposé en délégation",
  positioning_application_evidence: "Positionnement rempli", positioning_evidence: "Positionnement rempli",
  prerequisite_evidence: "Justificatif de prérequis", organisation_shared: "Document partagé par l’organisme",
};
const linkStyle = { color: "var(--selen-gold)", fontWeight: 700, fontSize: 13 };
const mutedStyle = { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.6 };

export default async function DailyOrganisationWorkspace({ organisationId, email, kind }: { organisationId: string; email: string; kind: "programs" | "documents" }) {
  let rows: Array<DailyOrganisationProgram | DailyOrganisationDocument>;
  try { rows = await loadDailyOrganisationWorkspace(createSupabaseAdminClient(), email, organisationId, kind); }
  catch { return <SelenCard><p role="alert">Chargement impossible. Vérifie ton accès à cet organisme, puis réessaie.</p></SelenCard>; }

  if (kind === "programs") return <section style={{ display: "grid", gap: 14 }} aria-label="Programmes de formation">
    <SelenCard><SelenCardTitle>Programmes de formation</SelenCardTitle><p style={mutedStyle}>Ouvre le programme pour le modifier, consulter le positionnement et l’évaluation, puis l’enregistrer ou le valider. Les programmes restent accessibles ici, même sans session ou après validation.</p></SelenCard>
    {rows.length === 0 ? <SelenCard><p style={mutedStyle}>Aucun programme enregistré pour cet organisme.</p></SelenCard> : (rows as DailyOrganisationProgram[]).map(program => <SelenCard key={program.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div><SelenCardTitle>{program.title || "Programme sans intitulé"}</SelenCardTitle><p style={mutedStyle}>Version {program.version || 1}{program.duration_hours ? ` · ${program.duration_hours} h` : ""}</p></div>
        <SelenBadge variant={program.status === "validated" ? "success" : "warn"}>{statusLabels[program.status] || program.status}</SelenBadge>
        <Link href={`/agent/daily/formations/${program.id}`} style={linkStyle}>{editableStatuses.has(program.status) ? "Modifier et valider le programme →" : "Consulter le programme →"}</Link>
      </div>
    </SelenCard>)}
  </section>;

  const documents = (rows as DailyOrganisationDocument[]).filter(isPrivateDailyOrganisationDocument);
  return <section style={{ display: "grid", gap: 14 }} aria-label="Documents client">
    <SelenCard><SelenCardTitle>Documents client</SelenCardTitle><p style={mutedStyle}>Retrouve les fichiers déposés dans l’espace Daily : pièces de l’organisme, programmes originaux, questionnaires, justificatifs et pièces des formateurs. Le bouton ouvre le fichier d’origine.</p><div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}><Link href={`/agent/daily/organisations/${organisationId}/onboarding-documents`} style={linkStyle}>Pièces de paramétrage</Link><Link href={`/agent/daily/organisations/${organisationId}/trainer-certification-proofs`} style={linkStyle}>Justificatifs formateurs</Link></div></SelenCard>
    {documents.length === 0 ? <SelenCard><p style={mutedStyle}>Aucun fichier courant déposé pour cet organisme. Les pièces de paramétrage antérieures restent accessibles ci-dessus.</p></SelenCard> : documents.map(document => <SelenCard key={document.id}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div><SelenCardTitle>{String(document.metadata?.original_filename || document.logical_name || "Document client")}</SelenCardTitle><p style={mutedStyle}>{documentLabels[document.document_type] || "Document client"} · v{document.version || 1}{document.created_at ? ` · déposé le ${new Date(document.created_at).toLocaleDateString("fr-FR")}` : ""}</p></div>
        <SelenBadge variant="neutral">{statusLabels[document.status] || document.status}</SelenBadge>
        <a href={`/agent/api/daily/documents/${document.id}`} target="_blank" rel="noreferrer noopener" style={linkStyle}>Ouvrir le document</a>
      </div>
    </SelenCard>)}
  </section>;
}
