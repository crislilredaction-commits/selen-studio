import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sidebar = await readFile(new URL("../src/components/layout/AgentSidebar.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/app/agent/layout.tsx", import.meta.url), "utf8");

test("le menu agent mobile est fermé par défaut et contrôlé par un bouton explicite", () => {
  assert.match(sidebar, /useState\(false\)[\s\S]*mobileMenuButtonRef/);
  assert.match(sidebar, /aria-controls="agent-primary-navigation"/);
  assert.match(sidebar, /aria-expanded=\{mobileMenuOpen\}/);
  assert.match(sidebar, /data-mobile-open=\{mobileMenuOpen \? "true" : "false"\}/);
});

test("le menu mobile se ferme à la navigation et à Échap, puis restaure le focus", () => {
  assert.match(sidebar, /\[pathname\]\);[\s\S]*const visibleLinks/);
  assert.match(sidebar, /event\.key === "Escape" && mobileMenuOpen/);
  assert.match(sidebar, /mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.ok((sidebar.match(/onClick=\{\(\) => setMobileMenuOpen\(false\)\}/g) ?? []).length >= 3);
});

test("le profil est accessible sur mobile sans doubler les liens du menu principal", () => {
  assert.match(sidebar, /className="agent-sidebar__mobile-profile"/);
  assert.match(sidebar, /href="\/agent\/profil"/);
  assert.doesNotMatch(sidebar, /href:\s*"\/agent\/profil"/);
  assert.match(css, /\.agent-sidebar__mobile-toggle,\s*\.agent-sidebar__mobile-profile \{ display: none; \}/);
  assert.match(css, /\.agent-sidebar__mobile-profile \{\s*display: flex/);
});

test("la navigation se déplie verticalement sous 820 px sans piéger le contenu", () => {
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.agent-sidebar__nav \{\s*display: none;[\s\S]*flex-direction: column/);
  assert.match(css, /\.agent-sidebar\[data-mobile-open="true"\] \.agent-sidebar__nav \{\s*display: flex/);
  assert.match(css, /max-height: calc\(100dvh - 56px\)/);
  assert.match(css, /\.agent-sidebar__mobile-toggle:focus-visible/);
});

test("les droits et la messagerie existants sont conservés", () => {
  assert.match(sidebar, /isOwnerLil\(email\)/);
  assert.match(sidebar, /role === "admin"/);
  assert.match(sidebar, /<AgentSidebarMessaging \/>/);
  assert.match(layout, /await assertActiveAgentAccess\(\)/);
});

test("le menu mobile n'ajoute aucune API ni lecture de données métier", () => {
  assert.doesNotMatch(sidebar, /fetch\(\s*["']\/agent\/api/);
  assert.match(sidebar, /const visibleLinks = links/);
  assert.match(sidebar, /aria-label="Navigation principale Studio"/);
});
