import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx", import.meta.url),
  "utf8",
);
const navigation = readFileSync(
  new URL("../src/app/agent/daily/session-dossiers/[id]/SessionWorkspaceNavigation.tsx", import.meta.url),
  "utf8",
);

test("la fiche session expose quatre onglets chronologiques sans dupliquer les traitements", () => {
  for (const stage of ["overview", "before", "during", "after"]) {
    assert.match(navigation, new RegExp(`id: "${stage}"`));
    assert.match(source, new RegExp(`data-session-stage="${stage}"`));
  }
  assert.match(navigation, /querySelectorAll<HTMLElement>\("\[data-session-stage\]"\)/);
  assert.match(navigation, /panel\.hidden = panel\.dataset\.sessionStage !== activeStage/);
  assert.match(navigation, /Participants & positionnements/);
  assert.match(navigation, /Documents avant formation/);
  assert.match(navigation, /Communications & preuves/);
  assert.doesNotMatch(source, /workspaceLinks/);
  assert.doesNotMatch(source, /footerLinks/);
});

test("les liens profonds ouvrent le bon onglet et conservent les détails ciblés", () => {
  assert.match(navigation, /window\.addEventListener\("hashchange", activateLocation\)/);
  assert.match(navigation, /target\?\.closest<HTMLElement>\("\[data-session-stage\]"\)/);
  assert.match(navigation, /target instanceof HTMLDetailsElement/);
  assert.match(navigation, /target\.scrollIntoView/);
  assert.match(source, /id="participants-session" data-session-stage="before"/);
});

test("la fiche session devient le point d'entrée des documents préformation", () => {
  assert.match(source, /id="documents-avant-formation"/);
  assert.match(source, /pretraining-documents\?session=\$\{encodeURIComponent\(id\)\}/);
  assert.match(source, /daily_pretraining_document_progress/);
  assert.match(source, /documentProgress\.error/);
});

test("la liste documentaire reste bornée à la session et à l'organisme", () => {
  const query = source.slice(source.indexOf('admin.from("daily_documents")'));
  assert.match(query, /\.eq\("organisation_id",typedSession\.organisation_id\)/);
  assert.match(query, /\.eq\("session_id",id\)/);
  assert.match(query, /\.eq\("is_current",true\)/);
  assert.match(query, /\.in\("document_type",pretrainingDocumentTypes\)/);
  assert.doesNotMatch(query, /\.limit\(100\)/, "le filtrage client ne doit pas tronquer les documents actifs plus anciens");
});

test("les documents des inscriptions closes restent historiques sans action active", () => {
  assert.match(source, /!\["declined","cancelled","abandoned"\]\.includes\(row\.status\)/);
  assert.match(source, /activeEnrolmentIds=new Set\(enrolments\.map\(row=>row\.id\)\)/);
  assert.match(source, /!document\.enrolment_id\|\|activeEnrolmentIds\.has\(document\.enrolment_id\)/);
  assert.match(source, /restent dans l’historique, sans être présentées comme une action active/);
});

test("les statuts affichés proviennent des documents persistés", () => {
  for (const status of ["to_check", "to_validate", "validated", "correction_requested", "published", "signed"]) {
    assert.match(source, new RegExp(`${status}:`));
  }
  assert.match(source, /Version \{doc\.version\}/);
  assert.doesNotMatch(source, /onClick=.*valid/i);
});

test("le traitement des inscriptions utilise le contexte du dossier sans recopier les actions", () => {
  const layout = readFileSync(
    new URL("../src/app/agent/daily/sessions/[id]/layout.tsx", import.meta.url), "utf8",
  );
  const treatment = readFileSync(
    new URL("../src/app/agent/daily/sessions/[id]/page.tsx", import.meta.url), "utf8",
  );
  assert.ok(layout.includes('SessionDossierLayout from "../../session-dossiers/[id]/layout"'));
  assert.ok(layout.includes("<SessionDossierLayout {...props} />"));
  assert.ok(navigation.includes("/agent/daily/sessions/${encodeURIComponent(sessionId)}"));
  assert.ok(navigation.includes("Contrôler les inscriptions"));
  assert.ok(treatment.includes("loadScopedDailySessionPrerequisites(admin, auth.email, id)"));
  assert.ok(treatment.includes("patchSummaryValidationAction(legacy, blockedReason)"));
  assert.ok(source.includes("/agent/daily/sessions/${id}"));
});
