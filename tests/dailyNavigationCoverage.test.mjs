import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../src/app/agent/daily/layout.tsx", import.meta.url), "utf8");

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
