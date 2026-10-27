import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  communicationHistoryMetrics, filterCommunicationHistory,
  isCommunicationFailure, normalizeCommunicationQuery,
  normalizeCommunicationStatus, normalizeCommunicationType,
} from "../src/lib/daily/communicationHistoryTriage.mjs";

const rows = [
  { id: "a", status: "sent", communication_type: "convocation", recipient_name: "Élodie", subject: "Convocation", organisation_label: "École Aube", created_at: "2026-10-25T12:00:00Z" },
  { id: "b", status: "failed", communication_type: "attendance_reminder", recipient_email: "contact@example.fr", subject: "Émargement", session_label: "SESSION-42", created_at: "2026-10-24T12:00:00Z" },
  { id: "c", status: "queued", communication_type: "convention_signature", subject: "Signature", formation_label: "Formation accueil", created_at: "2026-10-26T12:00:00Z" },
  { id: "d", status: "delivered", communication_type: "satisfaction_request", subject: "Satisfaction", created_at: "2026-10-27T12:00:00Z" },
];

test("communications : recherche accent-insensible dans le contexte autorisé", () => {
  assert.deepEqual(filterCommunicationHistory(rows, { q: "ECOLE" }).map((r) => r.id), ["a"]);
  assert.deepEqual(filterCommunicationHistory(rows, { q: "emargement" }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterCommunicationHistory(rows, { q: "session-42" }).map((r) => r.id), ["b"]);
});

test("communications : statut et catégorie normalisés sans valeur arbitraire", () => {
  assert.equal(normalizeCommunicationStatus("invalid"), "all");
  assert.equal(normalizeCommunicationType("invalid"), "all");
  assert.equal(normalizeCommunicationQuery([" x ".repeat(100), "ignored"]).length, 80);
  assert.equal(normalizeCommunicationQuery({ bad: true }), "");
  assert.deepEqual(filterCommunicationHistory(rows, { etat: "issues", categorie: "attendance" }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterCommunicationHistory(rows, { etat: "sent", categorie: "other" }).map((r) => r.id), ["d", "a"]);
  assert.deepEqual(filterCommunicationHistory(rows, { etat: "queued", categorie: "signature" }).map((r) => r.id), ["c"]);
});

test("communications : échecs priorisés, historique complet et ordre source conservé", () => {
  assert.deepEqual(filterCommunicationHistory(rows).map((r) => r.id), ["b", "d", "c", "a"]);
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c", "d"]);
  assert.equal(isCommunicationFailure({ status: "delivered", failure_reason: "rejet technique" }), true);
  assert.equal(isCommunicationFailure({ status: "bounced" }), true);
});

test("communications : compteurs de l'instantané et aucun contenu sensible indexé", () => {
  assert.deepEqual(communicationHistoryMetrics(rows), { total: 4, issues: 1, queued: 1 });
  const sensitive = [{ id: "private", status: "sent", text_body: "secret", metadata: { token: "secret" } }];
  assert.deepEqual(filterCommunicationHistory(sensitive, { q: "secret" }), []);
});

test("communications : filtrage uniquement après périmètre et sans mutation métier", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/communications/page.tsx", import.meta.url), "utf8");
  const auth = page.indexOf("requireSupportAgent()");
  const scope = page.indexOf("getDailyOrganisationIdsForAgent(auth.email)", auth);
  const admin = page.indexOf("createSupabaseAdminClient()", scope);
  const bounded = page.indexOf('.in("organisation_id", dailyOrganisationIds)', admin);
  const filtered = page.indexOf("filterCommunicationHistory(", bounded);
  assert.ok(auth >= 0 && auth < scope && scope < admin && admin < bounded && bounded < filtered);
  assert.match(page, /name="session_id" value=\{sessionId\}/);
  assert.match(page, /communicationRows\.map\(/);
  assert.doesNotMatch(page, /\.(?:insert|update|upsert|delete)\(/);
});
