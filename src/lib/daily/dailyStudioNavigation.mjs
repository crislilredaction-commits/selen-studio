/** Navigation métier Daily : cinq rubriques de référence, sans lecture ni écriture métier. */
export const DAILY_STUDIO_ADMIN_TOOLS = [
  { href: "/agent/daily/escalations", label: "Escalades administrateur", category: "Supervision", description: "Examiner les demandes d'arbitrage et les interventions prioritaires." },
  { href: "/agent/daily/communications", label: "Communications et preuves", category: "Supervision", description: "Retrouver les envois, leurs statuts et leurs justificatifs autorisés." },
  { href: "/agent/daily/preaudit", label: "Pré-audit Qualiopi", category: "Qualité", description: "Suivre les points à vérifier et les échéances des organismes." },
  { href: "/agent/daily/satisfaction", label: "Satisfaction", category: "Qualité", description: "Contrôler les réponses et identifier les relances utiles." },
  { href: "/agent/daily/qualite", label: "Veille & Qualité", category: "Qualité", description: "Consulter les veilles publiées et leur exploitation." },
  { href: "/agent/daily/veille-proposee", label: "Propositions de veille", category: "Qualité", description: "Examiner les nouvelles propositions avant publication." },
  { href: "/agent/daily/procedures-internes", label: "Procédures internes", category: "Qualité", description: "Retrouver les procédures et leurs dates de révision." },
  { href: "/agent/daily/revues-formateurs", label: "Bilans des formateurs", category: "Qualité", description: "Suivre les bilans annuels et les contributions manager." },
  { href: "/agent/daily/reclamations", label: "Réclamations et suggestions", category: "Qualité", description: "Traiter les retours et conserver leur historique." },
  { href: "/agent/daily/generateur-formation", label: "Générateur formation", category: "Outils", description: "Préparer les documents de formation.", ownerOnly: true },
];

export const DAILY_STUDIO_NAV_GROUPS = [
  { label: "Tableau de bord", links: [{ href: "/agent/daily", label: "Tableau de bord" }] },
  { label: "Organismes", links: [{ href: "/agent/daily/organisations", label: "Organismes" }] },
  { label: "Sessions", links: [{ href: "/agent/daily/planning", label: "Sessions" }], aliases: ["/agent/daily/suivi-sessions"] },
  { label: "Candidatures", links: [{ href: "/agent/daily/candidatures", label: "Candidatures" }] },
  { label: "Administration", links: [{ href: "/agent/daily/administration", label: "Administration" }], aliases: DAILY_STUDIO_ADMIN_TOOLS.map(tool => tool.href) },
];

export function dailyStudioNavigationSections(isOwner) {
  return DAILY_STUDIO_NAV_GROUPS.map(group => ({
    ...group,
    links: group.links.filter(link => !link.ownerOnly || isOwner === true),
  })).filter(group => group.links.length > 0);
}

export function dailyStudioAdministrationLinks(isOwner) {
  return DAILY_STUDIO_ADMIN_TOOLS.filter(tool => !tool.ownerOnly || isOwner === true);
}

export function isDailyStudioNavLinkActive(pathname, href) {
  if (typeof pathname !== "string" || typeof href !== "string") return false;
  if (href === "/agent/daily") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function isDailyStudioNavSectionActive(pathname, group) {
  if (!group || !Array.isArray(group.links)) return false;
  return group.links.some(link => isDailyStudioNavLinkActive(pathname, link.href))
    || (group.aliases || []).some(href => isDailyStudioNavLinkActive(pathname, href));
}
