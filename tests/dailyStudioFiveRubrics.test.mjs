import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DAILY_STUDIO_NAV_GROUPS, DAILY_STUDIO_ADMIN_TOOLS, dailyStudioNavigationSections, dailyStudioAdministrationLinks, isDailyStudioNavLinkActive, isDailyStudioNavSectionActive } from "../src/lib/daily/dailyStudioNavigation.mjs";

test("la navigation Daily expose exactement les cinq rubriques validées", () => {
  assert.deepEqual(dailyStudioNavigationSections(false).map(group => group.label), ["Tableau de bord", "Organismes", "Sessions", "Candidatures", "Administration"]);
  assert.equal(DAILY_STUDIO_NAV_GROUPS.length, 5);
  assert.equal(new Set(DAILY_STUDIO_NAV_GROUPS.flatMap(group => group.links.map(link => link.href))).size, 5);
});

test("les outils secondaires restent accessibles sans rubrique Documents permanente", () => {
  assert.ok(DAILY_STUDIO_ADMIN_TOOLS.some(tool => tool.href === "/agent/daily/qualite"));
  assert.ok(DAILY_STUDIO_ADMIN_TOOLS.some(tool => tool.href === "/agent/daily/preaudit"));
  assert.ok(DAILY_STUDIO_ADMIN_TOOLS.some(tool => tool.href === "/agent/daily/satisfaction"));
  assert.ok(!DAILY_STUDIO_NAV_GROUPS.some(group => group.label === "Documents"));
});

test("le générateur réservé à la propriétaire reste absent pour les autres agents", () => {
  assert.ok(!dailyStudioAdministrationLinks(false).some(tool => tool.href === "/agent/daily/generateur-formation"));
  assert.ok(dailyStudioAdministrationLinks(true).some(tool => tool.href === "/agent/daily/generateur-formation"));
  assert.equal(dailyStudioAdministrationLinks(false).length + 1, dailyStudioAdministrationLinks(true).length);
});

test("les sous-pages métier sélectionnent la rubrique sans changer les droits", () => {
  const sections = dailyStudioNavigationSections(false);
  const active = path => sections.filter(section => isDailyStudioNavSectionActive(path, section)).map(section => section.label);
  assert.deepEqual(active("/agent/daily"), ["Tableau de bord"]);
  assert.deepEqual(active("/agent/daily/organisations/abc"), ["Organismes"]);
  assert.deepEqual(active("/agent/daily/suivi-sessions"), ["Sessions"]);
  assert.deepEqual(active("/agent/daily/candidatures"), ["Candidatures"]);
  assert.deepEqual(active("/agent/daily/veille-proposee"), ["Administration"]);
  assert.deepEqual(active("/agent/daily/generateur-formation"), ["Administration"]);
  assert.deepEqual(active("/agent/daily/unknown"), []);
  assert.equal(isDailyStudioNavLinkActive("/agent/daily/planning-other", "/agent/daily/planning"), false);
});

test("la barre affiche les cinq rubriques et annonce la section active", async () => {
  const nav = await readFile(new URL("../src/components/daily/DailyStudioNavigation.tsx", import.meta.url), "utf8");
  assert.match(nav, /dailyStudioNavigationSections\(owner\)/);
  assert.match(nav, /isDailyStudioNavSectionActive\(pathname, group\)/);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(nav, /className="daily-subnav"/);
});

test("l'accueil Administration exige un agent et filtre les outils propriétaire", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/administration/page.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireSupportAgent\(\)/);
  assert.match(page, /if \(!auth\.ok\) return/);
  assert.match(page, /dailyStudioAdministrationLinks\(isOwnerLil\(user\?\.email\)\)/);
  assert.doesNotMatch(page, /createSupabaseAdminClient|\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
