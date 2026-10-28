import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url);

test("la revue documentaire Daily propose les filtres apprenant et session", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /aria-label="Filtrer par apprenant"/);
  assert.match(source, /aria-label="Filtrer par session"/);
  assert.match(source, /learnerFilter/);
  assert.match(source, /sessionFilter/);
  assert.match(source, /learnerKey\(d\)===learnerFilter/);
  assert.match(source, /sessionKey\(d\)===sessionFilter/);
});

test("la file globale délègue les actions à une vue verrouillée sur la session", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /requestedSession==="all"/);
  assert.match(source, /aria-label="Sessions à traiter"/);
  assert.match(source, /Ouvrir le dossier de session/);
  assert.match(source, /requestedSession!=="all"&&preparationSession/);
  assert.match(source, /scopedPreview\?<section aria-label="Prévisualisation du document"/);
  assert.match(source, /const scopedPreview=preview&&scopedDocuments\.some/);
  assert.match(source, /aria-label="Pièces sans session"/);
  assert.match(source, /contextHref/);
  assert.match(source, /Ouvrir la formation/);
  assert.match(source, /Ouvrir les documents de l’organisme/);
  assert.match(source, /Rattachement session à vérifier/);
  assert.match(source, /hasUnavailableCanonicalSession/);
  assert.match(source, /orphanSessionDocuments/);
});
