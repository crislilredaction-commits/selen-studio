export type QualiopiPreauditChecklistItem = {
  indicators: string;
  evidence: string[];
};

/**
 * Source de vérité fonctionnelle de la checklist pré-audit Daily.
 *
 * Cette définition est volontairement indépendante de l'UI afin de pouvoir être
 * réutilisée plus tard par le pré-check Sélion et l'audit live sans dupliquer les
 * règles métier. La validation finale reste humaine.
 */
export const QUALIOPI_PREAUDIT_CHECKLIST: QualiopiPreauditChecklistItem[] = [
  {
    indicators: "1",
    evidence: [
      "Synthèse PDF avec programme intégré ou annexé et lien vers le dossier complet",
      "Livret d’accueil incluant la politique handicap",
      "Accès apprenant disponible",
    ],
  },
  {
    indicators: "2",
    evidence: ["Synthèse PDF avec programme comprenant les indicateurs"],
  },
  {
    indicators: "4 / 5",
    evidence: ["Synthèse PDF", "Fiche session"],
  },
  {
    indicators: "6 / 10",
    evidence: ["Déroulé pédagogique", "Ressources pédagogiques", "Convocation", "Fiche session"],
  },
  {
    indicators: "8",
    evidence: ["Synthèse PDF", "Fiche session", "Vérification des prérequis lorsqu’ils existent"],
  },
  {
    indicators: "9",
    evidence: ["Convocation disponible dans l’espace apprenant", "Livret d’accueil disponible dans l’espace apprenant"],
  },
  {
    indicators: "11",
    evidence: ["Évaluations"],
  },
  {
    indicators: "12",
    evidence: ["Émargements", "Procédure de gestion et prévention des absences et abandons"],
  },
  {
    indicators: "17",
    evidence: ["CV", "Moyens matériels", "Justificatifs des locaux", "Outils numériques"],
  },
  {
    indicators: "18",
    evidence: ["Organigramme", "Fiches de poste"],
  },
  {
    indicators: "19",
    evidence: ["Ressources disponibles dans les espaces apprenants"],
  },
  {
    indicators: "21",
    evidence: ["Formations suivies durant les 12 derniers mois", "CV des formateurs", "Diplômes des formateurs"],
  },
  {
    indicators: "22",
    evidence: ["Évaluations professionnelles", "Formations prévues"],
  },
  {
    indicators: "23 / 24 / 25",
    evidence: ["Tableaux de veille"],
  },
  {
    indicators: "26",
    evidence: ["Politique handicap", "Coordonnées des partenaires et ressources pertinents"],
  },
  {
    indicators: "27",
    evidence: ["Ordres de mission"],
  },
  {
    indicators: "30",
    evidence: ["Procédure satisfaction", "Questionnaires complétés par les parties prenantes"],
  },
  {
    indicators: "31 / 32",
    evidence: ["Tableaux d’amélioration", "Traitement des difficultés"],
  },
];

export const QUALIOPI_PREAUDIT_PRINCIPLES = {
  reuseEvidence: "Pointer vers les preuves existantes plutôt que les dupliquer.",
  flagGaps: "Signaler les pièces absentes, périmées, non signées ou à vérifier.",
  selionRole: "Sélion peut effectuer un premier pré-check automatique, sans valider à la place de l’agent.",
  agentRole: "La validation finale du pré-audit reste sous la responsabilité de l’agent.",
  auditLive: "La même source de vérité doit pouvoir être réutilisée par le futur audit live.",
} as const;
