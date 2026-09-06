import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../src/app/agent/daily/layout.tsx", import.meta.url), "utf8");
const planningPage = await readFile(new URL("../src/app/agent/daily/planning/page.tsx", import.meta.url), "utf8");
const organisationLayout = await readFile(new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url), "utf8");

test("la navigation Studio Daily expose les écrans métier déjà disponibles", () => {
  const expectedRoutes = [
    "/agent/daily",
    "/agent/daily/planning",
    "/agent/daily/organisations",
    "/agent/daily/session-dossiers",
    "/agent/daily/pretraining-documents",
    "/agent/daily/posttraining-documents",
    "/agent/daily/communications",
    "/agent/daily/preaudit",
    "/agent/daily/qualite",
  ];

  for (const route of expectedRoutes) {
    assert.match(layout, new RegExp(`href=\\"${route.replaceAll("/", "\\/")}\\"`));
  }
});

test("le planning est borné au périmètre canonique des organismes Daily actifs", () => {
  assert.match(planningPage, /getActiveDailyOrganisationIds/);
  assert.match(planningPage, /\.from\("daily_session_dossiers"\)[\s\S]*\.in\("organisation_id", organisationIds\)/);
  assert.match(planningPage, /organisationIds\.length\s*\?\s*await admin/);
});

test("l’auto-attribution Studio Daily reste au tutoiement", () => {
  assert.match(organisationLayout, /Tu peux prendre ce dossier en charge/);
  assert.doesNotMatch(organisationLayout, /Vous pouvez prendre ce dossier en charge/);
});
