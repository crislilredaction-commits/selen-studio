import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const stats = isolatedTsModule("src/lib/dailyOrganisationStatistics.ts");
const listPage = await readFile(new URL("../src/app/agent/daily/organisations/page.tsx", import.meta.url), "utf8");
const detailPage = await readFile(new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url), "utf8");

test("les statistiques programmes distinguent les validés des éléments à finaliser", () => {
  assert.deepEqual(
    { ...stats.dailyOrganisationProgramStats([
      { status: "validated" }, { status: "validated" }, { status: "validated" }, { status: "validated" },
      { status: "draft" }, { status: "draft" }, { status: "archived" },
    ]) },
    { total: 6, validated: 4, toFinalize: 2, progress: 67 },
  );
  assert.deepEqual({ ...stats.dailyOrganisationProgramStats([]) }, { total: 0, validated: 0, toFinalize: 0, progress: 0 });
});

test("les tâches canoniques sont comptées sans mélange avec la checklist organisme", () => {
  const counts = stats.dailyOrganisationTaskCounts([
    { organisationId: "of-a" }, { organisationId: "of-b" }, { organisationId: "of-a" },
  ]);
  assert.equal(counts.get("of-a"), 2);
  assert.equal(counts.get("of-b"), 1);
  assert.equal(counts.get("of-c") ?? 0, 0);
});

test("le dossier affiche la sémantique exacte et refuse les faux zéros de chargement", () => {
  assert.match(detailPage, /Programmes validés/);
  assert.match(detailPage, /Tâches actives/);
  assert.match(detailPage, /Source Pilotage Daily/);
  assert.match(detailPage, /Modifications à valider/);
  assert.match(detailPage, /Profil légal de l’OF/);
  assert.match(detailPage, /Certifications à surveiller/);
  assert.match(detailPage, /Chargement du dossier impossible/);
  assert.match(detailPage, /Chargement des tâches impossible/);
  assert.doesNotMatch(detailPage, /MiniStat label="Avancement"/);
});

test("la liste des organismes utilise les mêmes programmes et tâches canoniques", () => {
  assert.match(listPage, /dailyOrganisationProgramStats/);
  assert.match(listPage, /dailyOrganisationTaskCounts\(attentionTasks\)/);
  assert.match(listPage, /programmes validés/);
  assert.match(listPage, /Modifications de profil à valider/);
  assert.doesNotMatch(listPage, /daily_organisation_checklist_items/);
  assert.doesNotMatch(listPage, /items\.length \|\| 7/);
});
