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
