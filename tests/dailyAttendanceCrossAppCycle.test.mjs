import assert from "node:assert/strict";
import test from "node:test";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const { buildDailyAttendanceClientFollowups } = isolatedTsModule("src/lib/server/dailyAttendanceClientFollowups.ts", {
  "@/lib/franceBusinessTime": { isOverdueAfterBusinessHours: (value, hours, now) => now.getTime() - new Date(value).getTime() >= hours * 60 * 60 * 1000 },
  "@/lib/server/dailyOrganisationScope": { getActiveDailyOrganisationIds: async () => [] },
  "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => ({}) },
}, { Date, encodeURIComponent, Intl, Map, Object, Set });

const { buildDailyAttendanceRegularizations } = isolatedTsModule("src/lib/server/dailyAttendanceRegularizations.ts", {
  "@/lib/server/dailyOrganisationScope": { getActiveDailyOrganisationIds: async () => [] },
  "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => ({}) },
}, { encodeURIComponent, Intl, Map, Number, Object, Set, String });

const now = new Date("2026-10-23T10:00:00.000Z");
const slot = { id: "slot", organisation_id: "of", session_id: "session", status: "closed", slot_date: "2026-10-21", starts_at: "09:00", ends_at: "12:00", daily_sessions: { internal_reference: "S-AR1", status: "completed", daily_formations: { title: "Formation AR1" } } };
const enrolment = { id: "enrolment", organisation_id: "of", session_id: "session", status: "confirmed", daily_learners: { first_name: "Ada", last_name: "Test", email: "ada@example.test" } };
const organisations = [{ id: "of", name: "OF Test", legal_name: "OF Test SAS" }];
const sessions = [{ id: "session", status: "completed", internal_reference: "S-AR1", daily_formations: { title: "Formation AR1" } }];
const assignments = [{ organisation_id: "of", agent_profile_id: "agent" }];
const staff = { id: "agent", role: "agent" };

function correctionRequest(id, version, sentAt) {
  return { id, organisation_id: "of", session_id: "session", enrolment_id: "enrolment", recipient_email: "ada@example.test", recipient_name: "Ada Test", communication_type: "attendance_correction_request", status: "sent", sent_at: sentAt, created_at: sentAt, metadata: { attendance_slot_id: "slot", review_version: version } };
}

function regularizations(record) {
  return buildDailyAttendanceRegularizations({
    slots: [slot],
    enrolments: [enrolment],
    records: [record],
    organisations,
    now: { date: "2026-10-23", minutes: 12 * 60 },
  });
}

function clientFollowups(record, communications) {
  return buildDailyAttendanceClientFollowups({
    communications,
    enrolments: [enrolment],
    slots: [slot],
    records: [record],
    sessions,
    assignments,
    staff,
    now,
  });
}

test("AR1 synchronise le cycle Daily vers les deux files Studio sans perdre l’historique", () => {
  const requestV1 = correctionRequest("correction-v1", 1, "2026-10-21T08:00:00.000Z");
  const rejectedV1 = { slot_id: "slot", enrolment_id: "enrolment", status: "pending", evidence_metadata: { late_review: { state: "rejected", version: 1, versions: [{ version: 1, state: "rejected" }] } } };

  assert.equal(clientFollowups(rejectedV1, [requestV1]).length, 1);
  assert.equal(regularizations(rejectedV1)[0].reviewState, "rejected");
  assert.match(regularizations(rejectedV1)[0].detail, /preuve v1 rejetée/);

  const awaitingV2 = { ...rejectedV1, evidence_metadata: { late_review: { state: "awaiting_validation", version: 2, submitted_via: "targeted_correction_link", versions: [{ version: 1, state: "rejected" }, { version: 2, state: "awaiting_validation" }] } } };
  assert.equal(clientFollowups(awaitingV2, [requestV1]).length, 0, "la resoumission ciblée ferme Clients à relancer");
  assert.equal(regularizations(awaitingV2)[0].reviewState, "awaiting_validation", "la preuve reste à valider par un agent");
  assert.match(regularizations(awaitingV2)[0].detail, /preuve v2 à valider/);

  const rejectedV2 = { ...awaitingV2, evidence_metadata: { late_review: { state: "rejected", version: 2, versions: [{ version: 1, state: "rejected" }, { version: 2, state: "rejected" }] } } };
  assert.equal(clientFollowups(rejectedV2, [requestV1]).length, 0, "une ancienne demande v1 ne rouvre pas le cycle v2");
  assert.match(regularizations(rejectedV2)[0].detail, /preuve v2 rejetée/);

  const requestV2 = correctionRequest("correction-v2", 2, "2026-10-21T09:00:00.000Z");
  const communications = [requestV1, requestV2];
  const snapshot = structuredClone(communications);
  const reopened = clientFollowups(rejectedV2, communications);
  assert.equal(reopened.length, 1);
  assert.equal(reopened[0].id, "attendance-followup-correction-v2");
  assert.deepEqual(communications, snapshot, "l’historique des demandes reste intact");
  assert.deepEqual(rejectedV2.evidence_metadata.late_review.versions.map((entry) => entry.version), [1, 2]);
});

test("la file de régularisation s’ouvre dès la minute exacte de fin du créneau", () => {
  const record = { slot_id: "slot", enrolment_id: "enrolment", status: "pending", evidence_metadata: {} };
  assert.equal(buildDailyAttendanceRegularizations({ slots: [slot], enrolments: [enrolment], records: [record], organisations, now: { date: "2026-10-21", minutes: 12 * 60 } }).length, 1);
});
