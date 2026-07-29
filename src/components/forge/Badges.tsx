import { agentStateLabels, missionStatusLabels } from "@/lib/forge/labels";
import type { AgentState, MissionStatus } from "@/lib/forge/types";

export function AgentStatusBadge({ status }: { status: AgentState }) {
  return <span className={`forge-badge forge-badge--${status}`}>{agentStateLabels[status]}</span>;
}

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return <span className={`forge-badge forge-badge--${status}`}>{missionStatusLabels[status]}</span>;
}
