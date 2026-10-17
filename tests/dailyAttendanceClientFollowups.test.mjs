import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const path = "src/lib/server/dailyAttendanceClientFollowups.ts";
const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
const { buildDailyAttendanceClientFollowups } = isolatedTsModule(path, {
  "@/lib/franceBusinessTime": { isOverdueAfterBusinessHours: (value, hours, now) => now.getTime() - new Date(value).getTime() >= hours * 60 * 60 * 1000 },
  "@/lib/server/dailyOrganisationScope": { getActiveDailyOrganisationIds: async () => [] },
  "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => ({}) },
}, { encodeURIComponent, Intl, Map, Object, Set });

const now = new Date("2026-10-16T10:00:00.000Z");
const base = {
  communications: [{ id: "communication", organisation_id: "of", session_id: "session", enrolment_id: "enrolment", recipient_email: "ada@example.test", recipient_name: "Ada Test", communication_type: "attendance_reminder", status: "sent", sent_at: "2026-10-14T09:00:00.000Z", created_at: "2026-10-14T08:59:00.000Z", metadata: { attendance_slot_id: "slot" } }],
  enrolments: [{ id: "enrolment", session_id: "session", status: "confirmed", daily_learners: { first_name: "Ada", last_name: "Test", email: "ada@example.test" } }],
  slots: [{ id: "slot", session_id: "session", status: "closed", slot_date: "2026-10-13", starts_at: "09:00", ends_at: "12:00" }],
  records: [{ slot_id: "slot", enrolment_id: "enrolment", status: "pending", evidence_metadata: {} }],
  sessions: [{ id: "session", status: "completed", internal_reference: "S-1", daily_formations: { title: "Formation test" } }],
  assignments: [{ organisation_id: "of", agent_profile_id: "agent" }],
  staff: { id: "agent", role: "agent" },
  now,
};

test("AR1 place une relance d’émargement réellement envoyée dans Clients à relancer après 24 h", () => {
  const rows = buildDailyAttendanceClientFollowups(base);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Ada Test");
  assert.equal(rows[0].reminderType, "daily_attendance_regularization_followup");
  assert.equal(rows[0].href, "/agent/daily/session-dossiers/session/full#attendance-slot-enrolment");
});

test("AR1 n’assimile jamais une communication en attente à un email envoyé", () => {
  for (const status of ["queued", "failed"]) {
    const rows = buildDailyAttendanceClientFollowups({ ...base, communications: [{ ...base.communications[0], status }] });
    assert.equal(rows.length, 0);
  }
});

test("AR1 attend 24 h avant d’afficher une nouvelle relance", () => {
  const rows = buildDailyAttendanceClientFollowups({ ...base, communications: [{ ...base.communications[0], sent_at: "2026-10-16T09:30:00.000Z" }] });
  assert.equal(rows.length, 0);
});

test("AR1 exclut les créneaux futurs ou annulés même si une communication existe", () => {
  const futureSlots = [{ ...base.slots[0], slot_date: "2026-10-17" }];
  assert.equal(buildDailyAttendanceClientFollowups({ ...base, slots: futureSlots }).length, 0);
  for (const status of ["cancelled", "canceled"]) {
    assert.equal(buildDailyAttendanceClientFollowups({ ...base, slots: [{ ...base.slots[0], status }] }).length, 0);
  }
});

test("AR1 retire les inscriptions closes et les présences qualifiées", () => {
  for (const status of ["declined", "cancelled", "abandoned", "completed"]) {
    assert.equal(buildDailyAttendanceClientFollowups({ ...base, enrolments: [{ ...base.enrolments[0], status }] }).length, 0);
  }
  for (const status of ["present", "absent", "excused"]) {
    assert.equal(buildDailyAttendanceClientFollowups({ ...base, records: [{ ...base.records[0], status }] }).length, 0);
  }
});

test("AR1 suspend les relances pendant la validation d’une preuve tardive", () => {
  const records = [{ ...base.records[0], evidence_metadata: { late_review: { state: "awaiting_validation" } } }];
  assert.equal(buildDailyAttendanceClientFollowups({ ...base, records }).length, 0);
});

test("AR1 conserve la reprise après rejet et ne garde que la dernière communication", () => {
  const communications = [
    base.communications[0],
    { ...base.communications[0], id: "latest", sent_at: "2026-10-15T08:00:00.000Z" },
  ];
  const records = [{ ...base.records[0], evidence_metadata: { late_review: { state: "rejected" } } }];
  const rows = buildDailyAttendanceClientFollowups({ ...base, communications, records });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "attendance-followup-latest");
  assert.match(rows[0].detail, /après rejet/);
});

test("AR1 ferme chaque cycle envoyé et rouvre un nouveau cycle après rejet", () => {
  const sentInitial = { ...base.communications[0], id: "followup-initial", communication_type: "attendance_regularization_followup", metadata: { attendance_slot_id: "slot", review_cycle: "initial" } };
  assert.equal(buildDailyAttendanceClientFollowups({ ...base, communications: [base.communications[0], sentInitial] }).length, 0);
  const rejectedRecords = [{ ...base.records[0], evidence_metadata: { late_review: { state: "rejected", version: 2 } } }];
  assert.equal(buildDailyAttendanceClientFollowups({ ...base, communications: [base.communications[0], sentInitial], records: rejectedRecords }).length, 1);
  const sentRejected = { ...sentInitial, id: "followup-rejected", metadata: { attendance_slot_id: "slot", review_cycle: "rejected:v2" } };
  assert.equal(buildDailyAttendanceClientFollowups({ ...base, communications: [base.communications[0], sentInitial, sentRejected], records: rejectedRecords }).length, 0);
});

test("AR1 borne les relances à l’agent assigné et aux tables canoniques", () => {
  assert.equal(buildDailyAttendanceClientFollowups({ ...base, staff: { id: "autre", role: "agent" } }).length, 0);
  for (const table of ["daily_communications", "daily_session_enrolments", "daily_attendance_slots", "daily_attendance_records", "daily_sessions", "daily_organisation_assignments"]) assert.match(source, new RegExp(table));
  assert.match(source, /\.in\("status", \["sent", "delivered"\]\)/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test("AR1 masque les relances lorsque le statut canonique d'un parent est absent", () => {
  for (const status of [null, "", "   "]) {
    assert.equal(buildDailyAttendanceClientFollowups({ ...base, enrolments: [{ ...base.enrolments[0], status }] }).length, 0);
    assert.equal(buildDailyAttendanceClientFollowups({ ...base, slots: [{ ...base.slots[0], status }] }).length, 0);
    assert.equal(buildDailyAttendanceClientFollowups({ ...base, sessions: [{ ...base.sessions[0], status }] }).length, 0);
  }
});
