import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyPilotageTasks, canTreatDailyPilotageTask } from "@/lib/server/dailyPilotageVisibility";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function back(request: Request, key?: string, value?: string) { const url = new URL("/agent/daily/escalations", request.url); if (key && value) url.searchParams.set(key, value); return NextResponse.redirect(url, 303); }
function sessionIdFromHref(href: string) { return href.match(/\/(?:sessions|session-dossiers)\/([0-9a-f-]{36})(?:\/|$)/i)?.[1] ?? null; }

export async function POST(request: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const formData = await request.formData();
  const action = text(formData, "action");
  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: adminUser }] = await Promise.all([
    admin.from("agent_profiles").select("id,role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  if (!profile?.id) return back(request, "error", "Profil agent actif introuvable.");
  const isAdmin = adminUser?.role === "admin" || profile.role === "admin";

  if (action === "create") {
    const targetType = text(formData, "target_type");
    const reason = text(formData, "reason");
    if (!reason) return back(request, "error", "Le motif de l’escalade est obligatoire.");
    let organisationId = "";
    let sessionId: string | null = null;
    let taskKey: string | null = null;
    let taskTitle: string | null = null;
    let targetHref = "";

    if (targetType === "task") {
      taskKey = text(formData, "task_key");
      const tasks = await getDailyPilotageTasks();
      const task = tasks.find((item) => item.id === taskKey);
      if (!task || task.kind === "assignment") return back(request, "error", "Cette tâche n’est plus disponible pour une escalade.");
      if (!canTreatDailyPilotageTask(task, { id: profile.id, role: isAdmin ? "admin" : "agent" })) return back(request, "error", "Cette tâche est assignée à un autre agent.");
      organisationId = task.organisationId;
      sessionId = sessionIdFromHref(task.href);
      taskTitle = task.title;
      targetHref = task.href;
    } else if (targetType === "dossier") {
      sessionId = text(formData, "session_id") || null;
      if (!sessionId) return back(request, "error", "Session manquante.");
      const [{ data: session }, { data: dossier }] = await Promise.all([
        admin.from("daily_sessions").select("id,organisation_id,status").eq("id", sessionId).neq("status", "archived").maybeSingle(),
        admin.from("daily_session_dossiers").select("session_id,assigned_agent_profile_id").eq("session_id", sessionId).maybeSingle(),
      ]);
      if (!session || !dossier) return back(request, "error", "Dossier de session introuvable.");
      if (!isAdmin && dossier.assigned_agent_profile_id && dossier.assigned_agent_profile_id !== profile.id) return back(request, "error", "Ce dossier est assigné à un autre agent.");
      organisationId = session.organisation_id;
      targetHref = `/agent/daily/session-dossiers/${sessionId}/full`;
    } else {
      return back(request, "error", "Type d’escalade invalide.");
    }

    const { data: escalation, error } = await admin.from("daily_work_escalations").insert({
      organisation_id: organisationId,
      session_id: sessionId,
      target_type: targetType,
      task_key: taskKey,
      task_title: taskTitle,
      target_href: targetHref,
      reason,
      status: "open",
      escalated_by: profile.id,
    }).select("id").single();
    if (error) return back(request, "error", error.code === "23505" ? "Une escalade est déjà ouverte pour cet élément." : error.message);

    const { error: eventError } = await admin.from("daily_work_escalation_events").insert({ escalation_id: escalation.id, event_type: "created", actor_id: profile.id, message: reason });
    if (eventError) { await admin.from("daily_work_escalations").delete().eq("id", escalation.id); return back(request, "error", eventError.message); }
    return back(request, "created", "1");
  }

  if (!isAdmin) return back(request, "error", "Action réservée aux administrateurs.");
  const escalationId = text(formData, "escalation_id");
  const message = text(formData, "message");
  const { data: escalation } = await admin.from("daily_work_escalations").select("id,status").eq("id", escalationId).maybeSingle();
  if (!escalation) return back(request, "error", "Escalade introuvable.");

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  let eventType: "taken" | "returned" | "resolved";
  if (action === "take") { if (escalation.status !== "open") return back(request, "error", "Cette escalade n’est plus ouverte."); patch = { status: "in_progress", handled_by: profile.id, updated_at: now }; eventType = "taken"; }
  else if (action === "return") { if (!message) return back(request, "error", "Ajoute une instruction pour l’agent."); patch = { status: "returned", handled_by: profile.id, resolution_note: message, updated_at: now }; eventType = "returned"; }
  else if (action === "resolve") { if (!message) return back(request, "error", "La résolution doit être renseignée."); patch = { status: "resolved", handled_by: profile.id, resolution_note: message, resolved_at: now, updated_at: now }; eventType = "resolved"; }
  else return back(request, "error", "Action inconnue.");

  const { error } = await admin.from("daily_work_escalations").update(patch).eq("id", escalationId);
  if (error) return back(request, "error", error.message);
  const { error: eventError } = await admin.from("daily_work_escalation_events").insert({ escalation_id: escalationId, event_type: eventType, actor_id: profile.id, message: message || null });
  if (eventError) return back(request, "error", `Escalade mise à jour, mais historique incomplet : ${eventError.message}`);
  return back(request, "updated", "1");
}
