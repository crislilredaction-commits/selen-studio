import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la veille Studio utilise un champ commun synthèse et améliorations", () => {
  const page = read("src/app/agent/daily/qualite/page.tsx");
  assert.match(page, /Points importants & améliorations proposées/);
  assert.match(page, /analysis_and_improvement/);
});

test("la préparation de session est centrée sur le programme", () => {
  const page = read("src/app/agent/daily/session-dossiers/[id]/page.tsx");
  assert.match(page, /Une seule chose à faire ici/);
  assert.match(page, /Valider le programme/);
  assert.match(page, /Enregistrer sans valider/);
  assert.match(page, /Dossier complet/);
});

test("la validation crée l'action client de diffusion", () => {
  const page = read("src/app/agent/daily/session-dossiers/[id]/page.tsx");
  assert.match(page, /daily_validate_formation_version/);
  assert.match(page, /spontaneous_registration_task_status:"to_attach"/);
  assert.match(page, /\/i\/\$\{token\}/);
});

test("le dossier technique reste disponible en vue secondaire", () => {
  const full = read("src/app/agent/daily/session-dossiers/[id]/full/page.tsx");
  assert.match(full, /Preuves de présence/);
  assert.match(full, /Déroulement de la session/);
  assert.match(full, /Évaluations & satisfaction/);
});

test("Studio affiche des messages en tutoiement", () => {
  const banner = read("src/components/AgentFriendlyBanner.tsx");
  assert.match(banner, /Tu avances bien/);
  assert.match(banner, /tu pilotes/);
  const login = read("src/app/login/page.tsx");
  assert.match(login, /Accède au back-office/);
  assert.match(login, /Vérifie ton email/);
});
