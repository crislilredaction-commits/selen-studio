import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dailyStudioAdministrationLinks } from "../src/lib/daily/dailyStudioNavigation.mjs";
import { DAILY_ADMIN_CATEGORIES, normalizeDailyAdminQuery, normalizeDailyAdminCategory, filterDailyAdministrationLinks, dailyAdministrationCategoryCounts } from "../src/lib/daily/dailyAdministrationDirectory.mjs";

const agentLinks = dailyStudioAdministrationLinks(false);
const ownerLinks = dailyStudioAdministrationLinks(true);

test("administration : recherche accent-insensible dans les outils autorisés", () => {
  assert.deepEqual(filterDailyAdministrationLinks(agentLinks, { query: "QUALIOPI" }).map(x => x.label), ["Pré-audit Qualiopi"]);
  assert.deepEqual(filterDailyAdministrationLinks(agentLinks, { query: "reclamations" }).map(x => x.label), ["Réclamations et suggestions"]);
  assert.ok(filterDailyAdministrationLinks(agentLinks, { query: "justificatifs" }).some(x => x.label === "Communications et preuves"));
});

test("administration : catégories combinables et valeurs inconnues sûres", () => {
  assert.deepEqual(DAILY_ADMIN_CATEGORIES, ["Toutes", "Supervision", "Qualité", "Outils"]);
  assert.equal(normalizeDailyAdminCategory("inconnue"), "Toutes");
  assert.deepEqual(filterDailyAdministrationLinks(agentLinks, { category: "Outils" }), []);
  assert.deepEqual(filterDailyAdministrationLinks(ownerLinks, { category: "Outils" }).map(x => x.label), ["Générateur formation"]);
  assert.deepEqual(filterDailyAdministrationLinks(agentLinks, { category: "Qualité", query: "veille" }).map(x => x.label), ["Veille & Qualité", "Propositions de veille"]);
});

test("administration : droits propriétaire jamais élargis par recherche ou filtre", () => {
  for (const category of [...DAILY_ADMIN_CATEGORIES, "inconnue"]) {
    for (const query of ["", "generateur", "formation", "qualite"]) {
      assert.ok(filterDailyAdministrationLinks(agentLinks, { category, query }).every(x => !x.ownerOnly));
    }
  }
  assert.equal(filterDailyAdministrationLinks(agentLinks).length, 9);
  assert.equal(filterDailyAdministrationLinks(ownerLinks).length, 10);
});

test("administration : compteur cohérent et liste source non modifiée", () => {
  const before = agentLinks.map(x => x.href);
  const counts = dailyAdministrationCategoryCounts(agentLinks, "veille");
  assert.deepEqual(counts, { Toutes: 2, Supervision: 0, Qualité: 2, Outils: 0 });
  filterDailyAdministrationLinks(agentLinks, { query: "inexistant" });
  assert.deepEqual(agentLinks.map(x => x.href), before);
});

test("administration : requête bornée, entrées invalides et état vide", () => {
  assert.equal(normalizeDailyAdminQuery(" x ".repeat(100)).length, 80);
  assert.equal(normalizeDailyAdminQuery(["foo"]), "");
  assert.deepEqual(filterDailyAdministrationLinks(agentLinks, { query: "zzzinconnu" }), []);
  assert.deepEqual(filterDailyAdministrationLinks(null, {}), []);
});

test("administration : garde serveur conservé, composant client sans accès métier", async () => {
  const [page, component] = await Promise.all([
    readFile(new URL("../src/app/agent/daily/administration/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/daily/DailyAdministrationDirectory.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /await requireSupportAgent\(\)/);
  assert.match(page, /if \(!auth\.ok\) return/);
  assert.match(page, /dailyStudioAdministrationLinks\(isOwnerLil\(user\?\.email\)\)/);
  assert.match(page, /<DailyAdministrationDirectory links=\{links\}/);
  assert.match(component, /"use client"/);
  assert.match(component, /aria-pressed=\{category === item\}/);
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /type="search"/);
  assert.doesNotMatch(page + component, /createSupabaseAdminClient|\.from\(|\.insert\(|\.update\(|\.delete\(|fetch\(/);
});
