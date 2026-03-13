export type NdaPhase = 1 | 2;

export type NdaDocumentKey =
  | "cv_formateur"
  | "programme_formation"
  | "avis_insee"
  | "diplomes_formateur_principal"
  | "questionnaire_nda"
  | "convention_signee"
  | "liste_formateurs_signee"
  | "kbis"
  | "statut_activite_formation_adulte"
  | "casier_judiciaire_n3";

export type NdaChecklistItem = {
  key: NdaDocumentKey;
  label: string;
  phase: NdaPhase;
};

export const NDA_CHECKLIST: NdaChecklistItem[] = [
  // PHASE 1
  { key: "cv_formateur", label: "CV du formateur", phase: 1 },
  { key: "programme_formation", label: "Programme de formation", phase: 1 },
  { key: "avis_insee", label: "Avis INSEE", phase: 1 },
  {
    key: "diplomes_formateur_principal",
    label: "Diplômes du formateur principal",
    phase: 1,
  },
  { key: "questionnaire_nda", label: "Questionnaire NDA", phase: 1 },

  // PHASE 2
  { key: "convention_signee", label: "Convention signée", phase: 2 },
  {
    key: "liste_formateurs_signee",
    label: "Liste des formateurs signée",
    phase: 2,
  },
  { key: "kbis", label: "Extrait KBIS", phase: 2 },
  {
    key: "statut_activite_formation_adulte",
    label: "Statut activité formation adulte",
    phase: 2,
  },
  { key: "casier_judiciaire_n3", label: "Casier judiciaire n°3", phase: 2 },
];
