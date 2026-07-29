import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Code2,
  Hammer,
  Rocket,
  Search,
  TestTube2,
} from "lucide-react";
import { activityTypeLabels } from "@/lib/forge/labels";
import type { ActivityEntry, ActivityType } from "@/lib/forge/types";
import { MissionStatusBadge } from "./Badges";

const icons: Record<ActivityType, React.ReactNode> = {
  mission_received: <CircleDot size={15} />,
  analysis: <Search size={15} />,
  development: <Code2 size={15} />,
  test: <TestTube2 size={15} />,
  error: <AlertTriangle size={15} />,
  correction: <Hammer size={15} />,
  build: <Hammer size={15} />,
  deployment: <Rocket size={15} />,
  blocked: <AlertTriangle size={15} />,
  completed: <CheckCircle2 size={15} />,
  user_validation: <CheckCircle2 size={15} />,
};

export default function ActivityJournal({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ol className="forge-journal">
      {[...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((entry) => (
        <li key={entry.id}>
          <span className={`forge-journal__icon forge-journal__icon--${entry.type}`}>{icons[entry.type]}</span>
          <div>
            <div className="forge-journal__meta">
              <span>{activityTypeLabels[entry.type]}</span>
              <time dateTime={entry.occurredAt}>
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.occurredAt))}
              </time>
            </div>
            <p>{entry.message}</p>
            {entry.status && <MissionStatusBadge status={entry.status} />}
          </div>
        </li>
      ))}
    </ol>
  );
}
