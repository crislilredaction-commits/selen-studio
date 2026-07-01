import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import DossierTimeline, {
  statusToStepIndex,
} from "@/components/ui/DossierTimeline";
import DocumentUpload from "@/components/ui/DocumentUpload";
import DocumentsList, {
  type DocumentItem,
} from "@/components/ui/DocumentsList";
import DossierHistorique, {
  type HistoryEntry,
} from "@/components/ui/DossierHistorique";
import NdaChecklist from "@/components/nda/NdaChecklist";
import { NDA_REQUIRED_DOCUMENT_KEYS } from "@/lib/ndaChecklist";
import DocumentReviewActions from "@/components/nda/DocumentReviewActions";
import NdaPhaseValidationActions, {
  type NdaPhaseKey,
} from "@/components/nda/NdaPhaseValidationActions";
import SubmitButton from "@/components/ui/SubmitButton";
import NdaVariablesCard from "@/components/nda/NdaVariablesCard";
import NdaDepositFollowUpCard from "@/components/nda/NdaDepositFollowUpCard";
import NdaManualAnalysisTextCard from "@/components/nda/NdaManualAnalysisTextCard";
import OpenDocumentButton from "@/components/ui/OpenDocumentButton";
import DeleteDocumentButton from "@/components/ui/DeleteDocumentButton";
import AnalyzeNdaButton from "@/components/nda/AnalyzeNdaButton";
import GenerateNdaProgramButton from "@/components/nda/GenerateNdaProgramButton";
import AgentMessagingDrawer from "@/components/AgentMessagingDrawer";
import DossierAutoRefreshNotice from "@/components/agent/DossierAutoRefreshNotice";
import AnalyzeProgramButton from "@/components/program/AnalyzeProgramButton";
import AgentProgramEditor from "@/components/program/AgentProgramEditor";
import { getVitrineClientUrl } from "@/lib/vitrineLinks";
import { hasNdaProgramDocumentContent } from "@/lib/server/ndaProgramDocumentHtml";
import {
  syncNdaDossierStatus,
  type NdaWorkflowStatusTone,
} from "@/lib/server/ndaAgentWorkflow";
import {
  inferNdaDocumentReviewStatus,
  inferNdaDocumentRole,
  normalizeNdaDocumentType,
  type NdaDocumentReviewStatus,
  type NdaDocumentRole,
} from "@/lib/ndaDocumentTypes";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    ndaPhases?: string | string[];
  }>;
};

type SelenBadgeVariant = NonNullable<
  React.ComponentProps<typeof SelenBadge>["variant"]
>;

type OrganisationRow = {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  nda_number?: string | null;
  address?: string | null;
};

type AgentProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: "agent" | "admin" | string | null;
};

type AssignmentRow = {
  id: string;
  agent_id: string | null;
  is_primary: boolean;
};

type RelatedDossier = {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

type DbDocumentRow = {
  id: string;
  name: string;
  document_type: string;
  storage_path?: string | null;
  status:
    | "uploaded"
    | "validated"
    | "to_correct"
    | "generated"
    | "signed"
    | "archived";
  source: "agent_upload" | "client_upload" | "generated";
  created_at: string;
  is_visible_to_client?: boolean | null;
  document_role?: NdaDocumentRole | string | null;
  review_status?: NdaDocumentReviewStatus | string | null;
  generated_from_model?: string | null;
  version_group?: string | null;
  parent_document_id?: string | null;
  requires_client_action?: boolean | null;
  validated_at?: string | null;
  validated_by?: string | null;
  visible_to_client_at?: string | null;
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
  extracted_text?: string | null;
};

type MessageRow = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

type PreauditSessionSummary = {
  id: string;
  user_id: string;
  status: string | null;
  audit_type: string | null;
  is_new_entrant: boolean | null;
  applicable_indicators: number[] | null;
  excluded_indicators: number[] | null;
  created_at: string;
  updated_at: string | null;
};

type ReviewCaseSummary = {
  id: string;
  status: string | null;
  report_status: string | null;
  client_email: string | null;
  updated_at: string | null;
};

type NdaVariablesRow = {
  dossier_id?: string | null;
  organisation_id?: string | null;
  formateur_nom?: string | null;
  formateur_prenom?: string | null;
  formateur_email?: string | null;
  intitule_formation?: string | null;
  duree_formation?: string | null;
  modalite?: string | null;
  nb_formateurs?: number | string | null;
  ville?: string | null;
  code_postal?: string | null;
  region?: string | null;
  siret?: string | null;
  representant_prenom?: string | null;
  representant_nom?: string | null;
  tarif_formation?: string | number | null;
  prerequis_formation?: string | null;
  organisme_adresse?: string | null;
  stagiaire_prenom?: string | null;
  stagiaire_nom?: string | null;
  stagiaire_adresse?: string | null;
  stagiaire_email?: string | null;
  stagiaire_telephone?: string | null;
  stagiaire_fonction?: string | null;
  client_nom?: string | null;
  client_adresse?: string | null;
  client_representant_prenom?: string | null;
  client_representant_nom?: string | null;
  client_siret?: string | null;
  date_formation_prevue?: string | null;
  date_fin_formation?: string | null;
  lieu_formation?: string | null;
  lieu_signature_convention?: string | null;
  date_signature_convention?: string | null;
  liste_formateurs_internes?: unknown;
  liste_formateurs_soustraitants?: unknown;
  liste_formateurs_dirigeant_resume?: string | null;
  liste_formateurs_fait_a?: string | null;
  liste_formateurs_date_signature?: string | null;
  liste_formateurs_nom_signataire?: string | null;
  liste_formateurs_qualite_signataire?: string | null;
  nda_phase_validations?: unknown;
  nda_deposit_specific_code?: string | null;
  nda_deposit_specific_code_label?: string | null;
  nda_deposit_status?: string | null;
  nda_deposit_submitted_at?: string | null;
  nda_deposit_refusal_received_at?: string | null;
  nda_obtained_at?: string | null;
  cv_manual_text?: string | null;
  program_manual_text?: string | null;
};

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    nda: "NDA",
    review: "Review",
    prepa: "Prépa",
    daily: "Daily",
    non_conformite: "Non-conformité",
    audit_blanc: "Review",
    mise_en_conformite: "Prépa",
    audit_reel: "Prépa",
    preaudit: "Préaudit",
  };
  return map[type] ?? type;
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Brouillon",
    waiting_client: "En attente client",
    assignable: "À assigner",
    assigned: "Assigné",
    in_progress: "En cours",
    generated: "Généré",
    collecting_documents: "Collecte documents",
    under_review: "En vérification",
    to_complete: "À compléter",
    compliant: "Conforme",
    archived: "Archivé",
  };
  return map[status] ?? status;
}

function getStatusBadgeVariant(status: string): SelenBadgeVariant {
  if (status === "compliant" || status === "generated") return "success";
  if (status === "waiting_client" || status === "to_complete") return "warn";
  if (status === "in_progress" || status === "collecting_documents")
    return "info";
  if (status === "archived") return "neutral";
  return "status";
}

function isPreauditDossierType(type: string) {
  return type === "preaudit";
}

function isReviewDossierType(type: string) {
  return type === "review" || type === "audit_blanc";
}

function formatReviewStatus(
  status?: string | null,
  reportStatus?: string | null,
) {
  if (reportStatus === "sent") return "Rapport envoyé";
  if (status === "report_ready") return "Rapport prêt";
  if (status) return getStatusLabel(status);
  return "—";
}

function formatReviewReportStatus(status?: string | null) {
  if (status === "not_started") return "Non commencé";
  if (status === "draft") return "Brouillon";
  if (status === "ready") return "Rapport prêt";
  if (status === "sent") return "Envoyé au client";
  return status ?? "—";
}

function mapDbDocumentToItem(doc: DbDocumentRow): DocumentItem {
  let fileType: "pdf" | "doc" | "other" = "other";

  const lower = doc.name.toLowerCase();
  if (lower.endsWith(".pdf")) fileType = "pdf";
  else if (
    lower.endsWith(".doc") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".pages")
  ) {
    fileType = "doc";
  }

  let status: "ok" | "pending" | "missing" = "pending";

  if (
    doc.status === "uploaded" ||
    doc.status === "validated" ||
    doc.status === "signed" ||
    doc.status === "generated"
  ) {
    status = "ok";
  } else if (doc.status === "to_correct") {
    status = "pending";
  } else if (doc.status === "archived") {
    status = "missing";
  }

  return {
    id: doc.id,
    name: doc.name,
    meta: `${doc.document_type} · ${new Date(doc.created_at).toLocaleDateString("fr-FR")}`,
    fileType,
    status,
  };
}

function getDocumentRoleLabel(role: NdaDocumentRole) {
  const labels: Record<NdaDocumentRole, string> = {
    initial_client_document: "Document initial client",
    agent_uploaded_document: "Document agent",
    generated_document: "Document préparé",
    client_to_complete: "À compléter par le client",
    client_returned_document: "Retour client",
    supporting_evidence: "Pièce justificative",
    internal_working_file: "Interne agent",
    final_validated_file: "Dossier final validé",
    maf_procedure: "Procédure MAF",
    dreets_complement_request: "Demande complémentaire DREETS",
    dreets_refusal_letter: "Lettre de refus DREETS",
    corrected_after_refusal: "Dossier corrigé après refus",
  };

  return labels[role];
}

function getDocumentReviewStatusLabel(status: NdaDocumentReviewStatus) {
  const labels: Record<NdaDocumentReviewStatus, string> = {
    not_reviewed: "À vérifier",
    pending_client: "En attente client",
    received: "Reçu",
    to_correct: "À corriger",
    validated: "Validé",
    rejected: "Refusé",
    archived: "Archivé",
    superseded: "Remplacé",
  };

  return labels[status];
}

function getDocumentWorkflowMeta(doc: DbDocumentRow) {
  const role = inferNdaDocumentRole({
    documentRole: doc.document_role,
    source: doc.source,
  });
  const reviewStatus = inferNdaDocumentReviewStatus({
    reviewStatus: doc.review_status,
    status: doc.status,
    source: doc.source,
  });
  const visibility = doc.is_visible_to_client
    ? "visible client"
    : "interne Studio";

  return `${getDocumentRoleLabel(role)} · ${getDocumentReviewStatusLabel(
    reviewStatus,
  )} · ${visibility}`;
}

const NDA_AGENT_WORKFLOW_STEPS = [
  { label: "Dépôt\ninitial" },
  { label: "Analyse\nprogramme" },
  { label: "Documents\nà signer" },
  { label: "Retour\nclient" },
  { label: "Dépôt\nNDA" },
];

const NDA_FINAL_REQUIRED_DOCUMENT_TYPES = [
  "convention_signee",
  "programme_formation_signe",
  "diplomes_formateur_principal",
  "casier_judiciaire_n3",
  "statut_activite_formation_adulte",
];

const NDA_FINAL_OPTIONAL_DOCUMENT_TYPES = ["liste_formateurs_signee"];

const NDA_FINAL_DOCUMENT_LABELS: Record<string, string> = {
  convention_signee: "Convention de formation signée",
  programme_formation_signe: "Programme de formation signé",
  diplomes_formateur_principal:
    "Copies des diplômes / attestations de formation",
  casier_judiciaire_n3: "Casier judiciaire n°3",
  statut_activite_formation_adulte:
    "Justificatif / statut activité de formation adulte",
  liste_formateurs_signee: "Liste des formateurs signée",
};

const NDA_INITIAL_RECEPTION_DOCUMENT_TYPES = [
  "cv_formateur",
  "programme_formation",
  "avis_insee",
  "kbis",
];

function getNdaFinalDocumentLabel(documentType: string) {
  return NDA_FINAL_DOCUMENT_LABELS[documentType] ?? documentType;
}

function isNdaInitialReceptionDocument(doc: DbDocumentRow) {
  return NDA_INITIAL_RECEPTION_DOCUMENT_TYPES.includes(
    normalizeNdaDocumentType(doc.document_type),
  );
}

function isNdaFinalReturnedDocument(doc: DbDocumentRow) {
  const role = inferNdaDocumentRole({
    documentRole: doc.document_role,
    source: doc.source,
  });
  const documentType = normalizeNdaDocumentType(doc.document_type);

  return (
    ["client_returned_document", "agent_uploaded_document", "final_validated_file"].includes(role) &&
    [
      ...NDA_FINAL_REQUIRED_DOCUMENT_TYPES,
      ...NDA_FINAL_OPTIONAL_DOCUMENT_TYPES,
    ].includes(documentType)
  );
}

function isNdaGeneratedSigningDocument(doc: DbDocumentRow) {
  const documentType = normalizeNdaDocumentType(doc.document_type);

  return (
    doc.document_role === "client_to_complete" &&
    doc.review_status === "pending_client" &&
    doc.is_visible_to_client === true &&
    doc.requires_client_action === true &&
    [
      "programme_formation",
      "convention_formation",
      "liste_formateurs",
    ].includes(documentType)
  );
}

function hasNdaRequiredVariables(variables: NdaVariablesRow | null) {
  if (!variables) return false;

  return Boolean(
    variables.client_nom &&
    variables.client_adresse &&
    variables.client_representant_prenom &&
    variables.client_representant_nom &&
    (variables.stagiaire_prenom || variables.stagiaire_nom) &&
    variables.stagiaire_fonction &&
    variables.intitule_formation &&
    variables.duree_formation &&
    variables.modalite &&
    variables.date_formation_prevue &&
    variables.date_fin_formation &&
    variables.lieu_formation &&
    variables.tarif_formation &&
    variables.lieu_signature_convention &&
    variables.date_signature_convention,
  );
}

function getNdaAgentWorkflowState(args: {
  initialDepositComplete: boolean;
  programReady: boolean;
  programPendingClientDecision: boolean;
  programRefusedByClient: boolean;
  programValidatedByClient: boolean;
  variablesReady: boolean;
  signingDocumentsGenerated: boolean;
  finalReturnedDocuments: DbDocumentRow[];
  missingFinalRequiredTypes: string[];
}) {
  const requiredFinalDocuments = args.finalReturnedDocuments.filter((doc) =>
    NDA_FINAL_REQUIRED_DOCUMENT_TYPES.includes(
      normalizeNdaDocumentType(doc.document_type),
    ),
  );
  const finalStatuses = requiredFinalDocuments.map((doc) =>
    inferNdaDocumentReviewStatus({
      reviewStatus: doc.review_status,
      status: doc.status,
      source: doc.source,
    }),
  );
  const hasCorrections = finalStatuses.some(
    (status) => status === "to_correct" || status === "rejected",
  );
  const allFinalReceived = args.missingFinalRequiredTypes.length === 0;
  const allFinalValidated =
    allFinalReceived &&
    requiredFinalDocuments.length >= NDA_FINAL_REQUIRED_DOCUMENT_TYPES.length &&
    finalStatuses.every((status) => status === "validated");

  if (!args.initialDepositComplete) {
    return {
      currentStep: 0,
      statusLabel: "Dépôt initial attendu",
      actionLabel: "Le client doit déposer les pièces initiales.",
      agentStatusDescription:
        "Le dossier attend encore le dépôt initial client.",
      statusTone: "info" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "collecting_documents",
    };
  }

  if (!args.programReady) {
    return {
      currentStep: 1,
      statusLabel: "Programme à analyser",
      actionLabel: "L'agent doit analyser ou préparer le programme.",
      agentStatusDescription:
        "Le dossier est côté agent pour analyse du programme.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
    };
  }

  if (args.programRefusedByClient) {
    return {
      currentStep: 1,
      statusLabel: "Correction programme a traiter",
      actionLabel: "Le client a demande une correction du programme.",
      agentStatusDescription:
        "Le client a refuse la proposition de programme. L'agent doit relire le retour et preparer une nouvelle proposition.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
    };
  }

  if (args.programPendingClientDecision) {
    return {
      currentStep: 1,
      statusLabel: "Validation programme client attendue",
      actionLabel: "Le client doit valider ou refuser le programme propose.",
      agentStatusDescription:
        "La proposition de programme a ete transmise au client et attend sa decision.",
      statusTone: "warn" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "program_sent_to_client",
    };
  }

  if (!args.programValidatedByClient) {
    return {
      currentStep: 1,
      statusLabel: "Programme a transmettre au client",
      actionLabel: "L'agent doit envoyer la proposition de programme au client.",
      agentStatusDescription:
        "Le programme est pret cote agent, mais il n'a pas encore ete valide par le client.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
    };
  }

  if (!args.variablesReady) {
    return {
      currentStep: 2,
      statusLabel: "Coordonnées client attendues",
      actionLabel: "Compléter les informations de préparation NDA.",
      agentStatusDescription:
        "Les informations client et stagiaire nécessaires sont attendues.",
      statusTone: "warn" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "waiting_client",
    };
  }

  if (!args.signingDocumentsGenerated) {
    return {
      currentStep: 3,
      statusLabel: "Documents à signer à préparer",
      actionLabel: "Préparer le pack à signer pour le client.",
      agentStatusDescription:
        "Le contexte est prêt, le pack de documents doit être préparé côté agent.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
    };
  }

  if (hasCorrections) {
    return {
      currentStep: 5,
      statusLabel: "Corrections client attendues",
      actionLabel: "Des pièces finales doivent être corrigées.",
      agentStatusDescription:
        "Au moins une pièce finale a été refusée ou marquée à corriger.",
      statusTone: "danger" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "to_complete",
    };
  }

  if (allFinalValidated) {
    return {
      currentStep: 6,
      statusLabel: "Dossier prêt pour dépôt NDA",
      actionLabel: "Toutes les pièces finales sont validées.",
      agentStatusDescription:
        "Toutes les pièces finales attendues sont reçues et validées.",
      statusTone: "success" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "compliant",
    };
  }

  if (allFinalReceived) {
    return {
      currentStep: 5,
      statusLabel: "Contrôle final agent à réaliser",
      actionLabel: "Vérifier les pièces finales retournées.",
      agentStatusDescription:
        "Toutes les pièces finales sont reçues et attendent le contrôle agent.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
    };
  }

  if (args.finalReturnedDocuments.length > 0) {
    return {
      currentStep: 4,
      statusLabel: "Documents finaux partiellement reçus",
      actionLabel: "Attendre les pièces manquantes ou relancer le client.",
      agentStatusDescription:
        "Une partie des pièces finales est reçue, mais le dossier reste incomplet.",
      statusTone: "info" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "collecting_documents",
    };
  }

  return {
    currentStep: 4,
    statusLabel: "En attente du retour signé client",
    actionLabel: "Le client doit retourner les documents signés.",
    agentStatusDescription:
      "Les documents à signer sont disponibles côté client et attendent un retour.",
    statusTone: "warn" satisfies NdaWorkflowStatusTone,
    targetDossierStatus: "waiting_client",
  };
}

function formatNdaValue(value?: string | number | null) {
  const normalized = String(value ?? "").trim();
  return normalized || "—";
}

function formatNdaDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("fr-FR");
}

function formatNdaPerson(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "—";
}

function MaybeCollapsed({
  collapsed,
  title,
  children,
}: {
  collapsed: boolean;
  title: string;
  children: React.ReactNode;
}) {
  if (!collapsed) {
    return <>{children}</>;
  }

  return (
    <details
      style={{
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-md)",
        background: "rgba(255, 248, 232, 0.42)",
        padding: 12,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--selen-gold2)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </summary>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          marginTop: 12,
        }}
      >
        {children}
      </div>
    </details>
  );
}

function getNdaWorkflowPhaseIndex(currentStep: number) {
  if (currentStep <= 0) return 0;
  if (currentStep === 1) return 1;
  if (currentStep === 2 || currentStep === 3) return 2;
  if (currentStep === 4 || currentStep === 5) return 3;
  return 4;
}

const NDA_PHASE_KEYS: NdaPhaseKey[] = [
  "initial_reception",
  "program_analysis",
  "signing_documents",
  "final_return",
  "ready_for_deposit",
];

type NdaPhaseValidationRecord = {
  validated_at?: string | null;
  validated_by?: string | null;
};

function normalizeNdaPhaseValidations(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Partial<Record<NdaPhaseKey, NdaPhaseValidationRecord>>;
  }

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    NDA_PHASE_KEYS.flatMap((key) => {
      const rawValidation = source[key];

      if (
        !rawValidation ||
        typeof rawValidation !== "object" ||
        Array.isArray(rawValidation)
      ) {
        return [];
      }

      const validation = rawValidation as Record<string, unknown>;
      return [
        [
          key,
          {
            validated_at:
              typeof validation.validated_at === "string"
                ? validation.validated_at
                : null,
            validated_by:
              typeof validation.validated_by === "string"
                ? validation.validated_by
                : null,
          },
        ],
      ];
    }),
  ) as Partial<Record<NdaPhaseKey, NdaPhaseValidationRecord>>;
}

function getActiveNdaPhaseIndexFromValidations(
  validations: Partial<Record<NdaPhaseKey, NdaPhaseValidationRecord>>,
) {
  const firstOpenPhase = NDA_PHASE_KEYS.findIndex((key) => !validations[key]);
  return firstOpenPhase === -1 ? NDA_PHASE_KEYS.length - 1 : firstOpenPhase;
}

function getNdaPhaseDisplayOrder(phaseIndex: number, activePhaseIndex: number) {
  if (phaseIndex === activePhaseIndex) return 0;
  if (phaseIndex < activePhaseIndex) return phaseIndex + 1;
  return 100 + phaseIndex;
}

function NdaWorkflowPhaseCard({
  dossierId,
  phaseKey,
  phaseIndex,
  activePhaseIndex,
  showFuturePhases = false,
  validationWarning,
  title,
  subtitle,
  children,
}: {
  dossierId: string;
  phaseKey: NdaPhaseKey;
  phaseIndex: number;
  activePhaseIndex: number;
  showFuturePhases?: boolean;
  validationWarning?: string | null;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const isActive = phaseIndex === activePhaseIndex;
  const isDone = phaseIndex < activePhaseIndex;
  const isFuture = phaseIndex > activePhaseIndex;
  const badgeLabel = isActive ? "En cours" : isDone ? "Terminé" : "À venir";
  const badgeVariant: SelenBadgeVariant = isActive
    ? "warn"
    : isDone
      ? "success"
      : "neutral";

  if (isFuture && !showFuturePhases) {
    return null;
  }

  return (
    <details
      open={isActive}
      style={{
        ...({
          "--selen-text": "var(--selen-text-oncard)",
          "--selen-text2": "var(--selen-text2-oncard)",
          "--selen-text3": "var(--selen-text3-oncard)",
          "--selen-bg3": "rgba(247, 239, 224, 0.08)",
          "--selen-border": "rgba(245, 208, 138, 0.18)",
          "--selen-border2": "rgba(245, 208, 138, 0.34)",
        } as React.CSSProperties),
        border: isActive
          ? "1px solid var(--selen-border2)"
          : "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        background: isActive
          ? "linear-gradient(180deg, rgba(255, 248, 232, 0.1), rgba(255, 248, 232, 0.04)), var(--selen-card-texture), var(--selen-card)"
          : "var(--selen-card-texture), var(--selen-card)",
        boxShadow: isActive
          ? "0 18px 44px rgba(0, 0, 0, 0.16)"
          : "0 10px 28px rgba(0, 0, 0, 0.08)",
        opacity: isFuture ? 0.72 : 1,
        overflow: "hidden",
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          cursor: "pointer",
          padding: "14px 16px",
          listStyle: "none",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--selen-gold2)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Phase {phaseIndex + 1}
          </div>
          <div
            style={{
              fontSize: 16,
              color: "var(--selen-text)",
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--selen-text3)",
              lineHeight: 1.45,
              marginTop: 4,
            }}
          >
            {subtitle}
          </div>
        </div>

        <SelenBadge variant={badgeVariant} dot>
          {badgeLabel}
        </SelenBadge>
      </summary>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "0 16px 16px",
        }}
      >
        {children}
        <NdaPhaseValidationActions
          dossierId={dossierId}
          phaseKey={phaseKey}
          isActive={isActive}
          isDone={isDone}
          warning={validationWarning}
        />
      </div>
    </details>
  );
}

const NDA_PHASE_SUMMARIES = [
  {
    title: "Réception initiale",
    subtitle:
      "CV du formateur, programme de formation et avis INSEE ou KBIS.",
  },
  {
    title: "Analyse du programme",
    subtitle: "Analyse, ajustement et validation du programme de formation.",
  },
  {
    title: "Préparation des documents à signer",
    subtitle: "Variables NDA, préparation du pack et documents à signer.",
  },
  {
    title: "Retour client et contrôle final",
    subtitle: "Documents signés retournés, pièces finales et validation agent.",
  },
  {
    title: "Dossier prêt pour dépôt",
    subtitle: "Procédure de dépôt NDA côté client.",
  },
];

function NdaFuturePhasesSummary({
  activePhaseIndex,
}: {
  activePhaseIndex: number;
}) {
  const futurePhases = NDA_PHASE_SUMMARIES.slice(activePhaseIndex + 1);

  if (!futurePhases.length) return null;

  return (
    <details
      style={{
        order: 100,
        border: "1px dashed var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        background: "rgba(120, 90, 50, 0.06)",
        padding: 12,
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          color: "var(--selen-text2)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Afficher les phases à venir
      </summary>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {futurePhases.map((phase, index) => (
          <div
            key={phase.title}
            style={{
              border: "1px solid var(--selen-border)",
              borderRadius: "var(--radius-md)",
              background: "rgba(247, 239, 224, 0.38)",
              padding: "10px 12px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--selen-gold)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Phase {activePhaseIndex + index + 2} · À venir
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--selen-text)",
                fontWeight: 700,
                marginTop: 3,
              }}
            >
              {phase.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--selen-text3)",
                lineHeight: 1.45,
                marginTop: 2,
              }}
            >
              {phase.subtitle}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function NdaPhaseOrCollapsed({
  isNdaDossier,
  dossierId,
  phaseKey,
  phaseIndex,
  activePhaseIndex,
  showFuturePhases,
  validationWarning,
  phaseTitle,
  phaseSubtitle,
  collapsed,
  title,
  children,
}: {
  isNdaDossier: boolean;
  dossierId: string;
  phaseKey: NdaPhaseKey;
  phaseIndex: number;
  activePhaseIndex: number;
  showFuturePhases: boolean;
  validationWarning?: string | null;
  phaseTitle: string;
  phaseSubtitle: string;
  collapsed: boolean;
  title: string;
  children: React.ReactNode;
}) {
  if (isNdaDossier) {
    return (
      <div
        style={{ order: getNdaPhaseDisplayOrder(phaseIndex, activePhaseIndex) }}
      >
        <NdaWorkflowPhaseCard
          dossierId={dossierId}
          phaseKey={phaseKey}
          phaseIndex={phaseIndex}
          activePhaseIndex={activePhaseIndex}
          showFuturePhases={showFuturePhases}
          validationWarning={validationWarning}
          title={phaseTitle}
          subtitle={phaseSubtitle}
        >
          {children}
        </NdaWorkflowPhaseCard>
      </div>
    );
  }

  return (
    <MaybeCollapsed collapsed={collapsed} title={title}>
      {children}
    </MaybeCollapsed>
  );
}

function NdaStep2StudioCard({
  dossierId,
  variables,
}: {
  dossierId: string;
  variables: NdaVariablesRow | null;
}) {
  const fields = [
    {
      label: "Stagiaire",
      value: formatNdaPerson(
        variables?.stagiaire_prenom,
        variables?.stagiaire_nom,
      ),
    },
    {
      label: "Email stagiaire",
      value: formatNdaValue(variables?.stagiaire_email),
    },
    {
      label: "Téléphone stagiaire",
      value: formatNdaValue(variables?.stagiaire_telephone),
    },
    {
      label: "Adresse stagiaire",
      value: formatNdaValue(variables?.stagiaire_adresse),
    },
    {
      label: "SIRET client",
      value: formatNdaValue(variables?.client_siret),
    },
    {
      label: "Date prévue",
      value: formatNdaDate(variables?.date_formation_prevue),
    },
    {
      label: "Lieu / lien",
      value: formatNdaValue(variables?.lieu_formation),
    },
    {
      label: "Formation validée",
      value: formatNdaValue(variables?.intitule_formation),
    },
    {
      label: "Durée",
      value: formatNdaValue(variables?.duree_formation),
    },
    {
      label: "Modalité",
      value: formatNdaValue(variables?.modalite),
    },
    {
      label: "Tarif",
      value: formatNdaValue(variables?.tarif_formation),
    },
  ];

  const sections = [
    {
      title: "Client professionnel",
      fields: [
        { label: "Nom client", value: formatNdaValue(variables?.client_nom) },
        {
          label: "SIRET client",
          value: formatNdaValue(variables?.client_siret),
        },
        {
          label: "Adresse client",
          value: formatNdaValue(variables?.client_adresse),
        },
        {
          label: "Representant client",
          value: formatNdaPerson(
            variables?.client_representant_prenom,
            variables?.client_representant_nom,
          ),
        },
      ],
    },
    {
      title: "Stagiaire",
      fields: [
        {
          label: "Stagiaire",
          value: formatNdaPerson(
            variables?.stagiaire_prenom,
            variables?.stagiaire_nom,
          ),
        },
        {
          label: "Fonction",
          value: formatNdaValue(variables?.stagiaire_fonction),
        },
        {
          label: "Adresse stagiaire",
          value: formatNdaValue(variables?.stagiaire_adresse),
        },
        {
          label: "Email stagiaire",
          value: formatNdaValue(variables?.stagiaire_email),
        },
        {
          label: "Telephone stagiaire",
          value: formatNdaValue(variables?.stagiaire_telephone),
        },
      ],
    },
    {
      title: "Action",
      fields: [
        {
          label: "Formation validee",
          value: formatNdaValue(variables?.intitule_formation),
        },
        { label: "Duree", value: formatNdaValue(variables?.duree_formation) },
        { label: "Modalite", value: formatNdaValue(variables?.modalite) },
        {
          label: "Date de debut",
          value: formatNdaDate(variables?.date_formation_prevue),
        },
        {
          label: "Date de fin",
          value: formatNdaDate(variables?.date_fin_formation),
        },
        {
          label: "Lieu / lien",
          value: formatNdaValue(variables?.lieu_formation),
        },
        {
          label: "Tarif TTC",
          value: formatNdaValue(variables?.tarif_formation),
        },
      ],
    },
    {
      title: "Convention",
      fields: [
        {
          label: "Lieu de signature",
          value: formatNdaValue(variables?.lieu_signature_convention),
        },
        {
          label: "Date de signature",
          value: formatNdaDate(variables?.date_signature_convention),
        },
      ],
    },
  ];

  const isConventionContextIncomplete =
    !variables?.client_nom ||
    !variables?.client_adresse ||
    !variables?.client_representant_prenom ||
    !variables?.client_representant_nom ||
    !variables?.client_siret ||
    !variables?.stagiaire_fonction ||
    !variables?.date_formation_prevue ||
    !variables?.date_fin_formation ||
    !variables?.lieu_formation ||
    !variables?.tarif_formation ||
    !variables?.lieu_signature_convention ||
    !variables?.date_signature_convention;

  return (
    <SelenCard>
      <SelenCardTitle>
        Premier client / première action de formation
      </SelenCardTitle>

      <p
        style={{
          fontSize: 13,
          color: "var(--selen-text3)",
          lineHeight: 1.55,
          margin: "0 0 14px",
        }}
      >
        Le programme a été validé par le client. Cette section regroupe les
        informations utiles pour préparer la suite du dossier NDA.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        {sections.map((section) => (
          <section key={section.title}>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 13,
                color: "var(--selen-gold2)",
                marginBottom: 10,
              }}
            >
              {section.title}
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 10,
              }}
            >
              {section.fields.map((field) => (
                <div
                  key={`${section.title}-${field.label}`}
                  style={{
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--selen-bg3)",
                    padding: "10px 12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--selen-text3)",
                      marginBottom: 5,
                    }}
                  >
                    {field.label}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color:
                        field.value === "â€”"
                          ? "var(--selen-text3)"
                          : "var(--selen-text)",
                      fontWeight: field.value === "â€”" ? 400 : 600,
                      lineHeight: 1.35,
                    }}
                  >
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
        }}
      >
        {false &&
          fields.map((field) => (
            <div
              key={field.label}
              style={{
                border: "1px solid var(--selen-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--selen-bg3)",
                padding: "10px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--selen-text3)",
                  marginBottom: 5,
                }}
              >
                {field.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color:
                    field.value === "—"
                      ? "var(--selen-text3)"
                      : "var(--selen-text)",
                  fontWeight: field.value === "—" ? 400 : 600,
                  lineHeight: 1.35,
                }}
              >
                {field.value}
              </div>
            </div>
          ))}
      </div>

      {isConventionContextIncomplete ? (
        <p
          style={{
            fontSize: 12,
            color: "var(--selen-warning)",
            margin: "14px 0 0",
            lineHeight: 1.5,
          }}
        >
          Certaines informations nécessaires à la préparation sont manquantes.
        </p>
      ) : null}

      <GenerateNdaProgramButton dossierId={dossierId} />
    </SelenCard>
  );
}

function extractPostalCodeAndCity(address?: string | null) {
  if (!address) {
    return { code_postal: "", ville: "" };
  }

  const match = address.match(/\b(\d{5})\b\s*-?\s*([A-Za-zÀ-ÿ' -]+)$/);

  if (!match) {
    return { code_postal: "", ville: "" };
  }

  return {
    code_postal: match[1] ?? "",
    ville: match[2]?.trim() ?? "",
  };
}

function getRegionFromPostalCode(codePostal?: string | null) {
  if (!codePostal || codePostal.length < 2) return "";

  const dept = codePostal.slice(0, 2);

  const regionMap: Record<string, string> = {
    "01": "Auvergne-Rhône-Alpes",
    "02": "Hauts-de-France",
    "03": "Auvergne-Rhône-Alpes",
    "04": "Provence-Alpes-Côte d’Azur",
    "05": "Provence-Alpes-Côte d’Azur",
    "06": "Provence-Alpes-Côte d’Azur",
    "07": "Auvergne-Rhône-Alpes",
    "08": "Grand Est",
    "09": "Occitanie",
    "10": "Grand Est",
    "11": "Occitanie",
    "12": "Occitanie",
    "13": "Provence-Alpes-Côte d’Azur",
    "14": "Normandie",
    "15": "Auvergne-Rhône-Alpes",
    "16": "Nouvelle-Aquitaine",
    "17": "Nouvelle-Aquitaine",
    "18": "Centre-Val de Loire",
    "19": "Nouvelle-Aquitaine",
    "21": "Bourgogne-Franche-Comté",
    "22": "Bretagne",
    "23": "Nouvelle-Aquitaine",
    "24": "Nouvelle-Aquitaine",
    "25": "Bourgogne-Franche-Comté",
    "26": "Auvergne-Rhône-Alpes",
    "27": "Normandie",
    "28": "Centre-Val de Loire",
    "29": "Bretagne",
    "30": "Occitanie",
    "31": "Occitanie",
    "32": "Occitanie",
    "33": "Nouvelle-Aquitaine",
    "34": "Occitanie",
    "35": "Bretagne",
    "36": "Centre-Val de Loire",
    "37": "Centre-Val de Loire",
    "38": "Auvergne-Rhône-Alpes",
    "39": "Bourgogne-Franche-Comté",
    "40": "Nouvelle-Aquitaine",
    "41": "Centre-Val de Loire",
    "42": "Auvergne-Rhône-Alpes",
    "43": "Auvergne-Rhône-Alpes",
    "44": "Pays de la Loire",
    "45": "Centre-Val de Loire",
    "46": "Occitanie",
    "47": "Nouvelle-Aquitaine",
    "48": "Occitanie",
    "49": "Pays de la Loire",
    "50": "Normandie",
    "51": "Grand Est",
    "52": "Grand Est",
    "53": "Pays de la Loire",
    "54": "Grand Est",
    "55": "Grand Est",
    "56": "Bretagne",
    "57": "Grand Est",
    "58": "Bourgogne-Franche-Comté",
    "59": "Hauts-de-France",
    "60": "Hauts-de-France",
    "61": "Normandie",
    "62": "Hauts-de-France",
    "63": "Auvergne-Rhône-Alpes",
    "64": "Nouvelle-Aquitaine",
    "65": "Occitanie",
    "66": "Occitanie",
    "67": "Grand Est",
    "68": "Grand Est",
    "69": "Auvergne-Rhône-Alpes",
    "70": "Bourgogne-Franche-Comté",
    "71": "Bourgogne-Franche-Comté",
    "72": "Pays de la Loire",
    "73": "Auvergne-Rhône-Alpes",
    "74": "Auvergne-Rhône-Alpes",
    "75": "Île-de-France",
    "76": "Normandie",
    "77": "Île-de-France",
    "78": "Île-de-France",
    "79": "Nouvelle-Aquitaine",
    "80": "Hauts-de-France",
    "81": "Occitanie",
    "82": "Occitanie",
    "83": "Provence-Alpes-Côte d’Azur",
    "84": "Provence-Alpes-Côte d’Azur",
    "85": "Pays de la Loire",
    "86": "Nouvelle-Aquitaine",
    "87": "Nouvelle-Aquitaine",
    "88": "Grand Est",
    "89": "Bourgogne-Franche-Comté",
    "90": "Bourgogne-Franche-Comté",
    "91": "Île-de-France",
    "92": "Île-de-France",
    "93": "Île-de-France",
    "94": "Île-de-France",
    "95": "Île-de-France",
  };

  return regionMap[dept] ?? "";
}

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase admin manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findAuthUserIdByEmail(email: string) {
  const admin = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(
        `Impossible de retrouver le compte client Supabase Auth. ${error.message}`,
      );
    }

    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );

    if (found?.id) {
      return found.id;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

async function getLatestPreauditSessionByEmail(email?: string | null) {
  if (!email) return null;

  const userId = await findAuthUserIdByEmail(email);

  if (!userId) return null;

  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("preaudit_sessions")
    .select(
      "id, user_id, status, audit_type, is_new_entrant, applicable_indicators, excluded_indicators, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de charger la session préaudit du client. ${error.message}`,
    );
  }

  return data as PreauditSessionSummary | null;
}

async function getPreauditIndicatorAnswerCount(
  session: PreauditSessionSummary,
) {
  const applicableIndicators = session.applicable_indicators ?? [];

  if (!applicableIndicators.length) return 0;

  const admin = getSupabaseAdminClient();

  const counts = await Promise.all(
    applicableIndicators.map(async (indicatorNumber) => {
      try {
        const { data, error } = await admin.rpc(
          "get_preaudit_indicator_answers",
          {
            p_session_id: session.id,
            p_indicator_number: indicatorNumber,
          },
        );

        if (error) {
          console.error(error);
          return 0;
        }

        return Array.isArray(data) ? data.length : 0;
      } catch (error) {
        console.error(error);
        return 0;
      }
    }),
  );

  return counts.reduce((total, count) => total + count, 0);
}

export default async function DossierPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const ndaPhasesParam = resolvedSearchParams.ndaPhases;
  const showAllNdaPhases = Array.isArray(ndaPhasesParam)
    ? ndaPhasesParam.includes("all")
    : ndaPhasesParam === "all";
  const supabase = await createClient();

  async function updateStatus(formData: FormData) {
    "use server";

    const dossierId = formData.get("dossier_id") as string;
    const status = formData.get("status") as string;
    const supabase = await createClient();

    const { error } = await supabase
      .from("dossiers")
      .update({ status })
      .eq("id", dossierId);

    if (error) {
      console.error(error);
      throw new Error("Impossible de mettre à jour le statut du dossier.");
    }

    redirect(`/agent/dossiers/${dossierId}`);
  }

  async function updateAssignment(formData: FormData) {
    "use server";

    const dossierId = formData.get("dossier_id") as string;
    const agentId = formData.get("agent_id") as string;
    const supabase = await createClient();

    const { data: existingAssignments, error: existingError } = await supabase
      .from("dossier_assignments")
      .select("id")
      .eq("dossier_id", dossierId);

    if (existingError) {
      console.error(existingError);
      throw new Error("Impossible de charger les assignations actuelles.");
    }

    if (existingAssignments?.length) {
      const existingIds = existingAssignments.map((item) => item.id);

      const { error: deleteError } = await supabase
        .from("dossier_assignments")
        .delete()
        .in("id", existingIds);

      if (deleteError) {
        console.error(deleteError);
        throw new Error("Impossible de réinitialiser l’assignation.");
      }
    }

    if (agentId) {
      const { error: insertError } = await supabase
        .from("dossier_assignments")
        .insert({
          dossier_id: dossierId,
          agent_id: agentId,
          is_primary: true,
        });

      if (insertError) {
        console.error(insertError);
        throw new Error("Impossible d’assigner cet agent.");
      }

      const { error: statusError } = await supabase
        .from("dossiers")
        .update({ status: "assigned" })
        .eq("id", dossierId);

      if (statusError) {
        console.error(statusError);
        throw new Error(
          "Impossible de mettre à jour le statut après assignation.",
        );
      }
    } else {
      const { error: statusError } = await supabase
        .from("dossiers")
        .update({ status: "assignable" })
        .eq("id", dossierId);

      if (statusError) {
        console.error(statusError);
        throw new Error("Impossible de remettre le dossier à assigner.");
      }
    }

    redirect(`/agent/dossiers/${dossierId}`);
  }

  async function updateDocumentType(formData: FormData) {
    "use server";

    const docId = formData.get("doc_id") as string;
    const documentType = normalizeNdaDocumentType(
      formData.get("document_type") as string,
    );
    const dossierId = formData.get("dossier_id") as string;

    const supabase = await createClient();

    const { error } = await supabase
      .from("documents")
      .update({ document_type: documentType })
      .eq("id", docId);

    if (error) {
      console.error(error);
      throw new Error("Impossible de modifier le type du document.");
    }

    redirect(`/agent/dossiers/${dossierId}`);
  }

  async function archiveDossier(formData: FormData) {
    "use server";

    const dossierId = formData.get("dossier_id") as string;
    const confirmation = (formData.get("confirmation") as string)?.trim();

    if (confirmation !== "ARCHIVER") {
      throw new Error(
        "Confirmation incorrecte. Pour archiver ce dossier, saisissez ARCHIVER.",
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("dossiers")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", dossierId);

    if (error) {
      console.error(error);
      throw new Error("Impossible d’archiver ce dossier.");
    }

    redirect("/agent/dossiers");
  }

  const { data: dossier, error } = await supabase
    .from("dossiers")
    .select(
      `
      id,
      title,
      type,
      status,
      created_at,
      updated_at,
      organisation_id,
      organisations:organisation_id (
        id,
        name,
        email,
        phone,
        siret,
        nda_number,
        address
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(error, null, 2)}</pre>
      </main>
    );
  }

  if (!dossier) {
    return (
      <main className="p-10" style={{ color: "var(--selen-text)" }}>
        Dossier introuvable.
      </main>
    );
  }

  const isNdaDossier = dossier.type === "nda";
  const isPreauditDossier = isPreauditDossierType(dossier.type);
  const isReviewDossier = isReviewDossierType(dossier.type);
  const resolvedClientUrl = getVitrineClientUrl(dossier.type, dossier.id);

  const { data: assignments, error: assignmentsError } = await supabase
    .from("dossier_assignments")
    .select("id, agent_id, is_primary")
    .eq("dossier_id", dossier.id);

  if (assignmentsError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(assignmentsError, null, 2)}</pre>
      </main>
    );
  }

  const { data: dossierMessages, error: dossierMessagesError } = await supabase
    .from("messages")
    .select("id, content, sender_type, created_at")
    .eq("dossier_id", dossier.id)
    .order("created_at", { ascending: true });

  if (dossierMessagesError) {
    console.error(dossierMessagesError);
  }

  const { data: clientDocuments } = await supabase
    .from("documents")
    .select("*")
    .eq("organisation_id", dossier?.organisation_id)
    .is("dossier_id", null)
    .order("created_at", { ascending: false });

  const { data: agents, error: agentsError } = await supabase
    .from("agent_profiles")
    .select("id, email, first_name, last_name, role")
    .eq("is_active", true)
    .in("role", ["agent", "admin"])
    .order("first_name", { ascending: true });

  if (agentsError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(agentsError, null, 2)}</pre>
      </main>
    );
  }

  const organisationRaw = Array.isArray(dossier.organisations)
    ? dossier.organisations[0]
    : dossier.organisations;

  const organisation = (organisationRaw ?? null) as OrganisationRow | null;

  const preauditSession =
    dossier.type === "preaudit"
      ? await getLatestPreauditSessionByEmail(organisation?.email)
      : null;

  const preauditApplicableCount =
    preauditSession?.applicable_indicators?.length ?? 0;

  const preauditExcludedCount =
    preauditSession?.excluded_indicators?.length ?? 0;

  const preauditIndicatorAnswerCount = preauditSession
    ? await getPreauditIndicatorAnswerCount(preauditSession)
    : 0;

  const { data: reviewCaseRaw } = isReviewDossier
    ? await supabase
        .from("audit_blanc_cases")
        .select("id, status, report_status, client_email, updated_at")
        .eq("dossier_id", dossier.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const reviewCase = reviewCaseRaw as ReviewCaseSummary | null;

  const { data: relatedDossiers } = organisation
    ? await supabase
        .from("dossiers")
        .select("id, title, type, status, created_at")
        .eq("organisation_id", dossier.organisation_id)
        .neq("id", dossier.id)
        .order("created_at", { ascending: false })
    : { data: [] as RelatedDossier[] };

  const { data: documentsData, error: documentsError } = await supabase
    .from("documents")
    .select(
      "id, name, document_type, status, source, created_at, storage_path, is_visible_to_client, document_role, review_status, generated_from_model, version_group, parent_document_id, requires_client_action, validated_at, validated_by, visible_to_client_at, metadata, notes, extracted_text",
    )
    .eq("dossier_id", dossier.id)
    .order("created_at", { ascending: true });

  const { data: ndaVariablesData, error: ndaVariablesError } = await supabase
    .from("nda_variables")
    .select("*")
    .eq("dossier_id", dossier.id)
    .maybeSingle();

  if (ndaVariablesError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(ndaVariablesError, null, 2)}</pre>
      </main>
    );
  }

  const { data: latestProgramAnalysis, error: latestProgramAnalysisError } =
    await supabase
      .from("program_ai_analyses")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestProgramAnalysisError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestProgramAnalysisError, null, 2)}</pre>
      </main>
    );
  }

  const { data: latestProgramVersion, error: latestProgramVersionError } =
    await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossier.id)
      .eq("version_type", "agent_draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestProgramVersionError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestProgramVersionError, null, 2)}</pre>
      </main>
    );
  }

  const {
    data: latestClientProgramVersion,
    error: latestClientProgramVersionError,
  } = await supabase
    .from("dossier_program_versions")
    .select("*")
    .eq("dossier_id", dossier.id)
    .eq("version_type", "client_sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestClientProgramVersionError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestClientProgramVersionError, null, 2)}</pre>
      </main>
    );
  }

  const { data: latestClientDecision, error: latestClientDecisionError } =
    await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossier.id)
      .eq("version_type", "client_sent")
      .not("client_decision", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestClientDecisionError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestClientDecisionError, null, 2)}</pre>
      </main>
    );
  }

  const ndaVariables = (ndaVariablesData ?? null) as NdaVariablesRow | null;

  const isNdaProgramValidated =
    isNdaDossier && latestClientDecision?.client_decision === "validated";

  const hasNdaStep2Info = Boolean(
    ndaVariables?.stagiaire_prenom ||
    ndaVariables?.stagiaire_nom ||
    ndaVariables?.stagiaire_adresse ||
    ndaVariables?.stagiaire_email ||
    ndaVariables?.stagiaire_telephone ||
    ndaVariables?.stagiaire_fonction ||
    ndaVariables?.client_nom ||
    ndaVariables?.client_adresse ||
    ndaVariables?.client_representant_prenom ||
    ndaVariables?.client_representant_nom ||
    ndaVariables?.client_siret ||
    ndaVariables?.date_formation_prevue ||
    ndaVariables?.date_fin_formation ||
    ndaVariables?.lieu_formation ||
    ndaVariables?.lieu_signature_convention ||
    ndaVariables?.date_signature_convention,
  );

  const shouldShowNdaStep2Summary = isNdaProgramValidated && hasNdaStep2Info;

  const shouldCondenseNdaHistory = shouldShowNdaStep2Summary;

  const receivedKeys = [
    ...(documentsData ?? []).map((d) => d.document_type),
    ...((clientDocuments ?? []) as DbDocumentRow[]).map((d) => d.document_type),
  ]
    .filter(Boolean)
    .map((documentType) => normalizeNdaDocumentType(documentType));

  const uniqueReceivedKeys = Array.from(new Set(receivedKeys));

  const canRunAutoAnalysis =
    uniqueReceivedKeys.includes("cv_formateur") &&
    uniqueReceivedKeys.includes("programme_formation");

  if (documentsError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(documentsError, null, 2)}</pre>
      </main>
    );
  }

  const documents = ((documentsData ?? []) as DbDocumentRow[]).map(
    mapDbDocumentToItem,
  );
  const clientDocumentsItems = ((clientDocuments ?? []) as DbDocumentRow[]).map(
    mapDbDocumentToItem,
  );
  const relatedActiveDossiers = ((relatedDossiers ?? []) as RelatedDossier[])
    .filter((related) => related.status !== "archived")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const relatedArchivedDossiers = ((relatedDossiers ?? []) as RelatedDossier[])
    .filter((related) => related.status === "archived")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const allNdaDocuments = [
    ...((documentsData ?? []) as DbDocumentRow[]),
    ...((clientDocuments ?? []) as DbDocumentRow[]),
  ];
  const initialClientDocuments = allNdaDocuments.filter(
    (doc) =>
      inferNdaDocumentRole({
        documentRole: doc.document_role,
        source: doc.source,
      }) === "initial_client_document",
  );
  const finalReturnedDocuments = allNdaDocuments.filter(
    isNdaFinalReturnedDocument,
  );
  const finalReturnedKeys = Array.from(
    new Set(
      finalReturnedDocuments.map((doc) =>
        normalizeNdaDocumentType(doc.document_type),
      ),
    ),
  );
  const missingFinalRequiredTypes = NDA_FINAL_REQUIRED_DOCUMENT_TYPES.filter(
    (documentType) => !finalReturnedKeys.includes(documentType),
  );
  const finalReturnedByType = new Map(
    finalReturnedDocuments.map((doc) => [
      normalizeNdaDocumentType(doc.document_type),
      doc,
    ]),
  );
  const hasDreetsRefusalLetter = allNdaDocuments.some(
    (doc) => normalizeNdaDocumentType(doc.document_type) === "dreets_refusal_letter",
  );
  const generatedSigningDocuments = allNdaDocuments.filter(
    isNdaGeneratedSigningDocument,
  );
  const sortedNdaDocumentsByDate = [...allNdaDocuments].sort(
    (a, b) =>
      new Date(b.created_at ?? "").getTime() -
      new Date(a.created_at ?? "").getTime(),
  );
  const analysisCvDocument = sortedNdaDocumentsByDate.find((doc) =>
    ["cv_formateur", "cv"].includes(normalizeNdaDocumentType(doc.document_type)),
  );
  const analysisProgramDocument = sortedNdaDocumentsByDate.find((doc) => {
    const normalizedType = normalizeNdaDocumentType(doc.document_type);
    return (
      ["programme_formation", "programme_client_corrige", "programme_reformule"].includes(
        normalizedType,
      ) ||
      doc.document_role === "client_returned_document" ||
      doc.storage_path?.includes("program-versions")
    );
  });
  const analysisCvAutoText = analysisCvDocument?.extracted_text?.trim() ?? "";
  const analysisProgramAutoText =
    analysisProgramDocument?.extracted_text?.trim() ?? "";
  const analysisCvInitialText =
    ndaVariables?.cv_manual_text?.trim() || analysisCvAutoText;
  const analysisProgramInitialText =
    ndaVariables?.program_manual_text?.trim() || analysisProgramAutoText;
  const administrativeIdentityDocument = sortedNdaDocumentsByDate.find((doc) =>
    ["avis_insee", "kbis"].includes(normalizeNdaDocumentType(doc.document_type)),
  );
  const administrativeIdentityWarning =
    administrativeIdentityDocument &&
    !administrativeIdentityDocument.extracted_text?.trim()
      ? "Avis INSEE reçu — texte non extrait automatiquement. Vérification manuelle requise."
      : null;
  const generatedSigningTypes = Array.from(
    new Set(
      generatedSigningDocuments.map((doc) =>
        normalizeNdaDocumentType(doc.document_type),
      ),
    ),
  );
  const signingDocumentsGenerated =
    generatedSigningTypes.includes("programme_formation") &&
    generatedSigningTypes.includes("convention_formation");
  const initialDepositComplete =
    uniqueReceivedKeys.includes("cv_formateur") &&
    uniqueReceivedKeys.includes("programme_formation") &&
    (uniqueReceivedKeys.includes("avis_insee") ||
      uniqueReceivedKeys.includes("kbis"));
  const workflowProgramVersion =
    latestClientProgramVersion ?? latestProgramVersion;
  const programReady = Boolean(
    workflowProgramVersion &&
      hasNdaProgramDocumentContent(workflowProgramVersion),
  );
  const workflowProgramStatus = workflowProgramVersion?.status ?? null;
  const workflowProgramDecision =
    workflowProgramVersion?.client_decision ?? null;
  const workflowProgramSentToClient =
    workflowProgramVersion?.version_type === "client_sent" ||
    workflowProgramStatus === "sent" ||
    workflowProgramStatus === "pending_client";
  const programRefusedByClient =
    workflowProgramDecision === "refused" ||
    workflowProgramStatus === "refused_by_client";
  const programValidatedByClient =
    workflowProgramDecision === "validated" ||
    workflowProgramStatus === "validated_by_client";
  const programPendingClientDecision =
    programReady &&
    workflowProgramSentToClient &&
    !programRefusedByClient &&
    !programValidatedByClient;
  const variablesReady = hasNdaRequiredVariables(ndaVariables);
  const ndaAgentWorkflowState = getNdaAgentWorkflowState({
    initialDepositComplete,
    programReady,
    programPendingClientDecision,
    programRefusedByClient,
    programValidatedByClient,
    variablesReady,
    signingDocumentsGenerated,
    finalReturnedDocuments,
    missingFinalRequiredTypes,
  });
  const syncedDossierStatus =
    isNdaDossier && ndaAgentWorkflowState.targetDossierStatus
      ? await syncNdaDossierStatus({
          admin: getSupabaseAdminClient(),
          dossierId: dossier.id,
          currentStatus: dossier.status,
          targetStatus: ndaAgentWorkflowState.targetDossierStatus,
        }).catch((error) => {
          console.error("NDA status sync failed:", error);
          return { updated: false, status: dossier.status };
        })
      : { updated: false, status: dossier.status };
  const displayDossierStatus = syncedDossierStatus.status ?? dossier.status;
  const visibleDossierStatusLabel = isNdaDossier
    ? ndaAgentWorkflowState.statusLabel
    : getStatusLabel(displayDossierStatus);
  const visibleDossierStatusVariant: SelenBadgeVariant = isNdaDossier
    ? (ndaAgentWorkflowState.statusTone as SelenBadgeVariant)
    : getStatusBadgeVariant(displayDossierStatus);

  const primaryAssignment =
    ((assignments ?? []) as AssignmentRow[]).find((a) => a.is_primary) ??
    ((assignments ?? []) as AssignmentRow[])[0] ??
    null;

  const assignedAgent =
    ((agents ?? []) as AgentProfile[]).find(
      (agent) => agent.id === primaryAssignment?.agent_id,
    ) ?? null;

  const assignedAgentDisplayName = assignedAgent
    ? [assignedAgent.first_name, assignedAgent.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      assignedAgent.email ||
      "Agent sans nom"
    : "";

  const preauditTimelineSteps = [
    { label: "Dossier\ncréé" },
    { label: "Profil client\nrempli" },
    { label: "Indicateurs\ngénérés" },
    { label: "Réponses\nen cours" },
    { label: "Synthèse\ndisponible" },
    { label: "Rapport\nexporté" },
    { label: "Clôturé" },
  ];

  const reviewTimelineSteps = [
    { label: "Création\ndossier" },
    { label: "Planification\naudit" },
    { label: "Préparation\ncollecte" },
    { label: "Audit\nréalisé" },
    { label: "Rapport en\npréparation" },
    { label: "Rapport\nenvoyé" },
    { label: "Clôturé" },
  ];

  const currentStep = statusToStepIndex(displayDossierStatus);
  const preauditCurrentStep = preauditSession
    ? preauditIndicatorAnswerCount > 0
      ? 3
      : preauditApplicableCount > 0
        ? 2
        : 1
    : 0;
  const reviewCurrentStep = reviewCase
    ? reviewCase.report_status === "sent"
      ? 5
      : reviewCase.report_status === "ready" ||
          reviewCase.status === "report_ready"
        ? 4
        : reviewCase.status === "in_progress"
          ? 3
          : reviewCase.status === "booked" ||
              reviewCase.status === "partially_booked"
            ? 1
            : 2
    : 0;
  const dossierTimelineSteps = isPreauditDossier
    ? preauditTimelineSteps
    : isReviewDossier
      ? reviewTimelineSteps
      : isNdaDossier
        ? NDA_AGENT_WORKFLOW_STEPS
        : undefined;
  const dossierCurrentStep = isPreauditDossier
    ? preauditCurrentStep
    : isReviewDossier
      ? reviewCurrentStep
      : isNdaDossier
        ? getNdaWorkflowPhaseIndex(ndaAgentWorkflowState.currentStep)
        : currentStep;
  const ndaPhaseValidations = normalizeNdaPhaseValidations(
    ndaVariables?.nda_phase_validations,
  );
  const activeNdaPhaseIndex =
    getActiveNdaPhaseIndexFromValidations(ndaPhaseValidations);
  const ndaPhaseWarnings: Partial<Record<NdaPhaseKey, string>> = {
    initial_reception: initialDepositComplete
      ? undefined
      : "Certains documents initiaux semblent manquants : CV formateur, programme de formation ou avis INSEE / KBIS.",
    program_analysis: programReady
      ? undefined
      : "Le programme ne semble pas encore contenir de déroulé pédagogique exploitable.",
    signing_documents:
      variablesReady && signingDocumentsGenerated
        ? undefined
        : "Les informations NDA ou les documents à signer ne semblent pas encore complets.",
    final_return:
      missingFinalRequiredTypes.length === 0
        ? ndaVariables?.nda_deposit_specific_code
          ? undefined
          : "Attention : aucun code spécifique au domaine de formation n’est renseigné. Le client verra “À confirmer par Selen” dans la procédure de dépôt."
        : "Des documents finaux retournés par le client semblent encore manquants.",
    ready_for_deposit:
      ndaAgentWorkflowState.currentStep >= 6
        ? undefined
        : "Le dossier ne semble pas encore entièrement prêt pour le dépôt NDA.",
  };

  const docsReceived = NDA_REQUIRED_DOCUMENT_KEYS.filter((key) =>
    uniqueReceivedKeys.includes(key),
  ).length;
  const docsTotal = NDA_REQUIRED_DOCUMENT_KEYS.length;
  const phase1InfoStatus =
    ndaVariablesData || uniqueReceivedKeys.includes("questionnaire_nda")
      ? "completed"
      : "unknown";
  const extractedAddress = extractPostalCodeAndCity(organisation?.address);

  const ndaVariablesInitialValues = {
    ...ndaVariablesData,
    siret: ndaVariablesData?.siret ?? organisation?.siret ?? "",
    organisme_adresse:
      ndaVariablesData?.organisme_adresse ?? organisation?.address ?? "",

    region:
      ndaVariablesData?.region ??
      getRegionFromPostalCode(
        ndaVariablesData?.code_postal ?? extractedAddress.code_postal,
      ) ??
      "",
  };

  const { data: unreadMessages } = await supabase
    .from("messages")
    .select("id")
    .eq("dossier_id", dossier.id)
    .eq("sender_type", "client")
    .is("read_by_agent_at", null);

  const hasUnread = (unreadMessages ?? []).length > 0;
  const unreadCount = (unreadMessages ?? []).length;

  const historyItems: Array<{
    id: string;
    label: string;
    rawDate: Date;
  }> = [];

  function addHistoryItem(id: string, label: string, value?: string | null) {
    if (!value) return;

    const rawDate = new Date(value);
    if (Number.isNaN(rawDate.getTime())) return;

    historyItems.push({ id, label, rawDate });
  }

  addHistoryItem(
    `dossier-created-${dossier.id}`,
    "Dossier créé",
    dossier.created_at,
  );

  if (dossier.updated_at !== dossier.created_at) {
    addHistoryItem(
      `dossier-updated-${dossier.id}`,
      "Dossier mis à jour",
      dossier.updated_at,
    );
  }

  ((documentsData ?? []) as DbDocumentRow[]).forEach((doc) => {
    addHistoryItem(
      `document-${doc.id}`,
      `Document ajouté : ${doc.name}`,
      doc.created_at,
    );
  });

  ((dossierMessages ?? []) as MessageRow[]).forEach((message) => {
    addHistoryItem(
      `message-${message.id}`,
      message.sender_type === "client"
        ? "Message client reçu"
        : "Message agent envoyé",
      message.created_at,
    );
  });

  if (preauditSession) {
    addHistoryItem(
      `preaudit-${preauditSession.id}`,
      "Préaudit client mis à jour",
      preauditSession.updated_at ?? preauditSession.created_at,
    );
  }

  if (reviewCase?.updated_at) {
    addHistoryItem(
      `review-${reviewCase.id}`,
      "Fiche Review mise à jour",
      reviewCase.updated_at,
    );
  }

  const historyEntries: HistoryEntry[] = historyItems
    .sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())
    .map((item) => ({
      id: item.id,
      label: item.label,
      date: item.rawDate.toLocaleDateString("fr-FR"),
    }));

  return (
    <main
      style={{
        padding: 0,
        background: "var(--selen-bg)",
        minHeight: "100vh",
        color: "var(--selen-text)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 28px",
          borderBottom: "1px solid var(--selen-border)",
          background: "var(--selen-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--selen-text3)",
          }}
        >
          <Link
            href="/agent/dossiers"
            style={{ color: "var(--selen-text3)", textDecoration: "none" }}
          >
            Dossiers
          </Link>
          <span style={{ opacity: 0.4 }}>›</span>
          {organisation?.id ? (
            <>
              <Link
                href={`/agent/clients/${organisation.id}`}
                style={{ color: "var(--selen-text3)", textDecoration: "none" }}
              >
                {organisation.name ?? "Client"}
              </Link>
              <span style={{ opacity: 0.4 }}>›</span>
            </>
          ) : null}
          <span style={{ color: "var(--selen-text2)" }}>
            {getTypeLabel(dossier.type)} · {dossier.title}
          </span>
        </div>

      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1120, margin: "0 auto" }}>
        <DossierAutoRefreshNotice
          dossierId={dossier.id}
          initialUpdatedAt={dossier.updated_at}
          initialStatus={displayDossierStatus}
        />

        <div style={{ marginBottom: 20 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 9,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--selen-gold)",
              opacity: 0.8,
            }}
          >
            Fiche dossier
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--selen-text)",
              marginTop: 8,
              lineHeight: 1.2,
            }}
          >
            {dossier.title}
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <SelenBadge variant="type" dot>
              {getTypeLabel(dossier.type)}
            </SelenBadge>

            <SelenBadge variant={visibleDossierStatusVariant} dot>
              {visibleDossierStatusLabel}
            </SelenBadge>

            {organisation?.name ? (
              <span style={{ fontSize: 13, color: "var(--selen-text2)" }}>
                {organisation.name}
              </span>
            ) : null}
          </div>
        </div>

        {relatedActiveDossiers.length > 0 ||
        relatedArchivedDossiers.length > 0 ? (
          <SelenCard style={{ marginBottom: 16 }}>
            <SelenCardTitle>Autres dossiers du client</SelenCardTitle>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {[...relatedActiveDossiers, ...relatedArchivedDossiers].map(
                (related) => (
                  <Link
                    key={related.id}
                    href={`/agent/dossiers/${related.id}`}
                    style={{
                      display: "block",
                      minWidth: 220,
                      textDecoration: "none",
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-md)",
                      padding: "12px 14px",
                      color: "var(--selen-text)",
                      opacity: related.status === "archived" ? 0.72 : 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 6,
                      }}
                    >
                      {related.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--selen-text3)",
                      }}
                    >
                      {getTypeLabel(related.type)} ·{" "}
                      {getStatusLabel(related.status)}
                    </div>
                  </Link>
                ),
              )}
            </div>
          </SelenCard>
        ) : null}

        <DossierTimeline
          currentStep={dossierCurrentStep}
          steps={dossierTimelineSteps}
        />

        {isNdaDossier ? (
          <div
            style={{
              background: "var(--selen-card-texture), var(--selen-card)",
              border: "1px solid rgba(245, 208, 138, 0.24)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              marginTop: -10,
              marginBottom: 20,
              boxShadow: "0 12px 28px rgba(58, 44, 32, 0.14)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--selen-text-oncard)",
                marginBottom: 4,
              }}
            >
              {ndaAgentWorkflowState.statusLabel}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--selen-text2-oncard)",
                lineHeight: 1.5,
              }}
            >
              {ndaAgentWorkflowState.agentStatusDescription}
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 11,
                  color: "var(--selen-text3-oncard)",
                }}
              >
                Statut technique : {getStatusLabel(displayDossierStatus)}
              </span>
            </div>
          </div>
        ) : null}

        {isNdaDossier ? (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: -8,
              marginBottom: 14,
            }}
          >
            <Link
              href={
                showAllNdaPhases
                  ? `/agent/dossiers/${dossier.id}`
                  : `/agent/dossiers/${dossier.id}?ndaPhases=all`
              }
              scroll={false}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--selen-border2)",
                borderRadius: "var(--radius-sm)",
                background: showAllNdaPhases
                  ? "var(--selen-card2)"
                  : "rgba(120, 90, 50, 0.08)",
                color: "var(--selen-text2)",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {showAllNdaPhases
                ? "Masquer les phases à venir"
                : "Afficher toutes les phases"}
            </Link>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isNdaDossier ? (
              <div
                style={{
                  order: getNdaPhaseDisplayOrder(2, activeNdaPhaseIndex),
                }}
              >
                <NdaWorkflowPhaseCard
                  dossierId={dossier.id}
                  phaseKey="signing_documents"
                  phaseIndex={2}
                  activePhaseIndex={activeNdaPhaseIndex}
                  showFuturePhases={showAllNdaPhases}
                  validationWarning={ndaPhaseWarnings.signing_documents}
                  title="Préparation des documents à signer"
                  subtitle="Vérifiez les variables NDA, puis préparez le pack visible côté client."
                >
                  <SelenCard>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Les informations de cette étape sont principalement
                      reprises depuis le questionnaire rempli par le client. Les
                      documents servent à vérifier la cohérence des informations
                      et à constituer les preuves du dossier.
                    </p>
                  </SelenCard>

                  <NdaVariablesCard
                    dossierId={dossier.id}
                    initialValues={ndaVariablesInitialValues}
                  />

                  <SelenCard>
                    <SelenCardTitle>Documents à signer prêts</SelenCardTitle>
                    {generatedSigningDocuments.length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {generatedSigningDocuments.map((doc) => (
                          <div
                            key={doc.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              border: "1px solid var(--selen-border)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--selen-bg3)",
                              padding: "10px 12px",
                            }}
                          >
                            {doc.storage_path ? (
                              <OpenDocumentButton docId={doc.id} />
                            ) : (
                              <span
                                style={{
                                  minWidth: 92,
                                  fontSize: 11,
                                  color: "var(--selen-text3)",
                                }}
                              >
                                Fichier indisponible
                              </span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "var(--selen-text)",
                                }}
                              >
                                {doc.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--selen-text3)",
                                  marginTop: 2,
                                }}
                              >
                                {getDocumentWorkflowMeta(doc)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--selen-text3)",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        Aucun document à signer prêt pour le moment.
                      </p>
                    )}
                  </SelenCard>
                </NdaWorkflowPhaseCard>
              </div>
            ) : null}

            {isNdaDossier ? (
              <div
                style={{
                  order: getNdaPhaseDisplayOrder(3, activeNdaPhaseIndex),
                }}
              >
                <NdaWorkflowPhaseCard
                  dossierId={dossier.id}
                  phaseKey="final_return"
                  phaseIndex={3}
                  activePhaseIndex={activeNdaPhaseIndex}
                  showFuturePhases={showAllNdaPhases}
                  validationWarning={ndaPhaseWarnings.final_return}
                  title="Retour client et contrôle final"
                  subtitle="Suivez les documents signés retournés par le client et validez les pièces finales."
                >
                <SelenCard>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--selen-text3)",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    Lorsque vous validez cette phase, la procedure de depot est
                    ouverte cote Vitrine. Seuls les documents marques "Depot"
                    seront visibles cote client.
                  </p>
                </SelenCard>
                <SelenCard>
                  <SelenCardTitle>Ajouter une version corrigee</SelenCardTitle>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--selen-text3)",
                      lineHeight: 1.5,
                      margin: "0 0 10px",
                    }}
                  >
                    Ajoutez ici les documents corriges ou finalises par
                    l'agent, puis selectionnez precisement ceux qui seront
                    visibles cote client pour le depot DREETS.
                  </p>
                  <DocumentUpload
                    dossierId={dossier.id}
                    organisationId={organisation?.id}
                  />
                </SelenCard>
                <SelenCard>
                  <SelenCardTitle>
                    Documents finaux retournés par le client
                  </SelenCardTitle>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      {[
                        {
                          label: "Reçus",
                          value: finalReturnedDocuments.length,
                        },
                        {
                          label: "Attendus V1",
                          value: NDA_FINAL_REQUIRED_DOCUMENT_TYPES.length,
                        },
                        {
                          label: "Manquants",
                          value: missingFinalRequiredTypes.length,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            border: "1px solid var(--selen-border)",
                            borderRadius: 8,
                            background: "rgba(255, 248, 232, 0.55)",
                            padding: "8px 10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--selen-text3)",
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              color: "var(--selen-text)",
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {missingFinalRequiredTypes.length > 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--selen-text3)",
                          lineHeight: 1.5,
                          marginBottom: 12,
                        }}
                      >
                        Pièces manquantes :{" "}
                        {missingFinalRequiredTypes
                          .map(getNdaFinalDocumentLabel)
                          .join(", ")}
                      </div>
                    ) : null}

                  <div style={{ display: "grid", gap: 8 }}>
                    {[
                      ...NDA_FINAL_REQUIRED_DOCUMENT_TYPES,
                      ...NDA_FINAL_OPTIONAL_DOCUMENT_TYPES,
                      ].map((documentType) => {
                        const doc = finalReturnedByType.get(documentType);
                        const reviewStatus = doc
                          ? inferNdaDocumentReviewStatus({
                              reviewStatus: doc.review_status,
                              status: doc.status,
                              source: doc.source,
                            })
                          : null;

                        return (
                          <div
                            key={documentType}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              border: "1px solid var(--selen-border)",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--selen-bg3)",
                              padding: "10px 12px",
                            }}
                          >
                            {doc?.storage_path ? (
                              <OpenDocumentButton docId={doc.id} />
                            ) : (
                              <span
                                style={{
                                  minWidth: 58,
                                  fontSize: 11,
                                  color: "var(--selen-text3)",
                                }}
                              >
                                -
                              </span>
                            )}

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "var(--selen-text)",
                                  fontWeight: 600,
                                }}
                              >
                                {getNdaFinalDocumentLabel(documentType)}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--selen-text3)",
                                  marginTop: 2,
                                }}
                              >
                                {doc
                                  ? `${doc.name} · ${
                                      reviewStatus
                                        ? getDocumentReviewStatusLabel(
                                            reviewStatus,
                                          )
                                        : "Reçu"
                                    }`
                                  : documentType === "liste_formateurs_signee"
                                    ? "Prévu plus tard"
                                    : "Manquant"}
                              </div>
                            </div>

                            {doc && reviewStatus ? (
                              <DocumentReviewActions
                                documentId={doc.id}
                                currentStatus={reviewStatus}
                                isVisibleToClient={doc.is_visible_to_client}
                                showClientVisibilityToggle
                              />
                            ) : null}
                          </div>
                        );
                    })}
                  </div>
                </SelenCard>
                <SelenCard>
                  <SelenCardTitle>Code de dépôt NDA</SelenCardTitle>
                  {!ndaVariables?.nda_deposit_specific_code ? (
                    <div
                      style={{
                        border: "1px solid rgba(212, 159, 63, 0.34)",
                        background: "rgba(212, 159, 63, 0.08)",
                        borderRadius: "var(--radius-sm)",
                        padding: "9px 11px",
                        color: "var(--selen-text2)",
                        fontSize: 12,
                        lineHeight: 1.5,
                        marginBottom: 12,
                      }}
                    >
                      Attention : aucun code spécifique au domaine de formation
                      n’est renseigné. Le client verra “À confirmer par Selen”
                      dans la procédure de dépôt.
                    </div>
                  ) : null}
                  <NdaDepositFollowUpCard
                    dossierId={dossier.id}
                    dossierStatus={displayDossierStatus}
                    initialValues={ndaVariablesInitialValues}
                    mode="code"
                  />
                </SelenCard>
                </NdaWorkflowPhaseCard>
              </div>
            ) : null}

            <NdaPhaseOrCollapsed
              isNdaDossier={isNdaDossier}
              dossierId={dossier.id}
              phaseKey="initial_reception"
              phaseIndex={0}
              activePhaseIndex={activeNdaPhaseIndex}
              showFuturePhases={showAllNdaPhases}
              validationWarning={ndaPhaseWarnings.initial_reception}
              phaseTitle="Réception initiale"
              phaseSubtitle="Contrôlez les premiers documents déposés et les pièces de départ du dossier."
              collapsed={shouldCondenseNdaHistory}
              title="Historique — dépôt initial et documents"
            >
              <SelenCard>
                <SelenCardTitle>
                  {isNdaDossier
                    ? "Documents attendus"
                    : "Documents complémentaires"}
                </SelenCardTitle>

                {isNdaDossier ? (
                  <>
                    <NdaChecklist
                      receivedKeys={receivedKeys}
                      phase1InfoStatus={phase1InfoStatus}
                      scope="initial"
                    />
                  </>
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--selen-text3)",
                      lineHeight: 1.5,
                      margin: "0 0 10px",
                    }}
                  >
                    Les pièces NDA ne sont pas attendues pour ce type de
                    dossier. Ajoutez ici seulement les documents utiles au suivi
                    agent.
                  </p>
                )}

                {documentsData
                  ?.filter(
                    (doc) =>
                      !isNdaDossier ||
                      isNdaInitialReceptionDocument(doc as DbDocumentRow),
                  )
                  .map((doc) => (
                    <form
                      key={doc.id}
                      action={updateDocumentType}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "auto minmax(0, 1fr) minmax(150px, 210px) auto",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 0",
                        borderBottom: "1px solid var(--selen-border)",
                      }}
                    >
                      <input type="hidden" name="doc_id" value={doc.id} />
                      <input
                        type="hidden"
                        name="dossier_id"
                        value={dossier.id}
                      />

                      {doc.storage_path ? (
                        <OpenDocumentButton docId={doc.id} />
                      ) : (
                        <span
                          style={{
                            minWidth: 92,
                            fontSize: 11,
                            color: "var(--selen-text3)",
                          }}
                        >
                          Fichier indisponible
                        </span>
                      )}

                      <div style={{ minWidth: 0 }}>
                        <div
                          title={doc.name}
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {doc.name}
                        </div>
                        {isNdaDossier ? (
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--selen-text3)",
                              marginTop: 2,
                            }}
                          >
                            {getDocumentWorkflowMeta(doc as DbDocumentRow)}
                          </div>
                        ) : null}
                        {isNdaDossier && (doc as DbDocumentRow).notes ? (
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--selen-text3)",
                              marginTop: 2,
                            }}
                          >
                            Note agent : {(doc as DbDocumentRow).notes}
                          </div>
                        ) : null}
                      </div>

                      <select
                        name="document_type"
                        defaultValue={normalizeNdaDocumentType(
                          doc.document_type,
                        )}
                        style={{
                          fontSize: 11,
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: 6,
                          padding: "7px 8px",
                          color: "var(--selen-text)",
                          fontFamily: "var(--font-body)",
                          width: "100%",
                        }}
                      >
                        <option value="document_libre">Libre</option>
                        <option value="cv_formateur">CV formateur</option>
                        <option value="programme_formation">Programme</option>
                        <option value="programme_formation_signe">
                          Programme signé
                        </option>
                        <option value="convention_formation">
                          Convention à signer
                        </option>
                        <option value="avis_insee">Avis INSEE</option>
                        <option value="diplomes_formateur_principal">
                          Diplôme
                        </option>
                        <option value="kbis">KBis</option>
                        <option value="casier_judiciaire_n3">
                          Casier judiciaire
                        </option>
                        <option value="convention_signee">
                          Convention signée
                        </option>
                      </select>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <SubmitButton label="Enregistrer" pendingLabel="..." />
                        {isNdaDossier ? (
                          <DocumentReviewActions
                            documentId={doc.id}
                            currentStatus={inferNdaDocumentReviewStatus({
                              reviewStatus: (doc as DbDocumentRow)
                                .review_status,
                              status: (doc as DbDocumentRow).status,
                              source: (doc as DbDocumentRow).source,
                            })}
                          />
                        ) : null}
                        <DeleteDocumentButton
                          documentId={doc.id}
                          documentName={doc.name}
                        />
                      </div>
                    </form>
                  ))}
              </SelenCard>
            </NdaPhaseOrCollapsed>

            {!isNdaDossier ? (
              <SelenCard style={{ order: 500 }}>
                <SelenCardTitle>Changer le statut</SelenCardTitle>
                <form
                  action={updateStatus}
                  style={{ display: "flex", gap: 10 }}
                >
                  <input type="hidden" name="dossier_id" value={dossier.id} />
                  <select
                    name="status"
                    defaultValue={displayDossierStatus}
                    style={{
                      flex: 1,
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 12px",
                      color: "var(--selen-text)",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      outline: "none",
                    }}
                  >
                    <option value="draft">Brouillon</option>
                    <option value="waiting_client">En attente client</option>
                    <option value="assignable">À assigner</option>
                    <option value="assigned">Assigné</option>
                    <option value="in_progress">En cours</option>
                    <option value="collecting_documents">
                      Collecte documents
                    </option>
                    <option value="under_review">En vérification</option>
                    <option value="to_complete">À compléter</option>
                    <option value="generated">Généré</option>
                    <option value="compliant">Conforme</option>
                    <option value="archived">Archivé</option>
                  </select>

                  <SubmitButton
                    label="Enregistrer"
                    pendingLabel="Enregistrement..."
                  />
                </form>
              </SelenCard>
            ) : null}

            <div style={{ order: isNdaDossier ? -1 : 501 }}>
              <AgentMessagingDrawer
                dossierId={dossier.id}
                initialMessages={(dossierMessages ?? []) as MessageRow[]}
                hasUnread={hasUnread}
                unreadCount={unreadCount}
              />
            </div>

            <NdaPhaseOrCollapsed
              isNdaDossier={isNdaDossier}
              dossierId={dossier.id}
              phaseKey="program_analysis"
              phaseIndex={1}
              activePhaseIndex={activeNdaPhaseIndex}
              showFuturePhases={showAllNdaPhases}
              validationWarning={ndaPhaseWarnings.program_analysis}
              phaseTitle="Analyse du programme"
              phaseSubtitle="Analysez, ajustez et suivez la validation du programme de formation."
              collapsed={shouldCondenseNdaHistory}
              title="Historique — analyse et validation du programme"
            >
              {dossier.type === "nda" ? (
                <SelenCard>
                  <SelenCardTitle>Textes exploitables pour l'analyse</SelenCardTitle>
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--selen-text3)",
                      lineHeight: 1.5,
                      margin: "0 0 12px",
                    }}
                  >
                    À utiliser après avoir classé les documents initiaux et
                    complété les textes exploitables du CV et du programme. Les
                    documents administratifs non extractibles, comme l’avis
                    INSEE, peuvent être vérifiés manuellement.
                  </p>
                  <NdaManualAnalysisTextCard
                    dossierId={dossier.id}
                    cvInitialText={analysisCvInitialText}
                    programInitialText={analysisProgramInitialText}
                    cvAutoTextLength={analysisCvAutoText.length}
                    programAutoTextLength={analysisProgramAutoText.length}
                  />
                  {canRunAutoAnalysis ? (
                    <div style={{ marginTop: 12 }}>
                      {administrativeIdentityWarning ? (
                        <div
                          style={{
                            border: "1px solid rgba(212, 159, 63, 0.35)",
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(212, 159, 63, 0.1)",
                            color: "var(--selen-warning)",
                            padding: "9px 10px",
                            fontSize: 12,
                            lineHeight: 1.45,
                            marginBottom: 10,
                          }}
                        >
                          {administrativeIdentityWarning}
                        </div>
                      ) : null}
                      <AnalyzeNdaButton dossierId={dossier.id} />
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 12,
                        border: "1px solid rgba(212, 159, 63, 0.35)",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(212, 159, 63, 0.1)",
                        color: "var(--selen-warning)",
                        padding: "9px 10px",
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      L'analyse sera disponible lorsqu'un CV formateur et un
                      programme de formation seront rattaches au dossier.
                    </div>
                  )}
                  <div style={{ marginTop: 14 }}>
                    <AnalyzeProgramButton
                      dossierId={dossier.id}
                      initialAnalysis={latestProgramAnalysis}
                    />
                  </div>
                </SelenCard>
              ) : null}

              {latestClientDecision ? (
                <SelenCard>
                  <SelenCardTitle>
                    Retour du client sur le programme
                  </SelenCardTitle>

                  <div style={{ fontSize: 13, color: "var(--selen-text)" }}>
                    <strong>Décision :</strong>{" "}
                    {latestClientDecision.client_decision === "validated"
                      ? "Programme validé"
                      : "Programme refusé / à corriger"}
                  </div>
                </SelenCard>
              ) : null}

              {dossier.type === "nda" ? (
                <AgentProgramEditor
                  dossierId={dossier.id}
                  initialAnalysis={latestProgramAnalysis}
                  initialVersion={latestProgramVersion}
                />
              ) : null}
            </NdaPhaseOrCollapsed>

            {isNdaDossier ? (
              <div
                style={{
                  order: getNdaPhaseDisplayOrder(4, activeNdaPhaseIndex),
                }}
              >
                <NdaWorkflowPhaseCard
                  dossierId={dossier.id}
                  phaseKey="ready_for_deposit"
                  phaseIndex={4}
                  activePhaseIndex={activeNdaPhaseIndex}
                  showFuturePhases={showAllNdaPhases}
                  validationWarning={ndaPhaseWarnings.ready_for_deposit}
                  title="Suivi du dépôt NDA"
                  subtitle="Suivez le dépôt officiel, le retour DREETS, un éventuel refus ou l’obtention du NDA."
                >
                  <SelenCard>
                    <SelenCardTitle>Suivi du dépôt officiel</SelenCardTitle>
                    {ndaAgentWorkflowState.currentStep >= 6 ? (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--selen-text3)",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        Toutes les pièces finales attendues sont validées. Le
                        dossier est prêt pour la procédure officielle de dépôt
                        NDA.
                      </p>
                    ) : (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--selen-text3)",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        Cette phase s’ouvrira lorsque les retours signés auront
                        été reçus et validés.
                      </p>
                    )}

                    <div style={{ marginTop: 14 }}>
                      <NdaDepositFollowUpCard
                        dossierId={dossier.id}
                        dossierStatus={displayDossierStatus}
                        initialValues={ndaVariablesInitialValues}
                        hasDreetsRefusalLetter={hasDreetsRefusalLetter}
                        mode="followup"
                      />
                    </div>
                  </SelenCard>
                </NdaWorkflowPhaseCard>
              </div>
            ) : null}

            {isNdaDossier && !showAllNdaPhases ? (
              <NdaFuturePhasesSummary activePhaseIndex={activeNdaPhaseIndex} />
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SelenCard>
              <SelenCardTitle>Agent assigné</SelenCardTitle>

              {assignedAgent ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0f0c08",
                      flexShrink: 0,
                    }}
                  >
                    {assignedAgentDisplayName
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--selen-text)",
                      }}
                    >
                      {assignedAgentDisplayName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--selen-text3)",
                        marginTop: 1,
                      }}
                    >
                      {assignedAgent.role === "admin"
                        ? "Admin · assignable"
                        : "Agent Qualiopi"}
                    </div>
                  </div>
                </div>
              ) : (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text3)",
                    marginBottom: 12,
                  }}
                >
                  Aucun agent assigné
                </p>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {[
                  { val: `${docsReceived}/${docsTotal}`, label: "Docs reçus" },
                  { val: "5j", label: "Délai moyen" },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--font-display)",
                        fontSize: 20,
                        fontWeight: 600,
                        color: "var(--selen-gold2)",
                      }}
                    >
                      {s.val}
                    </span>
                    <div
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--selen-text3)",
                        marginTop: 2,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: "var(--selen-text3)" }}>
                Créé le{" "}
                {new Date(dossier.created_at).toLocaleDateString("fr-FR")} · Mis
                à jour le{" "}
                {new Date(dossier.updated_at).toLocaleDateString("fr-FR")}
              </div>
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Assigner un agent</SelenCardTitle>
              <form
                action={updateAssignment}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="dossier_id" value={dossier.id} />
                <select
                  name="agent_id"
                  defaultValue={assignedAgent?.id ?? ""}
                  style={{
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                >
                  <option value="">Aucun agent</option>
                  {agents?.map((agent) => {
                    const displayName =
                      [agent.first_name, agent.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                      agent.email ||
                      "Agent sans nom";

                    return (
                      <option key={agent.id} value={agent.id}>
                        {displayName} ·{" "}
                        {agent.role === "admin" ? "Admin" : "Agent"}
                      </option>
                    );
                  })}
                </select>

                <SubmitButton
                  label="Enregistrer l’assignation"
                  pendingLabel="Enregistrement..."
                />
              </form>
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Lien client</SelenCardTitle>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {isPreauditDossier
                    ? "Envoyez ce lien au client pour accéder à son espace préaudit."
                    : isReviewDossier
                      ? "Envoyez ce lien au client pour accéder à son espace audit blanc Review."
                      : "Envoyez ce lien au client pour qu’il puisse compléter ses informations essentielles et déposer ses documents."}
                </p>

                <input
                  value={resolvedClientUrl}
                  readOnly
                  style={{
                    width: "100%",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 10px",
                    color: "var(--selen-text)",
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                />
              </div>
            </SelenCard>

            {isReviewDossier ? (
              <SelenCard>
                <SelenCardTitle>Review</SelenCardTitle>

                {reviewCase ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Cette fiche dossier est reliée à un audit blanc Review.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Statut
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {formatReviewStatus(
                            reviewCase.status,
                            reviewCase.report_status,
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Rapport
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {formatReviewReportStatus(reviewCase.report_status)}
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/agent/audits-blancs/${reviewCase.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: "var(--radius-sm)",
                        padding: "9px 12px",
                        background:
                          "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
                        color: "#0f0c08",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Ouvrir la fiche Review →
                    </Link>
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--selen-text3)",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    Aucun audit blanc Review n’est encore relié à ce dossier.
                  </p>
                )}
              </SelenCard>
            ) : null}

            {isPreauditDossier ? (
              <SelenCard>
                <SelenCardTitle>Synthèse préaudit client</SelenCardTitle>

                {preauditSession ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Statut
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditSession.status ?? "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Audit
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditSession.audit_type ?? "Non renseigné"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Nouvel entrant
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditSession.is_new_entrant ? "Oui" : "Non"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Indicateurs
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditApplicableCount} applicables
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Exclus
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditExcludedCount}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Réponses indicateurs
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditIndicatorAnswerCount}
                        </div>
                      </div>
                    </div>

                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Dernière mise à jour :{" "}
                      {new Date(
                        preauditSession.updated_at ??
                          preauditSession.created_at,
                      ).toLocaleDateString("fr-FR")}
                    </p>

                    <Link
                      href={`/agent/dossiers/${dossier.id}/preaudit`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: "var(--radius-sm)",
                        padding: "9px 12px",
                        background:
                          "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
                        color: "#0f0c08",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Voir la synthèse préaudit →
                    </Link>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Aucune session préaudit n’a été retrouvée pour l’email de
                      cette organisation.
                    </p>

                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Email recherché : {organisation?.email ?? "—"}
                    </p>
                  </div>
                )}
              </SelenCard>
            ) : null}

            <SelenCard>
              <SelenCardTitle>Historique</SelenCardTitle>
              {historyEntries.length ? (
                <DossierHistorique entries={historyEntries} />
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Aucun historique réel enregistré pour le moment.
                </p>
              )}
            </SelenCard>
            <SelenCard>
              <SelenCardTitle>Zone danger</SelenCardTitle>

              <p
                style={{
                  fontSize: 12,
                  color: "var(--selen-text3)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                Cette action archive le dossier. Il ne sera plus considéré comme
                un dossier actif, mais les données restent conservées.
              </p>

              <form
                action={archiveDossier}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <input type="hidden" name="dossier_id" value={dossier.id} />

                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--selen-text3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Tapez ARCHIVER pour confirmer
                </label>

                <input
                  name="confirmation"
                  placeholder="ARCHIVER"
                  style={{
                    width: "100%",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />

                <SubmitButton
                  label="Archiver ce dossier"
                  pendingLabel="Archivage..."
                />
              </form>
            </SelenCard>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "20px 0 16px",
            opacity: 0.35,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background:
                "linear-gradient(to right, transparent, var(--selen-gold))",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              transform: "rotate(45deg)",
              background: "var(--selen-gold)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 1,
              background:
                "linear-gradient(to left, transparent, var(--selen-gold))",
            }}
          />
        </div>

        <SelenCard>
          <SelenCardTitle>Organisation cliente</SelenCardTitle>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
            }}
          >
            {[
              { label: "Nom", value: organisation?.name },
              { label: "SIRET", value: organisation?.siret },
              {
                label: "N° NDA",
                value: organisation?.nda_number,
                accent: true,
              },
              { label: "Email", value: organisation?.email, info: true },
              { label: "Téléphone", value: organisation?.phone },
              { label: "Adresse", value: organisation?.address },
            ].map((field) => (
              <div key={field.label}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--selen-text3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 4,
                  }}
                >
                  {field.label}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: field.accent
                      ? "var(--selen-gold2)"
                      : field.info
                        ? "var(--selen-info)"
                        : "var(--selen-text)",
                    fontWeight: field.accent ? 500 : 400,
                  }}
                >
                  {field.value ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </SelenCard>
      </div>
    </main>
  );
}
