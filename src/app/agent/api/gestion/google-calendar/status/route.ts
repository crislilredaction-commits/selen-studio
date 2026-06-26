import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { getGoogleCalendarConfigStatus } from "@/lib/server/externalAudits";

export async function GET() {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(getGoogleCalendarConfigStatus());
}
