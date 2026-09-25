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

test("la publication préformation exige relecture et retourne la preuve email",async()=>{const [route,page]=await Promise.all([readFile(routePath,"utf8"),readFile(pagePath,"utf8")]);assert.match(page,/Confirmez-vous avoir relu cette pièce/);assert.match(page,/notification\.providerMessageId/);assert.match(page,/notification\.sentAt/);assert.match(route,/publication_notification_resend_id/);assert.match(route,/publication_notification_sent_at/);assert.match(route,/publication_recipient_email/);});
