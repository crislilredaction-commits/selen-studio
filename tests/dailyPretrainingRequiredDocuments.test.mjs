import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url);
const pagePath = new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url);

const requiredTypes = [
  "training_program",
  "training_agreement",
  "convocation",
  "registration_positioning",
  "welcome_booklet",
  "internal_regulations",
];

test("Studio pretraining review includes every required document family", async () => {
  const [route, page] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  for (const type of requiredTypes) {
    assert.match(route, new RegExp(`\\"${type}\\"`), `${type} must be queried by Studio`);
    assert.match(page, new RegExp(`${type}:`), `${type} must have a Studio label`);
  }

  assert.match(page, /Livret d’accueil/);
  assert.match(page, /Règlement intérieur/);
  assert.match(page, /Convention/);
});
