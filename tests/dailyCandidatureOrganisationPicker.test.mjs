import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { candidatureOrganisationOptions } from "../src/lib/daily/candidatureOrganisationScope.mjs";

test("les organismes proposés sont exclusivement ceux affectés à l'agent", () => {
  const rows = [
    { id: "of-b", name: "Bêta Formation" },
    { id: "of-a", name: "École Alpha" },
    { id: "of-c", name: "Confidentiel" },
    { id: "of-a", name: "Doublon" },
  ];
  assert.deepEqual(candidatureOrganisationOptions(rows, ["of-a", "of-b"]), [
    { id: "of-b", name: "Bêta Formation" },
    { id: "of-a", name: "École Alpha" },
  ]);
});

test("un nom manquant est géré sans divulguer de données ni muter les entrées", () => {
  const rows = [{ id: "of-a", name: " " }, { id: "of-b", name: null }, { id: "of-c", name: "Non autorisé" }];
  const original = structuredClone(rows);
  assert.deepEqual(candidatureOrganisationOptions(rows, ["of-a", "of-b"]), [
    { id: "of-a", name: "Organisme sans nom" },
    { id: "of-b", name: "Organisme sans nom" },
  ]);
  assert.deepEqual(rows, original);
  assert.deepEqual(candidatureOrganisationOptions([], ["of-a"]), []);
});

const page = readFileSync(new URL("../src/app/agent/daily/candidatures/page.tsx", import.meta.url), "utf8");

test("authentification et affectations précèdent toutes les lectures service-role", () => {
  const auth = page.indexOf("await requireSupportAgent()");
  const scope = page.indexOf("await getDailyOrganisationIdsForAgent(auth.email)");
  const names = page.indexOf('admin.from("organisations")');
  const formations = page.indexOf('admin.from("daily_formations")');
  assert.ok(auth >= 0 && auth < scope && scope < names && names < formations);
  assert.match(page, /\.in\("id", organisationIds\)/);
  assert.match(page, /requestedOrganisation && !organisationIds\.includes\(requestedOrganisation\)/);
  assert.match(page, /if \(organisationError\) return/);
});

test("la sélection d'un organisme borne les formations et donc les candidatures", () => {
  assert.match(page, /scopedOrganisationIds = requestedOrganisation && organisationIds\.includes\(requestedOrganisation\) \? \[requestedOrganisation\] : organisationIds/);
  assert.match(page, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(page, /\.in\("formation_id", formationIds\)/);
  assert.match(page, /\.in\("registration_request_id", requestIds\)/);
});

test("le sélecteur, la recherche et les priorités restent utilisables ensemble", () => {
  assert.match(page, /name="organisation" defaultValue=\{requestedOrganisation \?\? ""\}/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="vue"/);
  assert.match(page, /countCandidatureQueueViews\(rows, evidenceByRequest\)/);
  assert.match(page, /filterCandidatureQueue\(prioritizedRows, query, view, evidenceByRequest\)/);
  assert.match(page, /organisationNameById\.get\(organisationId\)/);
  assert.match(page, /href="\/agent\/daily\/candidatures"[^>]*>Réinitialiser/);
});

test("la refonte ne déclenche ni écriture métier ni email", () => {
  assert.doesNotMatch(page, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|resend\.emails\.send\(/);
});
