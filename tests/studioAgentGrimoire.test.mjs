import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const grimoire = readFileSync(new URL("../src/components/agent/StudioAgentGrimoire.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/agent/layout.tsx", import.meta.url), "utf8");

test("le Grimoire métier reste strictement dans le layout agent protégé", () => {
  assert.match(layout, /await assertActiveAgentAccess\(\)/);
  assert.match(layout, /<StudioAgentGrimoire \/>/);
  assert.doesNotMatch(grimoire, /\/client\/daily|\/daily\/portail/);
});

test("le Grimoire couvre parcours, cas particuliers, FAQ, recherche et contexte", () => {
  assert.match(grimoire, /Avant/);
  assert.match(grimoire, /Pendant/);
  assert.match(grimoire, /Après/);
  assert.match(grimoire, /Inscription collective/);
  assert.match(grimoire, /Désinscription/);
  assert.match(grimoire, /Rétractation/);
  assert.match(grimoire, /Absence/);
  assert.match(grimoire, /Document manquant/);
  assert.match(grimoire, /Réclamation/);
  assert.match(grimoire, /FAQ agents/);
  assert.match(grimoire, /type="search"/);
  assert.match(grimoire, /contextHelp\(pathname\)/);
});

test("les liens pointent uniquement vers des écrans Studio existants", () => {
  assert.match(grimoire, /href: "\/agent\/daily\/organisations"/);
  assert.doesNotMatch(grimoire, /href: "\/agent\/daily\/formations"/);
  assert.match(grimoire, /href: "\/agent\/daily\/organisations"/);
  assert.match(grimoire, /href: "\/agent\/daily\/candidatures"/);
  assert.match(grimoire, /href: "\/agent\/daily\/session-dossiers"/);
  assert.match(grimoire, /href: "\/agent\/daily\/communications"/);
  assert.match(grimoire, /href: "\/agent\/daily\/reclamations"/);
  assert.doesNotMatch(grimoire, /href:\s*"https?:/);
});

test("les procédures reflètent les états réellement proposés par Studio", () => {
  assert.match(grimoire, /Reçue, Revue par Selen, Transmise à l’organisme, puis Résolue/);
  assert.doesNotMatch(grimoire, /Passe de Reçue à En analyse/);
});

test("le bouton reste accessible et ne masque pas le composeur email", () => {
  assert.match(grimoire, /bottom:82px/);
  assert.match(grimoire, /aria-expanded=\{open\}/);
  assert.match(grimoire, /aria-controls="studio-agent-grimoire"/);
  assert.match(grimoire, /event\.key === "Escape"/);
  assert.match(grimoire, /@media\(max-width:700px\)/);
});
