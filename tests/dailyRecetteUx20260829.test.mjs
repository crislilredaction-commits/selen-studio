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

test("le dossier complet est une synthèse métier et non une checklist", () => {
  const full = read("src/app/agent/daily/session-dossiers/[id]/full/page.tsx");
  assert.match(full, /À faire maintenant/);
  assert.match(full, /En attente d'une inscription/);
  assert.match(full, /Inscriptions reçues/);
  assert.match(full, /Présences, évaluations & satisfaction/);
  assert.doesNotMatch(full, /daily_session_checklist_items/);
  assert.doesNotMatch(full, /updateItem/);
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

test("Pilotage Daily ne montre que les interventions réelles", () => {
  const page = read("src/app/agent/daily/page.tsx");
  assert.match(page, /ne montre que les dossiers qui attendent réellement une intervention/);
  assert.match(page, /responses\.length === 0/);
  assert.match(page, /Programme à valider/);
  assert.match(page, /Dossier d'inscription à traiter/);
});

test("le tableau de bord ne compte plus la checklist technique Daily", () => {
  const dashboard = read("src/components/agent/AgentHomeDashboard.tsx");
  assert.match(dashboard, /registrationNeedsAgent/);
  assert.match(dashboard, /programme à vérifier et valider/);
  assert.match(dashboard, /dossier.*d'inscription à traiter/);
  assert.doesNotMatch(dashboard, /daily_session_checklist_items/);
  assert.doesNotMatch(dashboard, /pendingCount/);
});
