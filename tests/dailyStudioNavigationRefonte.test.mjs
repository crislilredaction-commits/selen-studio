import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { DAILY_STUDIO_NAV_GROUPS, dailyStudioNavigationSections, isDailyStudioNavLinkActive } from "../src/lib/daily/dailyStudioNavigation.mjs";

test("navigation regroupée : tous les accès métier V1, sans doublon", () => {
  assert.deepEqual(DAILY_STUDIO_NAV_GROUPS.map(group => group.label), ["Pilotage", "Dossiers", "Qualité et outils"]);
  const links = dailyStudioNavigationSections(true).flatMap(group => group.links);
  assert.equal(links.length, 10);
  assert.equal(new Set(links.map(link => link.href)).size, links.length);
  assert.ok(links.some(link => link.href === "/agent/daily/escalations"));
  assert.ok(links.some(link => link.href === "/agent/daily/veille-proposee"));
});

test("le générateur réservé à la propriétaire disparaît des liens des agents", () => {
  const agent = dailyStudioNavigationSections(false).flatMap(group => group.links);
  const owner = dailyStudioNavigationSections(true).flatMap(group => group.links);
  assert.equal(agent.length, 9);
  assert.ok(agent.every(link => !link.ownerOnly));
  assert.equal(owner.filter(link => link.ownerOnly).length, 1);
  assert.equal(dailyStudioNavigationSections(undefined).flatMap(group => group.links).length, 9);
});

test("repère actif exact au niveau racine, conservé sur les sous-dossiers", () => {
  assert.equal(isDailyStudioNavLinkActive("/agent/daily", "/agent/daily"), true);
  assert.equal(isDailyStudioNavLinkActive("/agent/daily/planning", "/agent/daily"), false);
  assert.equal(isDailyStudioNavLinkActive("/agent/daily/organisations/of-test", "/agent/daily/organisations"), true);
  assert.equal(isDailyStudioNavLinkActive("/agent/daily/organisations-faux", "/agent/daily/organisations"), false);
  assert.equal(isDailyStudioNavLinkActive("/agent/daily/qualite", "/agent/daily/qualite"), true);
  assert.equal(isDailyStudioNavLinkActive(null, "/agent/daily"), false);
});

test("la navigation est accessible, mobile et ne touche ni droits ni données", async () => {
  const [layout, nav, css] = await Promise.all([
    readFile(new URL("../src/app/agent/daily/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/daily/DailyStudioNavigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /isOwnerLil\(user\?\.email\)/);
  assert.match(layout, /DailyStudioNavigation owner=\{owner\}/);
  assert.match(nav, /usePathname\(\)/);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(nav, /role="group" aria-label=\{group\.label\}/);
  assert.match(css, /\.daily-subnav-link\[aria-current="page"\]/);
  assert.match(css, /\.daily-subnav-link:focus-visible/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?\.daily-subnav-links \{ flex-wrap: nowrap; \}/);
  assert.doesNotMatch(nav, /supabase|fetch\(|\.from\(/);
});
