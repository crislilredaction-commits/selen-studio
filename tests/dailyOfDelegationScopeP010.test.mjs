import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");
const layout = "../src/app/agent/daily/organisations/[id]/layout.tsx";
const qualiopi = "../src/app/agent/daily/organisations/[id]/qualiopi-cycle/page.tsx";
const proofs = "../src/app/agent/daily/organisations/[id]/trainer-certification-proofs/page.tsx";

test("P0-10: the organisation layout fails closed before rendering nested pages", async () => {
  const text = await source(layout);
  assert.match(text, /if \(!auth\.ok\) return <main[^;]+Accès Studio refusé/);
  assert.doesNotMatch(text, /if \(!auth\.ok\) return children/);
  const scope = text.indexOf("await isDailyOrganisationInAgentScope(auth.email, id)");
  const children = text.lastIndexOf("{children}");
  assert.ok(scope > 0 && children > scope, "no child page may render before checking OF scope");
  assert.match(text, /if \(!\(await isDailyOrganisationInAgentScope\(auth\.email, id\)\)\) \{/);
  assert.match(text, /canSelfAssign \? <>[\s\S]*action="\/agent\/api\/daily\/organisation-assignment"/);
});

for (const [name, path] of [["Qualiopi", qualiopi], ["trainer certification proofs", proofs]]) {
  test(`P0-10: ${name} rejects a non-assigned agent before service-role reads`, async () => {
    const text = await source(path);
    const auth = text.indexOf("await requireSupportAgent()");
    const scope = text.indexOf("await isDailyOrganisationInAgentScope(auth.email, organisationId)");
    const admin = text.indexOf("const admin = createSupabaseAdminClient()");
    assert.ok(auth >= 0 && scope > auth && admin > scope);
    assert.match(text, /Organisme hors de ton périmètre Daily/);
  });
}

test("P0-10: trainer certifications are queried only for OF-scoped trainer IDs", async () => {
  const text = await source(proofs);
  const trainers = text.indexOf('admin.from("daily_trainer_profiles")');
  const ids = text.indexOf("const trainerIds = trainers.map");
  const certifications = text.indexOf('admin.from("daily_trainer_certifications")');
  assert.ok(trainers >= 0 && ids > trainers && certifications > ids);
  assert.match(text, /trainerIds\.length\s*\? await admin\.from\("daily_trainer_certifications"\)/);
  assert.match(text, /\.in\("trainer_profile_id", trainerIds\)/);
  assert.match(text, /: \{ data: \[\], error: null \}/);
  assert.doesNotMatch(text, /const trainerIds = new Set/);
});
