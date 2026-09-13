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
