import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeEscalationFilters, countEscalationStatuses, triageEscalations } from "../src/lib/daily/escalationTriage.mjs";

const page = readFileSync(new URL("../src/app/agent/daily/escalations/page.tsx", import.meta.url), "utf8");
const row = (id, status, extra = {}) => ({
  id, status, task_title: id, task_key: id, reason: "Blocage",
  created_at: "2026-10-25T10:00:00Z", escalated_by: "agent", handled_by: null, ...extra,
});

test("escalades : paramètres bornés et statuts inconnus ignorés", () => {
  assert.deepEqual(normalizeEscalationFilters({ q: " a".repeat(90), etat: "unknown" }), {
    q: " a".repeat(90).trim().slice(0, 80), status: "all",
  });
  assert.deepEqual(normalizeEscalationFilters({ etat: ["returned", "open"] }), { q: "", status: "returned" });
});

test("escalades : recherche accent-insensible sur tâche, motif et agent", () => {
  const rows = [row("a", "open", { task_title: "Réclamation urgente" }), row("b", "returned")];
  const emails = new Map([["agent", "élodie@example.org"]]);
  assert.deepEqual(triageEscalations(rows, { q: "reclamation", status: "all" }, emails).map(x => x.id), ["a"]);
  assert.equal(triageEscalations(rows, { q: "elodie", status: "all" }, emails).length, 2);
  assert.equal(triageEscalations(rows, { q: "absent", status: "all" }, emails).length, 0);
});

test("escalades : compteurs et filtres conservent l'historique", () => {
  const rows = [row("o", "open"), row("p", "in_progress"), row("r", "returned"), row("c", "resolved")];
  assert.deepEqual(countEscalationStatuses(rows), { all: 4, open: 1, in_progress: 1, returned: 1, resolved: 1 });
  assert.deepEqual(triageEscalations(rows, { q: "", status: "resolved" }).map(x => x.id), ["c"]);
});

test("escalades : priorités admin/agent et ancienneté sans mutation", () => {
  const rows = Object.freeze([
    Object.freeze(row("new", "open", { created_at: "2026-10-26T10:00:00Z" })),
    Object.freeze(row("old", "open", { created_at: "2026-10-24T10:00:00Z" })),
    Object.freeze(row("returned", "returned")), Object.freeze(row("closed", "resolved")),
  ]);
  const filters = { q: "", status: "all" };
  assert.deepEqual(triageEscalations(rows, filters, new Map(), true).map(x => x.id), ["old", "new", "returned", "closed"]);
  assert.deepEqual(triageEscalations(rows, filters).map(x => x.id), ["returned", "old", "new", "closed"]);
  assert.equal(rows[0].id, "new");
});

test("escalades : filtre après périmètre agent, droits et formulaires inchangés", () => {
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /query = query\.eq\("escalated_by", profile\.id\)\.in\("organisation_id", organisationIds\)/);
  assert.ok(page.indexOf('const { data: rows, error }') < page.indexOf("triageEscalations(escalations, filters"));
  assert.match(page, /isAdmin && row\.status === "open"/);
  assert.match(page, /isAdmin && \["open","in_progress"\]\.includes\(row\.status\)/);
  assert.doesNotMatch(page, /\.(insert|update|delete|upsert)\(/);
});
