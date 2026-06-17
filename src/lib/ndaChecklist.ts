import type { NdaDocumentType } from "@/lib/ndaDocumentTypes";

export type NdaPhase = 1 | 2;

export type NdaDocumentKey = NdaDocumentType;

export type NdaChecklistItem = {
  key: NdaDocumentKey;
  label: string;
  phase: NdaPhase;
  required?: boolean;
  helper?: string;
};

const NDA_NON_DOCUMENT_KEYS = ["questionnaire_nda"];

export const NDA_CHECKLIST: NdaChecklistItem[] = [
  // PHASE 1 - pieces utiles pour lancer l'analyse programme / CV
  { key: "cv_formateur", label: "CV du formateur", phase: 1, required: true },
  {
    key: "programme_formation",
    label: "Programme de formation",
    phase: 1,
    required: true,
  },
  {
    key: "avis_insee",
    label: "Avis INSEE / justificatif d’existence",
    phase: 1,
    required: true,
    helper:
      "À déposer si déjà disponible pour identifier l’organisme.",
  },

  // PHASE 2 - pieces finales retournees apres generation des documents a signer
  {
    key: "convention_signee",
    label: "Convention signée",
    phase: 2,
    required: true,
  },
  {
    key: "programme_formation_signe",
    label: "Programme de formation signé",
    phase: 2,
    required: true,
  },
  {
    key: "liste_formateurs_signee",
    label: "Liste des formateurs signée",
    phase: 2,
    required: true,
  },
  {
    key: "diplomes_formateur_principal",
    label: "Diplômes / preuves de compétences",
    phase: 2,
    required: true,
  },
  { key: "kbis", label: "Extrait KBIS", phase: 2, required: true },
  {
    key: "statut_activite_formation_adulte",
    label: "Statut activité formation adulte",
    phase: 2,
    required: true,
  },
  {
    key: "casier_judiciaire_n3",
    label: "Casier judiciaire n°3",
    phase: 2,
    required: true,
  },
];

export function getNdaDocumentChecklistItems() {
  return NDA_CHECKLIST.filter(
    (item) => !NDA_NON_DOCUMENT_KEYS.includes(item.key),
  );
}

export const NDA_REQUIRED_DOCUMENT_KEYS = getNdaDocumentChecklistItems().filter(
  (item) => item.required !== false,
).map((item) => item.key);
