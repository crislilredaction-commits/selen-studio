import { NextResponse } from "next/server";
import { requireStudioAdmin } from "@/lib/server/studioAuth";
import { createClient } from "@/lib/supabase/server";

const missionSelection = `
  *,
  forge_activity_logs (*),
  forge_validation_items (*),
  forge_corrections (*),
  forge_mission_reports (*),
  forge_mission_briefs (*),
  forge_mission_plans (*),
  forge_mission_checkpoints (
    *,
    forge_mission_checkpoint_history (*)
  ),
  forge_mission_incidents (
    *,
    forge_mission_incident_attempts (*)
  ),
  forge_human_instructions (*),
  forge_human_decisions (*)
`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const auth = await requireStudioAdmin();
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forge_missions")
    .select(missionSelection)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Les archives de La Forge ne peuvent pas être chargées." },
      { status: 500 },
    );
  }
  return NextResponse.json({ missions: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireStudioAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const missionId = typeof input.missionId === "string" ? input.missionId : "";
  const action = input.action;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!uuidPattern.test(missionId) || !["archive", "restore"].includes(String(action)) || reason.length < 3) {
    return NextResponse.json({ error: "Mission, action ou motif invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("forge_set_mission_archived", {
    p_mission_id: missionId,
    p_archived: action === "archive",
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json(
      { error: "La mission ne peut pas être archivée ou restaurée dans son état actuel." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
