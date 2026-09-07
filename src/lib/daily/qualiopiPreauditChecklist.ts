export type QualiopiPreauditChecklistItem = {
  indicators: string;
  evidence: string[];
  scope?: string;
  upcomingRequirement?: {
    effectiveFrom: string;
    reference: string;
    evidence: string[];
  };
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
    upcomingRequirement: {
      effectiveFrom: "2026-11-01",
      reference: "Décret n° 2026-728 du 1er août 2026",
      evidence: [
        "Procédure couvrant la prévention et le traitement des violences, dont les violences sexistes et sexuelles, du harcèlement et des discriminations dans le cadre de la formation",
      ],
    },
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
    upcomingRequirement: {
      effectiveFrom: "2026-11-01",
      reference: "Décret n° 2026-728 du 1er août 2026",
      evidence: [
        "Pour les modules réalisés à distance : preuve vérifiable de l’effectivité du suivi par chaque apprenant",
        "Si le seuil d’intervenants fixé par arrêté est dépassé : référent pédagogique identifié pour la formation et preuve de coordination pédagogique",
      ],
    },
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
    upcomingRequirement: {
      effectiveFrom: "2026-11-01",
      reference: "Décret n° 2026-728 du 1er août 2026",
      evidence: [
        "Contrat de sous-traitance ou pièce contractuelle associée à l’ordre de mission assurant la traçabilité du respect du référentiel national qualité",
      ],
    },
  },
  {
    indicators: "30",
    evidence: ["Procédure satisfaction", "Questionnaires complétés par les parties prenantes"],
  },
  {
    indicators: "31 / 32",
    evidence: ["Tableaux d’amélioration", "Traitement des difficultés"],
    upcomingRequirement: {
      effectiveFrom: "2026-11-01",
      reference: "Décret n° 2026-728 du 1er août 2026",
      evidence: [
        "Analyse documentée des risques pesant sur la qualité des formations délivrées",
        "Lien traçable entre risques identifiés, appréciations, réclamations et actions d’amélioration continue",
      ],
    },
  },
  {
    indicators: "33",
    scope: "Apprentissage uniquement (actions mentionnées au 4° de l’article L. 6313-1 du code du travail)",
    evidence: [],
    upcomingRequirement: {
      effectiveFrom: "2026-11-01",
      reference: "Décret n° 2026-728 du 1er août 2026",
      evidence: [
        "Évaluation des contenus et des enseignements par les apprentis, distincte du questionnaire général de satisfaction",
        "Résultats partagés avec les équipes pédagogiques",
        "Démarche d’amélioration continue formalisée à partir des résultats et mesure périodique de son efficacité",
      ],
    },
  },
];

export const QUALIOPI_PREAUDIT_PRINCIPLES = {
  reuseEvidence: "Pointer vers les preuves existantes plutôt que les dupliquer.",
  flagGaps: "Signaler les pièces absentes, périmées, non signées ou à vérifier.",
  regulatoryReadiness: "Les exigences futures sont affichées comme éléments à anticiper jusqu’à leur date d’entrée en vigueur, sans les confondre avec les exigences applicables au jour du pré-audit.",
  scopedRequirements: "Respecter le périmètre d’application de chaque indicateur et ne pas réclamer une preuve à un organisme non concerné.",
  selionRole: "Sélion peut effectuer un premier pré-check automatique, sans valider à la place de l’agent.",
  agentRole: "La validation finale du pré-audit reste sous la responsabilité de l’agent.",
  auditLive: "La même source de vérité doit pouvoir être réutilisée par le futur audit live.",
} as const;
