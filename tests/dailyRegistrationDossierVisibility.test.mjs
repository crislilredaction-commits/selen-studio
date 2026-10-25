import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const organisationPage = await readFile(new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url), "utf8");
const dailyLayout = await readFile(new URL("../src/app/agent/daily/layout.tsx", import.meta.url), "utf8");
const dailyNavigation = await readFile(new URL("../src/lib/daily/dailyStudioNavigation.mjs", import.meta.url), "utf8");
const candidatureList = await readFile(new URL("../src/app/agent/daily/candidatures/page.tsx", import.meta.url), "utf8");
const candidatureDetail = await readFile(new URL("../src/app/agent/daily/candidatures/[id]/page.tsx", import.meta.url), "utf8");

test("Studio rend les dossiers remplis accessibles depuis le parcours Daily et le dossier OF", () => {
  assert.match(dailyNavigation, /href: "\/agent\/daily\/candidatures", label: "Dossiers d’inscription"/);
  assert.match(dailyLayout, /DailyStudioNavigation owner=\{owner\}/);
  assert.match(organisationPage, /key: "applications", label: "Dossiers d’inscription"/);
  assert.match(organisationPage, /tab === "applications"/);
  assert.match(organisationPage, /Voir les dossiers et réponses/);
});

test("la liste OF lit tous les dossiers de ses formations sans supprimer l’historique", () => {
  assert.match(organisationPage, /from\("daily_formation_registration_requests"\)/);
  assert.match(organisationPage, /\.in\("formation_id", formationIds\)/);
  assert.doesNotMatch(organisationPage, /candidaturesRes[\s\S]{0,800}\.in\("decision_status"/);
  assert.match(organisationPage, /Dossier reçu · analyse à faire/);
  assert.match(organisationPage, /Les dossiers décidés restent consultables dans l’historique/);
});

test("chaque dossier conserve ses rattachements et ouvre les réponses, justificatifs et session", () => {
  for (const field of ["formation_id", "attached_session_id", "signature_signed_at", "decision_status", "submitted_at"]) {
    assert.match(organisationPage, new RegExp(field));
  }
  assert.match(organisationPage, /\/agent\/daily\/candidatures\/\$\{candidature\.id\}/);
  assert.match(organisationPage, /Ouvrir les réponses et justificatifs/);
  assert.match(organisationPage, /\/agent\/daily\/session-dossiers\/\$\{session\.id\}\/full/);
  assert.match(candidatureDetail, /Dossier original/);
  assert.match(candidatureDetail, /Pré-requis|prérequis/);
});

test("les lectures restent bornées au périmètre agent et organisme avant les données privées", () => {
  assert.match(organisationPage, /isDailyOrganisationInAgentScope\(auth\.email, id\)/);
  assert.match(candidatureList, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(candidatureList, /\.in\("formation_id", formationIds\)/);
});
