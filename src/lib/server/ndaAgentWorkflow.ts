import {
  inferNdaDocumentReviewStatus,
  inferNdaDocumentRole,
  normalizeNdaDocumentType,
} from "@/lib/ndaDocumentTypes";
import { hasNdaProgramDocumentContent } from "@/lib/server/ndaProgramDocumentHtml";

export type NdaWorkflowDocument = {
  id?: string | null;
  document_type?: string | null;
  document_role?: string | null;
  review_status?: string | null;
  status?: string | null;
  source?: string | null;
  is_visible_to_client?: boolean | null;
  requires_client_action?: boolean | null;
};

export type NdaWorkflowVariables = {
  client_nom?: string | null;
  client_adresse?: string | null;
  client_siret?: string | null;
  client_representant_prenom?: string | null;
  client_representant_nom?: string | null;
  stagiaire_prenom?: string | null;
  stagiaire_nom?: string | null;
  stagiaire_fonction?: string | null;
  stagiaire_email?: string | null;
  date_formation_prevue?: string | null;
  date_fin_formation?: string | null;
  lieu_formation?: string | null;
  lieu_signature_convention?: string | null;
  date_signature_convention?: string | null;
};

export type NdaWorkflowProgramVersion = {
  version_type?: string | null;
  status?: string | null;
  client_decision?: string | null;
  modules?: unknown;
  title?: string | null;
  target_audience?: string | null;
  overall_objective?: string | null;
} | null;

export type NdaWorkflowStatusTone =
  | "neutral"
  | "info"
  | "warn"
  | "danger"
  | "success"
  | "status";

export const NDA_AGENT_WORKFLOW_STEPS = [
  { label: "Dépôt\ninitial" },
  { label: "Analyse\nprogramme" },
  { label: "Coordonnées\nclient" },
  { label: "Documents\nà signer" },
  { label: "Retours\nsignés" },
  { label: "Contrôle\nfinal" },
  { label: "Prêt\ndépôt NDA" },
];

export const NDA_FINAL_REQUIRED_DOCUMENT_TYPES = [
  "convention_signee",
  "programme_formation_signe",
  "diplomes_formateur_principal",
  "casier_judiciaire_n3",
  "statut_activite_formation_adulte",
];

export const NDA_FINAL_OPTIONAL_DOCUMENT_TYPES = ["liste_formateurs_signee"];

export const NDA_FINAL_DOCUMENT_LABELS: Record<string, string> = {
  convention_signee: "Convention de formation signée",
  programme_formation_signe: "Programme de formation signé",
  diplomes_formateur_principal:
    "Copies des diplômes / attestations de formation",
  casier_judiciaire_n3: "Casier judiciaire n°3",
  statut_activite_formation_adulte:
    "Justificatif / statut activité de formation adulte",
  liste_formateurs_signee: "Liste des formateurs signée",
};

function hasValue(value: unknown) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function getNdaFinalDocumentLabel(documentType: string) {
  return NDA_FINAL_DOCUMENT_LABELS[documentType] ?? documentType;
}

export function isNdaFinalReturnedDocument(doc: NdaWorkflowDocument) {
  const role = inferNdaDocumentRole({
    documentRole: doc.document_role,
    source: doc.source,
  });
  const documentType = normalizeNdaDocumentType(doc.document_type);

  return (
    role === "client_returned_document" &&
    [
      ...NDA_FINAL_REQUIRED_DOCUMENT_TYPES,
      ...NDA_FINAL_OPTIONAL_DOCUMENT_TYPES,
    ].includes(documentType)
  );
}

export function isNdaGeneratedSigningDocument(doc: NdaWorkflowDocument) {
  const documentType = normalizeNdaDocumentType(doc.document_type);

  return (
    doc.document_role === "client_to_complete" &&
    doc.review_status === "pending_client" &&
    doc.is_visible_to_client === true &&
    doc.requires_client_action === true &&
    ["programme_formation", "convention_formation"].includes(documentType)
  );
}

export function hasNdaRequiredVariables(
  variables: NdaWorkflowVariables | null,
) {
  if (!variables) return false;

  return Boolean(
    variables.client_nom &&
      variables.client_adresse &&
      variables.client_siret &&
      variables.client_representant_prenom &&
      variables.client_representant_nom &&
      variables.stagiaire_prenom &&
      variables.stagiaire_nom &&
      variables.stagiaire_fonction &&
      variables.stagiaire_email &&
      variables.date_formation_prevue &&
      variables.lieu_formation &&
      variables.lieu_signature_convention &&
      variables.date_signature_convention &&
      (!("date_fin_formation" in variables) ||
        hasValue(variables.date_fin_formation)),
  );
}

export function getNdaAgentWorkflowState(args: {
  documents: NdaWorkflowDocument[];
  variables: NdaWorkflowVariables | null;
  latestProgramVersion: NdaWorkflowProgramVersion;
}) {
  const initialClientDocuments = args.documents.filter(
    (doc) =>
      inferNdaDocumentRole({
        documentRole: doc.document_role,
        source: doc.source,
      }) === "initial_client_document",
  );
  const initialReceivedKeys = Array.from(
    new Set(
      initialClientDocuments.map((doc) =>
        normalizeNdaDocumentType(doc.document_type),
      ),
    ),
  );
  const initialDepositComplete =
    initialReceivedKeys.includes("cv_formateur") &&
    initialReceivedKeys.includes("programme_formation") &&
    (initialReceivedKeys.includes("avis_insee") ||
      initialReceivedKeys.includes("kbis"));
  const programReady = Boolean(
    args.latestProgramVersion &&
      hasNdaProgramDocumentContent(args.latestProgramVersion),
  );
  const latestProgramVersionType = args.latestProgramVersion?.version_type ?? null;
  const latestProgramDecision = args.latestProgramVersion?.client_decision ?? null;
  const latestProgramStatus = args.latestProgramVersion?.status ?? null;
  const isProgramSentToClient =
    latestProgramVersionType === "client_sent" ||
    latestProgramStatus === "sent" ||
    latestProgramStatus === "pending_client";
  const isProgramPendingClientDecision =
    programReady &&
    isProgramSentToClient &&
    !latestProgramDecision &&
    latestProgramStatus !== "validated_by_client" &&
    latestProgramStatus !== "refused_by_client";
  const isProgramRefusedByClient =
    latestProgramDecision === "refused" ||
    latestProgramStatus === "refused_by_client";
  const isProgramValidatedByClient =
    latestProgramDecision === "validated" ||
    latestProgramStatus === "validated_by_client";
  const variablesReady = hasNdaRequiredVariables(args.variables);
  const generatedSigningDocuments = args.documents.filter(
    isNdaGeneratedSigningDocument,
  );
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
  const finalReturnedDocuments = args.documents.filter(
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
  const finalStatuses = finalReturnedDocuments.map((doc) =>
    inferNdaDocumentReviewStatus({
      reviewStatus: doc.review_status,
      status: doc.status,
      source: doc.source,
    }),
  );
  const hasCorrections = finalStatuses.some(
    (status) => status === "to_correct" || status === "rejected",
  );
  const allFinalReceived = missingFinalRequiredTypes.length === 0;
  const allFinalValidated =
    allFinalReceived &&
    finalReturnedDocuments.length >= NDA_FINAL_REQUIRED_DOCUMENT_TYPES.length &&
    finalStatuses.every((status) => status === "validated");

  if (!initialDepositComplete) {
    return {
      currentStep: 0,
      statusLabel: "Dépôt initial attendu",
      actionLabel: "Le client doit déposer les pièces initiales.",
      agentStatusDescription: "Le dossier attend encore le dépôt initial client.",
      statusTone: "info" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "collecting_documents",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (!programReady) {
    return {
      currentStep: 1,
      statusLabel: "Programme à analyser",
      actionLabel: "L'agent doit analyser ou préparer le programme.",
      agentStatusDescription: "Le dossier est côté agent pour analyse du programme.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (isProgramRefusedByClient) {
    return {
      currentStep: 1,
      statusLabel: "Correction programme a traiter",
      actionLabel: "Le client a demande une correction du programme.",
      agentStatusDescription:
        "Le client a refuse la proposition de programme. L'agent doit relire le retour et preparer une nouvelle proposition.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (isProgramPendingClientDecision) {
    return {
      currentStep: 1,
      statusLabel: "Validation programme client attendue",
      actionLabel: "Le client doit valider ou refuser le programme propose.",
      agentStatusDescription:
        "La proposition de programme a ete transmise au client et attend sa decision.",
      statusTone: "warn" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "program_sent_to_client",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (!isProgramValidatedByClient) {
    return {
      currentStep: 1,
      statusLabel: "Programme a transmettre au client",
      actionLabel: "L'agent doit envoyer la proposition de programme au client.",
      agentStatusDescription:
        "Le programme est pret cote agent, mais il n'a pas encore ete valide par le client.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (isProgramValidatedByClient && !variablesReady) {
    return {
      currentStep: 2,
      statusLabel: "Coordonnées client attendues",
      actionLabel: "Compléter les informations de préparation NDA.",
      agentStatusDescription:
        "Les informations client et stagiaire nécessaires sont attendues.",
      statusTone: "warn" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "waiting_client",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (!signingDocumentsGenerated) {
    return {
      currentStep: 3,
      statusLabel: "Documents à signer à préparer",
      actionLabel: "Préparer le pack à signer pour le client.",
      agentStatusDescription:
        "Le contexte est prêt, le pack de documents doit être préparé côté agent.",
      statusTone: "status" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "under_review",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
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
      finalReturnedDocuments,
      missingFinalRequiredTypes,
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
      finalReturnedDocuments,
      missingFinalRequiredTypes,
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
      finalReturnedDocuments,
      missingFinalRequiredTypes,
    };
  }

  if (finalReturnedDocuments.length > 0) {
    return {
      currentStep: 4,
      statusLabel: "Documents finaux partiellement reçus",
      actionLabel: "Attendre les pièces manquantes ou relancer le client.",
      agentStatusDescription:
        "Une partie des pièces finales est reçue, mais le dossier reste incomplet.",
      statusTone: "info" satisfies NdaWorkflowStatusTone,
      targetDossierStatus: "collecting_documents",
      finalReturnedDocuments,
      missingFinalRequiredTypes,
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
    finalReturnedDocuments,
    missingFinalRequiredTypes,
  };
}

export async function syncNdaDossierStatus(args: {
  admin: {
    from: (table: string) => any;
  };
  dossierId: string;
  currentStatus?: string | null;
  targetStatus: string;
}) {
  if (!args.targetStatus || args.currentStatus === args.targetStatus) {
    return { updated: false, status: args.currentStatus ?? null };
  }

  const { error } = await args.admin
    .from("dossiers")
    .update({ status: args.targetStatus })
    .eq("id", args.dossierId);

  if (error) {
    throw new Error(error.message);
  }

  return { updated: true, status: args.targetStatus };
}
