import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la veille Studio utilise un champ commun synthèse et améliorations", () => {
  const page = read("src/app/agent/daily/qualite/page.tsx");
  assert.match(page, /Points importants & améliorations proposées/);
  assert.match(page, /analysis_and_improvement/);
});

test("la préparation de session explique son utilité et replie les détails", () => {
  const page = read("src/app/agent/daily/session-dossiers/[id]/page.tsx");
  assert.match(page, /Vérifie uniquement le programme/);
  assert.match(page, /Le reste de la session se traite dans les tâches agent/);
  assert.match(page, /<details open/);
  assert.match(page, /Valider le programme/);
  assert.match(page, /Voir le dossier complet/);
});

test("la validation crée l'action client de diffusion sans exposer le lien dans Studio", () => {
  const page = read("src/app/agent/daily/session-dossiers/[id]/page.tsx");
  assert.match(page, /daily_validate_formation_version/);
  assert.match(page, /spontaneous_registration_task_status: "to_attach"/);
  assert.doesNotMatch(page, /public-registration-qr/);
});

test("le dossier technique reste disponible en vue secondaire", () => {
  const full = read("src/app/agent/daily/session-dossiers/[id]/full/page.tsx");
  assert.match(full, /Preuves de présence/);
  assert.match(full, /Déroulement de la session/);
  assert.match(full, /Évaluations & satisfaction/);
});

test("les messages chaleureux restent dans la sidebar et non dans un bandeau", () => {
  const sidebar = read("src/components/layout/AgentSidebar.tsx");
  const layout = read("src/app/agent/layout.tsx");
  assert.match(sidebar, /friendlyNotes/);
  assert.match(sidebar, /friendlyNote/);
  assert.doesNotMatch(layout, /AgentFriendlyBanner/);
});

test("la messagerie exclut les alertes Daily", () => {
  const route = read("src/app/agent/api/notifications/list/route.ts");
  assert.match(route, /isMessagingItem/);
  assert.match(route, /source\.includes\("message"\)/);
  assert.doesNotMatch(route, /daily_sync_trainer_certification_notifications/);
});

test("le pilotage des sessions affiche des tâches agent plutôt qu'une checklist", () => {
  const page = read("src/app/agent/daily/session-dossiers/page.tsx");
  assert.match(page, /Tâches agent/);
  assert.match(page, /Vérifier et valider le programme/);
  assert.match(page, /Traiter cette session/);
});
