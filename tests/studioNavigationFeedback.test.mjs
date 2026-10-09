import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/agent/StudioActionFeedback.tsx", import.meta.url),
  "utf8",
);
const helperSource = await readFile(
  new URL("../src/lib/studioNavigation.ts", import.meta.url),
  "utf8",
);
const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("la navigation Studio publie un retour immédiat avant la réponse réseau", () => {
  const clickHandler = component.slice(
    component.indexOf("const onClick = (event: MouseEvent)"),
    component.indexOf("const onNavigationEvent"),
  );
  assert.match(clickHandler, /documented|capture phase/);
  assert.match(clickHandler, /begin\(link, label\)/);
  assert.match(component, /element\?\.classList\.add\("studio-navigation-pending"\)/);
  assert.match(component, /element\?\.setAttribute\("aria-busy", "true"\)/);
  assert.match(component, /message: label \? `Ouverture de/);
  assert.match(component, /studio-navigation-feedback__spinner/);
});

test("les liens clavier et souris restent couverts et les doubles activations sont bloquées", () => {
  assert.match(component, /event\.button !== 0/);
  assert.doesNotMatch(component, /event\.detail/);
  assert.match(component, /if \(activeRef\.current === link\) \{\s*event\.preventDefault\(\)/);
  assert.match(component, /aria-live=\{feedback\.kind === "error" \? "assertive" : "polite"\}/);
});

test("router.push et router.replace disposent du même contrat de feedback", () => {
  assert.match(helperSource, /export function navigateWithStudioFeedback/);
  assert.ok(helperSource.indexOf("dispatchEvent") < helperSource.indexOf("router.push"));
  assert.ok(helperSource.indexOf("dispatchEvent") < helperSource.indexOf("router.replace"));
  assert.match(helperSource, /kind: "error"/);
});

test("retour arrière, erreur et navigation lente ont un état visible", () => {
  assert.match(component, /window\.addEventListener\("popstate", onPopState\)/);
  assert.match(component, /window\.addEventListener\("error", onNavigationError\)/);
  assert.match(component, /window\.addEventListener\("unhandledrejection", onNavigationError\)/);
  assert.match(component, /15_000/);
  assert.match(component, /La page tarde à s’ouvrir/);
});

test("le contraste, le mobile et la réduction des animations sont explicitement traités", () => {
  assert.match(css, /\.agent-shell a\.studio-navigation-pending/);
  assert.match(css, /background-color: var\(--selen-gold\) !important/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /max-width: min\(24rem, calc\(100vw - 2rem\)\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
