export const NDA_DOCUMENT_TYPE_OPTIONS = [
  { value: "cv_formateur", label: "CV du formateur" },
  { value: "programme_formation", label: "Programme de formation" },
  { value: "programme_formation_signe", label: "Programme de formation signé" },
  { value: "convention_formation", label: "Convention de formation" },
  { value: "avis_insee", label: "Avis INSEE" },
  {
    value: "diplomes_formateur_principal",
    label: "Diplômes du formateur principal",
  },
  { value: "convention_signee", label: "Convention signée" },
  {
    value: "liste_formateurs_signee",
    label: "Liste des formateurs signée",
  },
  { value: "kbis", label: "Extrait KBIS" },
  {
    value: "statut_activite_formation_adulte",
    label: "Statut activité formation adulte",
  },
  { value: "casier_judiciaire_n3", label: "Casier judiciaire n°3" },
] as const;

export type NdaDocumentType =
  (typeof NDA_DOCUMENT_TYPE_OPTIONS)[number]["value"];

export const NDA_LEGACY_DOCUMENT_TYPES = ["questionnaire_nda"] as const;

export type NdaLegacyDocumentType =
  (typeof NDA_LEGACY_DOCUMENT_TYPES)[number];

export const NDA_DOCUMENT_ROLE_OPTIONS = [
  "initial_client_document",
  "agent_uploaded_document",
  "generated_document",
  "client_to_complete",
  "client_returned_document",
  "supporting_evidence",
  "internal_working_file",
  "final_validated_file",
  "maf_procedure",
  "dreets_complement_request",
  "dreets_refusal_letter",
  "corrected_after_refusal",
] as const;

export type NdaDocumentRole = (typeof NDA_DOCUMENT_ROLE_OPTIONS)[number];

export const NDA_DOCUMENT_REVIEW_STATUS_OPTIONS = [
  "not_reviewed",
  "pending_client",
  "received",
  "to_correct",
  "validated",
  "rejected",
  "archived",
  "superseded",
] as const;

export type NdaDocumentReviewStatus =
  (typeof NDA_DOCUMENT_REVIEW_STATUS_OPTIONS)[number];

const NDA_DOCUMENT_TYPE_ALIASES: Record<string, NdaDocumentType> = {
  diplome_formateur: "diplomes_formateur_principal",
  casier_judiciaire: "casier_judiciaire_n3",
  programme: "programme_formation",
  programme_signe: "programme_formation_signe",
  programme_formation_signee: "programme_formation_signe",
  programme_client: "programme_formation",
  programme_client_corrige: "programme_formation",
  programme_reformule: "programme_formation",
};

export function normalizeNdaDocumentType(
  documentType?: string | null,
): string {
  const normalized = documentType?.trim().toLowerCase();

  if (!normalized) {
    return "document_libre";
  }

  return NDA_DOCUMENT_TYPE_ALIASES[normalized] ?? normalized;
}

export function inferNdaDocumentRole(args: {
  documentRole?: string | null;
  source?: string | null;
}): NdaDocumentRole {
  if (
    args.documentRole &&
    NDA_DOCUMENT_ROLE_OPTIONS.includes(args.documentRole as NdaDocumentRole)
  ) {
    return args.documentRole as NdaDocumentRole;
  }

  if (args.source === "client_upload") {
    return "initial_client_document";
  }

  if (args.source === "generated") {
    return "generated_document";
  }

  return "agent_uploaded_document";
}

export function inferNdaDocumentReviewStatus(args: {
  reviewStatus?: string | null;
  status?: string | null;
  source?: string | null;
}): NdaDocumentReviewStatus {
  if (
    args.reviewStatus &&
    NDA_DOCUMENT_REVIEW_STATUS_OPTIONS.includes(
      args.reviewStatus as NdaDocumentReviewStatus,
    )
  ) {
    return args.reviewStatus as NdaDocumentReviewStatus;
  }

  if (args.status === "validated" || args.status === "signed") {
    return "validated";
  }

  if (args.status === "to_correct") {
    return "to_correct";
  }

  if (args.status === "archived") {
    return "archived";
  }

  if (args.source === "client_upload") {
    return "received";
  }

  return "not_reviewed";
}
