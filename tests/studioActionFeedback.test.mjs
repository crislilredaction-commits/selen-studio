import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL(
  "../src/components/agent/StudioActionFeedback.tsx",
  import.meta.url,
);
const layoutPath = new URL("../src/app/agent/layout.tsx", import.meta.url);

test("le feedback transversal est monté sur tout l’espace agent Studio", async () => {
  const layout = await readFile(layoutPath, "utf8");
  assert.match(layout, /import StudioActionFeedback/);
  assert.match(layout, /<StudioActionFeedback \/>/);
});

test("les mutations utilisateur publient chargement, succès et erreur", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /MUTATION_METHODS = new Set\(\["POST", "PUT", "PATCH", "DELETE"\]\)/);
  assert.match(source, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(source, /document\.addEventListener\("submit", onSubmit, true\)/);
  assert.match(source, /window\.fetch = instrumentedFetch/);
  assert.match(source, /publish\("loading"/);
  assert.match(source, /publish\("success"/);
  assert.match(source, /publish\("error"/);
});

test("l’état est accessible et empêche les doubles clics pendant une action", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /aria-live=/);
  assert.match(source, /role=\{feedback\.kind === "error" \? "alert" : "status"\}/);
  assert.match(source, /setAttribute\("aria-busy", "true"\)/);
  assert.match(source, /action\.button\.disabled = true/);
  assert.match(source, /pendingActionsRef = useRef\(new Map/);
  assert.match(source, /releasePending\(pendingId\)/);
  assert.match(source, /pointer-events: none !important/);
  assert.match(source, /data-studio-feedback="off"/);
});

test("un formulaire refusé ne verrouille pas son bouton avant le départ réel de la mutation", async () => {
  const source = await readFile(componentPath, "utf8");
  const submitHandler = source.slice(source.indexOf("const onSubmit"), source.indexOf("document.addEventListener"));
  assert.doesNotMatch(submitHandler, /markPending/);
  assert.match(source, /const pendingId = markPending\(action\)/);
});

test("les lectures et actualisations automatiques ne déclenchent pas de faux succès", async () => {
  const source = await readFile(componentPath, "utf8");
  assert.match(source, /action !== null && action\.expiresAt >= Date\.now\(\)/);
  assert.match(source, /if \(!shouldReport \|\| !action\) return originalFetch/);
});
