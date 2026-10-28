import type { DailyAgentTask } from "@/lib/server/dailyAgentTasks";
import { canManuallyDisposeDailyTask, dailyTaskFingerprint } from "@/lib/daily/taskDispositionPolicy.mjs";

export default function ManualDailyTaskDisposition({ task, returnTo }: { task: DailyAgentTask; returnTo: "/agent" | "/agent/daily" }) {
  if (!canManuallyDisposeDailyTask(task)) return null;
  return <details style={{ marginTop: 10, borderTop: "1px solid var(--selen-border)", paddingTop: 8 }}>
    <summary style={{ cursor: "pointer", fontSize: 12, minHeight: 36 }}>Retirer cette tâche du tableau de bord</summary>
    <p style={{ fontSize: 12, margin: "8px 0", lineHeight: 1.5 }}>
      Cette action masque seulement l'alerte dans les deux tableaux. Elle ne valide aucune obligation,
      ne modifie aucun dossier ni aucune preuve. Une nouvelle modification du dossier réaffichera la tâche.
    </p>
    <form method="post" action="/agent/api/daily/task-disposition" style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="task_key" value={task.id}/>
      <input type="hidden" name="organisation_id" value={task.organisationId}/>
      <input type="hidden" name="fingerprint" value={dailyTaskFingerprint(task)}/>
      <input type="hidden" name="return_to" value={returnTo}/>
      <label style={{ fontSize: 12 }} htmlFor={"task-reason-" + task.id}>Motif obligatoire (8 caractères minimum)</label>
      <textarea id={"task-reason-" + task.id} name="reason" minLength={8} maxLength={1000} required rows={2}
        style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--selen-border)", background: "var(--selen-bg3)", color: "inherit" }}/>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="submit" name="resolution" value="handled" style={{ minHeight: 44, padding: "8px 12px", cursor: "pointer" }}>Traitée manuellement</button>
        <button type="submit" name="resolution" value="dismissed" style={{ minHeight: 44, padding: "8px 12px", cursor: "pointer" }}>Écarter (non pertinente)</button>
      </div>
    </form>
  </details>;
}
