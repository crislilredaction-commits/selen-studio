import { AlertTriangle, Bot, CheckCircle2 } from "lucide-react";
import { checkpointLabels, priorityLabels } from "@/lib/forge/labels";
import type { Mission } from "@/lib/forge/types";
import { MissionStatusBadge } from "./Badges";

export default function MissionCard({
  mission,
  selected,
  onSelect,
}: {
  mission: Mission;
  selected: boolean;
  onSelect: () => void;
}) {
  const verified = mission.checklist.filter((item) => item.checked).length;
  const openIncidents = mission.incidents.filter((incident) =>
    !["resolved", "ignored_with_justification"].includes(incident.resolutionStatus)
  );
  const checkpoint = mission.checkpoints.find((item) => item.status === "in_progress")
    ?? mission.checkpoints.find((item) => !["completed", "skipped"].includes(item.status));
  const lastActivity = mission.activities.at(-1)?.occurredAt ?? mission.createdAt;
  const needsAction = mission.status === "blocked"
    || openIncidents.some((incident) => incident.category === "human_decision_required" || incident.category === "critical_error")
    || Boolean(mission.currentPlan && mission.currentPlan.status !== "validated");
  return (
    <button className={`forge-mission-card ${selected ? "is-selected" : ""} ${needsAction ? "needs-action" : ""}`} onClick={onSelect}>
      {needsAction ? <strong className="forge-needs-action"><AlertTriangle size={14} /> Action humaine requise</strong> : null}
      <div className="forge-mission-card__top">
        <MissionStatusBadge status={mission.status} />
        <span className={`forge-priority forge-priority--${mission.priority}`}>
          {priorityLabels[mission.priority]}
        </span>
      </div>
      <h3>{mission.title}</h3>
      <p className="forge-mission-project">{mission.project}</p>
      <p>{mission.description}</p>
      <dl className="forge-mission-card__facts">
        <div><dt>Agent</dt><dd><Bot size={13} /> Cody</dd></div>
        <div><dt>Étape actuelle</dt><dd>{checkpoint ? checkpointLabels[checkpoint.key] : "Terminée"}</dd></div>
        <div><dt>Incidents ouverts</dt><dd>{openIncidents.length}</dd></div>
        <div><dt>Plan courant</dt><dd>{mission.currentPlan ? `v${mission.currentPlan.version} · ${mission.currentPlan.status}` : "Aucun"}</dd></div>
        <div><dt>Dernière activité</dt><dd>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastActivity))}</dd></div>
      </dl>
      {typeof mission.progress === "number" && (
        <div className="forge-progress" aria-label={`Progression : ${mission.progress} %`}>
          <span style={{ width: `${mission.progress}%` }} />
        </div>
      )}
      <div className="forge-mission-card__footer">
        <span>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(mission.createdAt))}</span>
        <span><CheckCircle2 size={14} /> {verified}/{mission.checklist.length}</span>
      </div>
    </button>
  );
}
