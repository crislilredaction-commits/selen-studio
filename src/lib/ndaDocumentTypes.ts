export const NDA_DOCUMENT_TYPE_OPTIONS = [
  { value: "cv_formateur", label: "CV du formateur" },
  { value: "programme_formation", label: "Programme de formation" },
  { value: "avis_insee", label: "Avis INSEE" },
  {
    value: "diplomes_formateur_principal",
    label: "Diplômes du formateur principal",
  },
  { value: "questionnaire_nda", label: "Questionnaire NDA" },
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

const NDA_DOCUMENT_TYPE_ALIASES: Record<string, NdaDocumentType> = {
  diplome_formateur: "diplomes_formateur_principal",
  casier_judiciaire: "casier_judiciaire_n3",
  programme: "programme_formation",
  programme_client: "programme_formation",
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
