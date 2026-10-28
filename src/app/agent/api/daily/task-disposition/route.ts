import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyAgentTasks } from "@/lib/server/dailyAgentTasks";
import { canTreatDailyPilotageTask } from "@/lib/server/dailyPilotageVisibility";
import { canManuallyDisposeDailyTask, dailyTaskFingerprint } from "@/lib/daily/taskDispositionPolicy.mjs";

export async function POST(request: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origine de la demande invalide." }, { status: 403 });
  }
  const form = await request.formData();
  const taskKey = String(form.get("task_key") ?? "");
  const organisationId = String(form.get("organisation_id") ?? "");
  const fingerprint = String(form.get("fingerprint") ?? "");
  const resolution = String(form.get("resolution") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const returnTo = form.get("return_to") === "/agent" ? "/agent" : "/agent/daily";
  if (!/^daily-[a-z-]+[0-9a-f-]{36}$/.test(taskKey) || !/^[0-9a-f-]{36}$/.test(organisationId)
    || !/^[a-f0-9]{64}$/.test(fingerprint) || !["handled", "dismissed"].includes(resolution)
    || reason.length < 8 || reason.length > 1000) {
    return NextResponse.json({ error: "Demande incomplète ou invalide." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: adminUser, error: adminUserError }] = await Promise.all([
    admin.from("agent_profiles").select("id,role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  if (profileError || adminUserError) return NextResponse.json({ error: "Impossible de vérifier les droits." }, { status: 500 });
  const staff = { id: profile?.id ?? null, role: (adminUser?.role === "admin" || profile?.role === "admin" ? "admin" : "agent") as "admin" | "agent" };
  const tasks = await getDailyAgentTasks({ id: null, role: "admin" });
  const task = tasks.find(item => item.id === taskKey && item.organisationId === organisationId);
  if (!task) return NextResponse.json({ error: "Tâche introuvable dans le périmètre Daily actif." }, { status: 404 });
  if (!canTreatDailyPilotageTask(task, staff) || !canManuallyDisposeDailyTask(task)) {
    return NextResponse.json({ error: "Cette tâche doit être traitée dans son dossier par un agent autorisé." }, { status: 403 });
  }
  if (dailyTaskFingerprint(task) !== fingerprint) {
    return NextResponse.json({ error: "La tâche a changé. Rechargez le tableau avant de la retirer." }, { status: 409 });
  }
  const { data: escalation, error: escalationError } = await admin.from("daily_work_escalations")
    .select("id").eq("organisation_id", organisationId).eq("target_type", "task")
    .eq("task_key", taskKey).in("status", ["open", "in_progress", "returned"]).limit(1);
  if (escalationError) return NextResponse.json({ error: "Impossible de vérifier les escalades." }, { status: 500 });
  if (escalation?.length) return NextResponse.json({ error: "Résolvez d'abord l'escalade active." }, { status: 409 });

  const { error } = await admin.from("daily_agent_task_dispositions").upsert({
    organisation_id: organisationId, task_key: taskKey, fingerprint,
    resolution, reason, actor_user_id: auth.userId, actor_email: auth.email,
    task_title: task.title, task_status: task.status, resolved_at: new Date().toISOString(),
  }, { onConflict: "organisation_id,task_key" });
  if (error) return NextResponse.json({ error: "Impossible d'enregistrer la décision manuelle." }, { status: 500 });
  return NextResponse.redirect(new URL(returnTo + "?task_action=ok", request.url), 303);
}
