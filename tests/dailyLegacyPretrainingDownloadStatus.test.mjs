import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const conventionPath = new URL(
  "../src/app/agent/api/daily/conventions/download/route.ts",
  import.meta.url,
);
const convocationPath = new URL(
  "../src/app/agent/api/daily/convocations/download/route.ts",
  import.meta.url,
);

test("les anciens téléchargements préformation excluent les versions archivées", async () => {
  const [convention, convocation] = await Promise.all([
    readFile(conventionPath, "utf8"),
    readFile(convocationPath, "utf8"),
  ]);

  const conventionLookup = convention.split('.from("daily_conventions")')[1] ?? "";
  assert.match(
    conventionLookup,
    /\.eq\("id",\s*id\)[\s\S]*\.eq\("status",\s*"generated"\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(conventionLookup, /"superseded"|"archived"/);

  const convocationLookup = convocation.split('.from("daily_convocations")')[1] ?? "";
  assert.match(
    convocationLookup,
    /\.eq\("id",\s*id\)[\s\S]*\.in\("status",\s*\["generated",\s*"sent",\s*"viewed"\]\)[\s\S]*\.maybeSingle\(\)/,
  );
  assert.doesNotMatch(convocationLookup, /"archived"/);
});

test("les anciens téléchargements restent bornés à l'organisme de l'agent avant le lien signé", async () => {
  const [convention, convocation] = await Promise.all([
    readFile(conventionPath, "utf8"),
    readFile(convocationPath, "utf8"),
  ]);

  for (const source of [convention, convocation]) {
    assert.match(source, /requireSupportAgent\(\)/);
    assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
    assert.match(
      source,
      /\.from\("daily_sessions"\)[\s\S]*\.in\("organisation_id",\s*organisationIds\)[\s\S]*createSignedUrl/,
    );
  }
});
