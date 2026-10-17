import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const { buildStudioReminderFollowups } = isolatedTsModule(
  "src/lib/server/studioClientFollowups.ts",
  {
    "@/lib/franceBusinessTime": { isOverdueAfterBusinessHours: () => false },
    "@/lib/daily/signatureReminder24h": {
      isSignatureTerminal: (status, signedAt) => Boolean(signedAt) || ["signed", "expired", "cancelled", "revoked", "refused", "error"].includes(status ?? ""),
    },
    "@/lib/server/dailyAttendanceClientFollowups": { getDailyAttendanceClientFollowups: async () => [] },
    "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => { throw new Error("Live database forbidden in tests"); } },
  },
);

const staff = { id: "agent-1", role: "agent" };
const signatureReminder = {
  id: "reminder-1",
  client_email: "client@example.test",
  dossier_id: null,
  reminder_type: "daily_signature_pending_72h",
  subject: "Signature attendue",
  due_at: "2020-01-01T00:00:00.000Z",
  metadata: {
    source: "daily",
    session_id: "session-1",
    convention_id: "convention-1",
    signature_id: "signature-1",
    assigned_agent_profile_id: "agent-1",
    followup_stage: "phone_call_j9",
  },
};

function canonical({ sessionStatus = "ready", enrolmentStatus, signatureStatus = "pending", signedAt = null } = {}) {
  return {
    sessions: new Map([["session-1", { id: "session-1", status: sessionStatus }]]),
    enrolments: enrolmentStatus
      ? new Map([["enrolment-1", { id: "enrolment-1", session_id: "session-1", status: enrolmentStatus }]])
      : new Map(),
    signatures: new Map([["signature-1", {
      id: "signature-1",
      session_id: "session-1",
      convention_id: "convention-1",
      status: signatureStatus,
      signed_at: signedAt,
    }]]),
  };
}

test("une action humaine de signature active reste visible pour l’agent affecté", () => {
  const rows = buildStudioReminderFollowups([signatureReminder], staff, canonical(), { dailyOnly: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "reminder-1");
});

test("une signature terminale ou effectivement signée retire la relance sans supprimer son historique", () => {
  for (const signatureStatus of ["signed", "expired", "cancelled", "revoked", "refused", "error"]) {
    assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, canonical({ signatureStatus })), []);
  }
  assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, canonical({ signedAt: "2026-10-16T09:00:00.000Z" })), []);
});

test("une session terminale retire la relance", () => {
  for (const sessionStatus of ["archived", "cancelled", "canceled", "deleted", "removed"]) {
    assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, canonical({ sessionStatus })), []);
  }
});

test("une inscription terminale retire une relance qui la référence", () => {
  const reminder = { ...signatureReminder, reminder_type: "daily_registration_followup", metadata: { ...signatureReminder.metadata, enrolment_id: "enrolment-1" } };
  for (const enrolmentStatus of ["declined", "cancelled", "canceled", "abandoned", "completed"]) {
    assert.deepEqual(buildStudioReminderFollowups([reminder], staff, canonical({ enrolmentStatus })), []);
  }
});

test("les références absentes ou incohérentes échouent en mode fermé", () => {
  const missingSignature = canonical();
  missingSignature.signatures.clear();
  assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, missingSignature), []);

  const mismatchedSignature = canonical();
  mismatchedSignature.signatures.get("signature-1").session_id = "session-2";
  assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, mismatchedSignature), []);

  const incomplete = { ...signatureReminder, metadata: { ...signatureReminder.metadata } };
  delete incomplete.metadata.convention_id;
  assert.deepEqual(buildStudioReminderFollowups([incomplete], staff, canonical()), []);
});

test("une relance historique non Daily reste indépendante des états Daily", () => {
  const historical = { ...signatureReminder, id: "historical", reminder_type: "invoice_followup", dossier_id: "dossier-1", metadata: {} };
  const rows = buildStudioReminderFollowups([historical], staff, { sessions: new Map(), enrolments: new Map(), signatures: new Map() });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].href, "/agent/dossiers/dossier-1");
  assert.equal(rows[0].isDaily, false);
});

test("les étapes email automatiques restent absentes de la file humaine", () => {
  for (const followup_stage of ["automatic_email_j3", "automatic_email_j6"]) {
    const reminder = { ...signatureReminder, metadata: { ...signatureReminder.metadata, followup_stage } };
    assert.deepEqual(buildStudioReminderFollowups([reminder], staff, canonical()), []);
  }
});

test("les parents canoniques sans statut ne permettent pas de relance", () => {
  const missingSessionStatus = canonical();
  missingSessionStatus.sessions.get("session-1").status = null;
  assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, missingSessionStatus), []);
  const missingSignatureStatus = canonical();
  missingSignatureStatus.signatures.get("signature-1").status = null;
  assert.deepEqual(buildStudioReminderFollowups([signatureReminder], staff, missingSignatureStatus), []);
  const withEnrolment = { ...signatureReminder, metadata: { ...signatureReminder.metadata, enrolment_id: "enrolment-1" } };
  const missingEnrolmentStatus = canonical({ enrolmentStatus: "active" });
  missingEnrolmentStatus.enrolments.get("enrolment-1").status = null;
  assert.deepEqual(buildStudioReminderFollowups([withEnrolment], staff, missingEnrolmentStatus), []);
});

test("une inscription et une signature de sessions différentes ne créent pas de relance", () => {
  const reminder = { ...signatureReminder, metadata: { ...signatureReminder.metadata, enrolment_id: "enrolment-1" } };
  const state = canonical({ enrolmentStatus: "active" });
  state.enrolments.get("enrolment-1").session_id = "session-2";
  assert.deepEqual(buildStudioReminderFollowups([reminder], staff, state), []);
  const noSessionId = { ...reminder, metadata: { ...reminder.metadata } };
  delete noSessionId.metadata.session_id;
  assert.deepEqual(buildStudioReminderFollowups([noSessionId], staff, state), []);
});

test("AR1 lit les rappels clients par pages ordonnées, sans plafond de 100", async () => {
  const source = await readFile(new URL("../src/lib/server/studioClientFollowups.ts", import.meta.url), "utf8");
  assert.match(source, /\.range\(offset,offset\+FOLLOWUP_PAGE_SIZE-1\)/);
  assert.match(source, /\.order\("due_at",\{ascending:true\}\)\.order\("id",\{ascending:true\}\)/);
  assert.doesNotMatch(source, /\.limit\(100\)/);
});
