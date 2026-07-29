import type { Mission, ValidationItem } from "./types";

const validationLabels = [
  "La page s’ouvre correctement",
  "L’affichage mobile est correct",
  "L’affichage desktop est correct",
  "La création fonctionne",
  "La modification fonctionne",
  "La suppression fonctionne",
  "Le style correspond à Selen",
  "Le fonctionnement respecte le cahier des charges",
  "Aucun parcours existant ne semble cassé",
];

function checklist(checkedCount: number): ValidationItem[] {
  return validationLabels.map((label, index) => ({
    id: `check-${index + 1}`,
    label,
    checked: index < checkedCount,
    result: index < checkedCount ? "compliant" : null,
  }));
}

export const forgeAgents = [
  {
    id: "cody",
    name: "Cody",
    role: "Agent développeur",
    status: "En cours",
    description:
      "Transforme les cahiers des charges de Selen en fonctionnalités testables.",
    href: "/agent/forge/cody",
    active: true,
  },
  {
    id: "selion",
    name: "Sélion",
    role: "Superviseur des agents",
    status: "Bientôt disponible",
    description: "Coordonnera les agents et orchestrera leurs futures missions.",
    active: false,
  },
  {
    id: "plum",
    name: "Plum",
    role: "Veille et rédaction",
    status: "Bientôt disponible",
    description: "Assurera la veille, la synthèse et la rédaction éditoriale.",
    active: false,
  },
] as const;

export const initialMissions: Mission[] = [
  {
    id: "weekly-view",
    title: "Créer la vue hebdomadaire",
    project: "Selen Studio · Planning",
    description: "Rassembler les rendez-vous et échéances dans une vue claire.",
    createdAt: "2026-07-27T09:20:00+02:00",
    priority: "high",
    status: "to_review",
    progress: 100,
    objective:
      "Donner à Lil une lecture immédiate de la semaine et des actions à venir.",
    scope: [
      "Vue des sept prochains jours",
      "Cartes rendez-vous et échéances",
      "Adaptation mobile et desktop",
    ],
    announcedResult:
      "La vue est construite, le build est valide et une vérification utilisateur est attendue.",
    branch: "feature/weekly-planning",
    previewUrl: "https://example.com/preview/weekly-planning",
    lastVerifiedAt: "2026-07-28T16:45:00+02:00",
    checklist: checklist(4),
    corrections: [],
    activities: [
      { id: "a1", occurredAt: "2026-07-27T09:20:00+02:00", type: "mission_received", message: "Mission lancée : création de la vue hebdomadaire" },
      { id: "a2", occurredAt: "2026-07-27T10:05:00+02:00", type: "analysis", message: "Analyse de la structure existante terminée" },
      { id: "a3", occurredAt: "2026-07-27T14:30:00+02:00", type: "development", message: "Composants principaux créés" },
      { id: "a4", occurredAt: "2026-07-28T09:40:00+02:00", type: "correction", message: "Erreurs TypeScript corrigées" },
      { id: "a5", occurredAt: "2026-07-28T11:10:00+02:00", type: "build", message: "Build terminé avec succès" },
      { id: "a6", occurredAt: "2026-07-28T11:25:00+02:00", type: "deployment", message: "Preview Vercel disponible" },
      { id: "a7", occurredAt: "2026-07-28T11:30:00+02:00", type: "test", message: "En attente de vérification utilisateur", status: "to_review" },
    ],
  },
  {
    id: "forge-cody",
    title: "Installer l’espace de Cody",
    project: "Selen Studio · La Forge",
    description: "Créer le centre de suivi manuel des missions du premier agent.",
    createdAt: "2026-07-29T10:00:00+02:00",
    priority: "urgent",
    status: "in_progress",
    progress: 68,
    objective: "Poser les fondations visuelles et fonctionnelles de La Forge.",
    scope: ["Accueil de La Forge", "Espace Cody", "Suivi local des validations"],
    announcedResult: "Développement en cours, sans connexion à un service externe.",
    branch: "feature/forge-cody-ui",
    checklist: checklist(2),
    corrections: [],
    activities: [
      { id: "b1", occurredAt: "2026-07-29T10:00:00+02:00", type: "mission_received", message: "Mission reçue et cadrée" },
      { id: "b2", occurredAt: "2026-07-29T11:15:00+02:00", type: "analysis", message: "Conventions de Selen Studio analysées" },
      { id: "b3", occurredAt: "2026-07-29T14:10:00+02:00", type: "development", message: "Construction des écrans de La Forge" },
    ],
  },
  {
    id: "client-card",
    title: "Affiner la fiche client",
    project: "Selen Studio · Clients",
    description: "Clarifier les informations et actions principales d’un client.",
    createdAt: "2026-07-22T08:30:00+02:00",
    priority: "normal",
    status: "validated",
    progress: 100,
    objective: "Rendre la fiche client plus rapide à parcourir.",
    scope: ["Hiérarchie des informations", "Actions principales"],
    announcedResult: "Mission vérifiée et validée par Lil.",
    lastVerifiedAt: "2026-07-24T15:30:00+02:00",
    checklist: checklist(9),
    corrections: [],
    activities: [
      { id: "c1", occurredAt: "2026-07-22T08:30:00+02:00", type: "mission_received", message: "Mission reçue" },
      { id: "c2", occurredAt: "2026-07-24T15:30:00+02:00", type: "completed", message: "Mission terminée et validée", status: "validated" },
    ],
  },
];

export const forgeRecentActivities = initialMissions
  .flatMap((mission) =>
    mission.activities.map((activity) => ({ ...activity, mission: mission.title })),
  )
  .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  .slice(0, 4);
