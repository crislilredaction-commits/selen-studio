import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterLearnerOrganisation, learnerOrganisationOptions, resolveLearnerOrganisation } from "../src/lib/daily/learnerOrganisationScope.mjs";

const rows = [
  { id: "e1", organisation_id: "of-a", organisations: { name: "École Alpha" }, status: "confirmed" },
  { id: "e2", organisation_id: "of-b", organisations: { name: "Bêta Formation" }, status: "confirmed" },
  { id: "e3", organisation_id: "of-a", organisations: { name: "École Alpha" }, status: "cancelled" },
];

test("les options sont dédupliquées et dérivées uniquement des inscriptions autorisées", () => {
  assert.deepEqual(learnerOrganisationOptions(rows), [
    { id: "of-b", name: "Bêta Formation" },
    { id: "of-a", name: "École Alpha" },
  ]);
  assert.deepEqual(learnerOrganisationOptions([]), []);
});

test("une sélection non autorisée échoue fermée, sans élargir la portée", () => {
  const options = learnerOrganisationOptions(rows);
  assert.deepEqual(resolveLearnerOrganisation("of-a", options), { id: "of-a", valid: true });
  assert.deepEqual(resolveLearnerOrganisation("of-inconnu", options), { id: null, valid: false });
  assert.deepEqual(resolveLearnerOrganisation(["of-b", "of-a"], options), { id: "of-b", valid: true });
  assert.deepEqual(resolveLearnerOrganisation(undefined, options), { id: null, valid: true });
});

test("le filtre isole inscriptions actives et historiques sans mutation", () => {
  const before = structuredClone(rows);
  assert.deepEqual(filterLearnerOrganisation(rows, "of-a").map((row) => row.id), ["e1", "e3"]);
  assert.deepEqual(filterLearnerOrganisation(rows, "of-b").map((row) => row.id), ["e2"]);
  assert.deepEqual(filterLearnerOrganisation(rows, null), rows);
  assert.deepEqual(rows, before);
});

const page = readFileSync(new URL("../src/app/agent/daily/learners/page.tsx", import.meta.url), "utf8");
test("la sélection intervient après authentification et requête bornée aux affectations", () => {
  const auth = page.indexOf("await requireSupportAgent()");
  const scope = page.indexOf("await getDailyOrganisationIdsForAgent(auth.email)");
  const enrolments = page.indexOf('admin.from("daily_session_enrolments")');
  const options = page.indexOf("learnerOrganisationOptions(allEnrolments)");
  assert.ok(auth >= 0 && auth < scope && scope < enrolments && enrolments < options);
  assert.match(page, /if \(!selectedOrganisation\.valid\) return/);
  assert.match(page, /filterLearnerOrganisation\(activeEnrolments, selectedOrganisation\.id\)/);
  assert.match(page, /filterLearnerOrganisation\(historicalEnrolments, selectedOrganisation\.id\)/);
});

test("le filtre conserve la recherche et les priorités, mais les compteurs suivent l'OF sélectionné", () => {
  assert.match(page, /name="organisme" defaultValue=\{selectedOrganisation\.id \?\? ""\}/);
  assert.match(page, /countLearnerViews\(scopedActiveEnrolments, needsMap\)/);
  assert.match(page, /prioritizeLearnerEnrolments\(scopedActiveEnrolments, needsMap\)/);
  assert.match(page, /filterLearnerEnrolments\(scopedHistoricalEnrolments, query, "all"\)/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="vue"/);
});
