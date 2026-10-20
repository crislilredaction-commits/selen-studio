type AttendanceFollowupStatusInput = {
  activeEnrolmentCount: number;
  slotStatuses: string[];
  activeRecordStatuses: string[];
  openEntryCount: number;
};

export function resolveAttendanceFollowupStatus(input: AttendanceFollowupStatusInput) {
  if (input.openEntryCount > 0) return "in_progress";
  if (input.activeEnrolmentCount === 0) return "validated";

  const allSlotsClosed = input.slotStatuses.length > 0
    && input.slotStatuses.every((status) => ["closed", "cancelled"].includes(status));
  const allRecordsDecided = input.activeRecordStatuses.length > 0
    && input.activeRecordStatuses.every((status) => status !== "pending");
  const hasAttendanceActivity = input.slotStatuses.some((status) => status !== "draft")
    || input.activeRecordStatuses.some((status) => status !== "pending");

  if (input.openEntryCount === 0 && allSlotsClosed && allRecordsDecided) return "to_review";
  return hasAttendanceActivity ? "in_progress" : "todo";
}
