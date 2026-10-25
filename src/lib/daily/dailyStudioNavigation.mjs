/** Navigation métier Daily : aucune lecture, mutation ou élargissement de droits. */
export const DAILY_STUDIO_NAV_GROUPS = [
  { label: "Pilotage", links: [
    { href: "/agent/daily", label: "Pilotage Daily" },
    { href: "/agent/daily/planning", label: "Planning sessions" },
    { href: "/agent/daily/escalations", label: "Escalades admin", priority: true },
  ] },
  { label: "Dossiers", links: [
    { href: "/agent/daily/organisations", label: "Organismes" },
    { href: "/agent/daily/candidatures", label: "Dossiers d’inscription" },
    { href: "/agent/daily/satisfaction", label: "Satisfaction" },
    { href: "/agent/daily/preaudit", label: "Pré-audit" },
  ] },
  { label: "Qualité et outils", links: [
    { href: "/agent/daily/qualite", label: "Veille & Qualité" },
    { href: "/agent/daily/veille-proposee", label: "Propositions de veille", priority: true },
    { href: "/agent/daily/generateur-formation", label: "Générateur formation", ownerOnly: true },
  ] },
];

export function dailyStudioNavigationSections(isOwner) {
  return DAILY_STUDIO_NAV_GROUPS.map(group => ({
    ...group,
    links: group.links.filter(link => !link.ownerOnly || isOwner === true),
  })).filter(group => group.links.length > 0);
}

export function isDailyStudioNavLinkActive(pathname, href) {
  if (typeof pathname !== "string" || typeof href !== "string") return false;
  if (href === "/agent/daily") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}
