import { CheckCircle2 } from "lucide-react";
import { priorityLabels } from "@/lib/forge/labels";
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
  return (
    <button className={`forge-mission-card ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <div className="forge-mission-card__top">
        <MissionStatusBadge status={mission.status} />
        <span className={`forge-priority forge-priority--${mission.priority}`}>
          {priorityLabels[mission.priority]}
        </span>
      </div>
      <h3>{mission.title}</h3>
      <p className="forge-mission-project">{mission.project}</p>
      <p>{mission.description}</p>
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
