import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  filterPreauditCards, normalizePreauditQuery, normalizePreauditView,
  preauditDaysRemaining, preauditNeedsReview, preauditSummary,
} from "../src/lib/daily/qualiopiPreauditTriage.mjs";

const now = Date.parse("2026-10-27T12:00:00Z");
const card = (name, deadline, checks = [true], ref = "SESSION-1") => ({
  target: { id: name, name, deadline, deadlineKind: "surveillance" },
  orgChecks: checks.map(ok => ({ ok })),
  sessionCards: [{ session: { internal_reference: ref }, checks: [{ ok: true }] }],
  score: checks.every(Boolean) ? 100 : 50,
});

test("recherche bornée et accent-insensible sur libellés autorisés", () => {
  const cards = [card("École Élan", "2026-11-01"), card("Autre", "2026-12-01")];
  assert.deepEqual(filterPreauditCards(cards, { query: " ECOLE " }, now).map(x => x.target.name), ["École Élan"]);
  assert.equal(filterPreauditCards(cards, { query: "session-1" }, now).length, 2);
  assert.equal(normalizePreauditQuery([" x ".repeat(80), "ignored"]).length, 80);
  assert.equal(normalizePreauditQuery({ token: "secret" }), "");
  assert.equal(normalizePreauditView("unknown"), "all");
});

test("les filtres attention, échéance et complets restent exclusifs et explicites", () => {
  const cards = [card("A", "2026-11-01", [false]), card("B", "2026-12-20"), card("C", "2026-11-03")];
  assert.deepEqual(filterPreauditCards(cards, { view: "review" }, now).map(x => x.target.name), ["A"]);
  assert.deepEqual(filterPreauditCards(cards, { view: "soon" }, now).map(x => x.target.name), ["A", "C"]);
  assert.deepEqual(filterPreauditCards(cards, { view: "complete" }, now).map(x => x.target.name), ["C", "B"]);
  assert.deepEqual(preauditSummary(cards, now), { total: 3, review: 1, soon: 2, complete: 2 });
});

test("les contrôles de session participent aux alertes", () => {
  const value = card("A", "2026-12-01");
  value.sessionCards[0].checks[0].ok = false;
  assert.equal(preauditNeedsReview(value), true);
  assert.equal(filterPreauditCards([value], { view: "review" }, now).length, 1);
});

test("les dossiers urgents incomplets passent avant les dossiers complets", () => {
  const cards = [card("Complet lointain", "2026-12-20"), card("Incomplet lointain", "2026-12-15", [false]),
    card("Complet proche", "2026-11-01"), card("Incomplet proche", "2026-11-02", [false])];
  assert.deepEqual(filterPreauditCards(cards, {}, now).map(x => x.target.name),
    ["Incomplet proche", "Incomplet lointain", "Complet proche", "Complet lointain"]);
  assert.equal(preauditDaysRemaining("invalid", now), Infinity);
});

test("la recherche n'indexe pas les preuves ni les détails internes", () => {
  const value = card("Organisme", "2026-11-01");
  value.orgChecks[0].detail = "jeton-prive";
  value.sessionCards[0].session.secret = "secret-session";
  assert.equal(filterPreauditCards([value], { query: "jeton-prive" }, now).length, 0);
  assert.equal(filterPreauditCards([value], { query: "secret-session" }, now).length, 0);
});

test("la refonte respecte la lecture autorisée et ne crée aucune écriture", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/preaudit/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth.email\)/);
  assert.match(page, /getQualiopiPreauditOrganisations\(dailyOrganisationIds\)/);
  assert.match(page, /filterPreauditCards\(cards, \{ query, view \}\)/);
  assert.match(page, /aria-label="Rechercher un organisme ou une session"/);
  assert.match(page, /Réinitialiser les filtres/);
  assert.doesNotMatch(page, /\.(?:insert|update|delete|upsert)\(/);
});
