import assert from "node:assert/strict";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const today = "2026-10-02T10:00:00Z";
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [today])); }
  static now() { return new Date(today).getTime(); }
}
const business = isolatedTsModule("src/lib/franceBusinessTime.ts", {}, { Date: Clock });
const phases = isolatedTsModule("src/lib/daily/sessionPhase.ts", {}, { Date: Clock });

function fixture() {
  return {
    organisations: ["of-a", "of-b"].map(id => ({ id, name: id, status: "active", created_at: today })),
    daily_organisation_assignments: ["of-a", "of-b"].map(organisation_id => ({ organisation_id, agent_profile_id: organisation_id === "of-a" ? "agent-a" : "agent-b" })),
    daily_sessions: ["of-a", "of-b"].map((organisation_id, i) => ({ id: `session-${i}`, organisation_id, formation_id: `formation-${i}`, status: "active", start_date: "2026-12-01", end_date: "2026-12-02", registration_status: "summary_validated", adaptation_needed: false, updated_at: today })),
    daily_formations: [0, 1].map(i => ({ id: `formation-${i}`, title: `Formation ${i}`, status: "validated", updated_at: today })),
    daily_registration_responses: [{ id: "response-1", session_id: "session-0", created_at: "2026-10-01T08:00:00Z" }],
    daily_registration_reviews: [{ session_id: "session-0", validated_at: "2026-10-01T09:00:00Z" }],
    daily_session_checklist_items: [], daily_quality_actions: [], daily_work_escalations: [],
  };
}

function queryClient(rows, queries) {
  return { from(table) {
    assert.ok(Object.hasOwn(rows, table), `Unexpected table: ${table}`);
    const filters = []; const orders = [];
    const query = {
      select() { return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      neq(key, value) { filters.push(row => row[key] !== value); return query; },
      order(key, { ascending = true } = {}) { orders.push([key, ascending]); return query; },
      then(resolve, reject) {
        queries.push(table);
        let data = rows[table].filter(row => filters.every(f => f(row)));
        for (const [key, ascending] of orders) data.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

function harness(rows) {
  const queries = [];
  const admin = queryClient(rows, queries);
  const tasks = isolatedTsModule("src/lib/server/dailyAgentTasks.ts", {
    "@/lib/franceBusinessTime": business,
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => admin },
    "@/lib/server/dailyOrganisationScope": { getActiveDailyOrganisationIds: async () => ["of-a", "of-b"] },
    "@/lib/daily/sessionPhase": phases,
  }, { Date: Clock });
  const pilotage = isolatedTsModule("src/lib/server/dailyPilotageVisibility.ts", {
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => admin },
    "@/lib/server/dailyAgentTasks": tasks,
  });
  return { ...tasks, ...pilotage, queries };
}
const adminStaff = { id: null, role: "admin" };

test("les tâches validées restent dans l'historique, absentes de Dashboard et Pilotage", async () => {
  const rows = fixture();
  rows.daily_session_checklist_items = ["todo", "in_progress", "to_review", "blocked", "validated", "completed", "done", "not_applicable"].map(status => ({ id: status, session_id: "session-0", organisation_id: "of-a", item_key: "trainer_assignment", phase: "before", responsibility: "selen", label: status, status, signaled_at: today }));
  const h = harness(rows);
  const dashboard = await h.getDailyAgentTasks({ id: "agent-a", role: "agent" });
  const pilotage = await h.getDailyPilotageTasks();
  const expected = ["daily-session-checklist-todo", "daily-session-checklist-in_progress", "daily-session-checklist-to_review", "daily-session-checklist-blocked"];
  assert.deepEqual(Array.from(dashboard, x => x.id), expected);
  assert.deepEqual(Array.from(pilotage, x => x.id), expected);
  assert.equal(rows.daily_session_checklist_items.length, 8);
});

test("la vue OF exclut réellement les tâches d'un autre OF et un OF hors abonnement", async () => {
  const rows = fixture();
  rows.daily_formations.forEach(row => row.status = "review");
  const h = harness(rows);
  assert.deepEqual(Array.from(await h.getDailyAgentTasks(adminStaff, { organisationId: "of-a" }), x => x.organisationId), ["of-a"]);
  assert.deepEqual(Array.from(await h.getDailyAgentTasks(adminStaff, { organisationId: "of-b" }), x => x.organisationId), ["of-b"]);
  h.queries.length = 0;
  assert.equal((await h.getDailyAgentTasks(adminStaff, { organisationId: "of-inactive" })).length, 0);
  assert.equal(h.queries.length, 0);
});

test("une validation courante ferme la tâche inscription ; une nouvelle réponse la réouvre sans doublon", async () => {
  const rows = fixture(); const h = harness(rows);
  assert.equal((await h.getDailyAgentTasks(adminStaff)).length, 0);
  rows.daily_registration_responses.push({ id: "response-2", session_id: "session-0", created_at: today });
  const opened = await h.getDailyAgentTasks(adminStaff);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].id, "daily-registration-session-0");
  assert.equal(opened[0].createdAt, today);
  assert.equal(opened[0].reason, "Dossier d'inscription mis à jour");
  rows.daily_registration_reviews[0].validated_at = today;
  assert.equal((await h.getDailyPilotageTasks()).length, 0);
});

test("un programme partagé par deux sessions donne une seule tâche puis disparaît après validation", async () => {
  const rows = fixture();
  rows.daily_formations[0].status = "review";
  rows.daily_sessions.push({ ...rows.daily_sessions[0], id: "session-extra" });
  const h = harness(rows);
  const tasks = await h.getDailyAgentTasks(adminStaff);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "daily-program-formation-0");
  rows.daily_formations[0].status = "validated";
  assert.equal((await h.getDailyPilotageTasks()).length, 0);
});

test("les tâches client, d'une session archivée ou d'une phase future ne remontent pas", async () => {
  const rows = fixture(); rows.daily_sessions[1].status = "archived";
  rows.daily_session_checklist_items = [
    { id: "client", session_id: "session-0", organisation_id: "of-a", responsibility: "client", phase: "before" },
    { id: "future", session_id: "session-0", organisation_id: "of-a", responsibility: "selen", phase: "after" },
    { id: "archive", session_id: "session-1", organisation_id: "of-b", responsibility: "selen", phase: "before" },
  ].map(row => ({ ...row, item_key: "trainer_assignment", status: "todo", label: row.id, signaled_at: today }));
  assert.equal((await harness(rows).getDailyAgentTasks(adminStaff)).length, 0);
});

test("la visibilité et les droits de traitement conservent l'assignation et l'escalade existantes", async () => {
  const rows = fixture(); rows.daily_formations[0].status = "review";
  const h = harness(rows);
  assert.equal((await h.getDailyAgentTasks({ id: "agent-b", role: "agent" })).length, 0);
  const [task] = await h.getDailyPilotageTasks();
  assert.equal(h.canTreatDailyPilotageTask(task, { id: "agent-b", role: "agent" }), false);
  assert.equal(h.canTreatDailyPilotageTask(task, { id: "agent-a", role: "agent" }), true);
  rows.daily_formations[0].agent_review_signaled_at = "2026-09-30T08:00:00Z";
  assert.equal((await h.getDailyAgentTasks({ id: "agent-b", role: "agent" })).length, 1);
  assert.equal(rows.daily_organisation_assignments[0].agent_profile_id, "agent-a");
});
