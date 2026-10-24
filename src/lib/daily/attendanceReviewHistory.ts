export type AttendanceReviewHistoryEntry = {
  version: number;
  state: "awaiting_validation" | "validated" | "rejected";
  submittedAt: string | null;
  decidedAt: string | null;
  reason: string | null;
};

type AttendanceReviewRecord = {
  signed_at?: string | null;
  evidence_metadata?: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stateOf(value: Record<string, unknown>): AttendanceReviewHistoryEntry["state"] | null {
  const raw = text(value.decision || value.state).toLowerCase();
  if (["validate", "validated"].includes(raw)) return "validated";
  if (["reject", "rejected"].includes(raw)) return "rejected";
  if (raw === "awaiting_validation") return "awaiting_validation";
  return null;
}

/**
 * Builds the shareable business audit for a late attendance review.
 * Deliberately excludes reviewer ids/emails, storage paths, hashes and access tokens.
 */
export function getAttendanceReviewHistory(record: AttendanceReviewRecord): AttendanceReviewHistoryEntry[] {
  const metadata = object(record.evidence_metadata);
  if (metadata.late_attendance !== true) return [];

  const review = object(metadata.late_review);
  const currentVersion = positiveInteger(review.version);
  const currentState = stateOf(review);
  const byVersion = new Map<number, AttendanceReviewHistoryEntry>();

  for (const rawVersion of Array.isArray(review.versions) ? review.versions : []) {
    const version = object(rawVersion);
    const number = positiveInteger(version.version);
    const state = stateOf(version);
    if (!number || !state) continue;
    byVersion.set(number, {
      version: number,
      state,
      submittedAt: text(version.submitted_at) || null,
      decidedAt: text(version.decided_at) || null,
      reason: state === "rejected" ? text(version.reason || version.rejection_reason) || null : null,
    });
  }

  if (currentVersion && currentState) {
    const existing = byVersion.get(currentVersion);
    byVersion.set(currentVersion, {
      version: currentVersion,
      state: currentState,
      submittedAt: existing?.submittedAt || text(review.submitted_at) || text(record.signed_at) || null,
      decidedAt: existing?.decidedAt || text(review.decided_at) || null,
      reason: currentState === "rejected"
        ? existing?.reason || text(review.rejection_reason) || null
        : null,
    });
  }

  return [...byVersion.values()].sort((a, b) => a.version - b.version);
}

export function attendanceReviewStateLabel(state: AttendanceReviewHistoryEntry["state"]) {
  if (state === "validated") return "Validée";
  if (state === "rejected") return "Rejetée";
  return "En attente de validation";
}
