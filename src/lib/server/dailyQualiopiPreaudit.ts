import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";

export type QualiopiPreauditOrganisation = {
  id: string;
  name: string;
  surveillanceDate: string | null;
  renewalDate: string | null;
  deadline: string;
  deadlineKind: "surveillance" | "renewal";
};

const THREE_MONTHS_MS = 92 * 24 * 60 * 60 * 1000;
function validFutureDate(value: unknown, now: number) {
  if (typeof value !== "string" || !value) return null;
  const time = new Date(`${value}T12:00:00Z`).getTime();
  return Number.isFinite(time) && time >= now && time - now <= THREE_MONTHS_MS ? { value, time } : null;
}

export async function getQualiopiPreauditOrganisations(): Promise<QualiopiPreauditOrganisation[]> {
  const ids = await getActiveDailyOrganisationIds();
  if (!ids.length) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("organisations")
    .select("id,name,legal_name,qualiopi_status,qualiopi_surveillance_audit_date,qualiopi_valid_until")
    .in("id", ids)
    .eq("qualiopi_status", "certified")
    .neq("status", "archived");
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? []).flatMap((row) => {
    const surveillance = validFutureDate(row.qualiopi_surveillance_audit_date, now);
    const renewal = validFutureDate(row.qualiopi_valid_until, now);
    const candidates = [surveillance ? { ...surveillance, kind: "surveillance" as const } : null, renewal ? { ...renewal, kind: "renewal" as const } : null].filter(Boolean) as Array<{value:string;time:number;kind:"surveillance"|"renewal"}>;
    if (!candidates.length) return [];
    candidates.sort((a,b)=>a.time-b.time);
    return [{ id: row.id, name: row.legal_name || row.name || "Organisme Qualiopi", surveillanceDate: row.qualiopi_surveillance_audit_date ?? null, renewalDate: row.qualiopi_valid_until ?? null, deadline: candidates[0].value, deadlineKind: candidates[0].kind }];
  }).sort((a,b)=>a.deadline.localeCompare(b.deadline));
}
