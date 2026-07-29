import { ExternalLink, GitBranch, ShieldCheck } from "lucide-react";
import type { Mission, MissionPlanDraft, ValidationItem } from "@/lib/forge/types";
import { MissionStatusBadge } from "./Badges";
import ActivityJournal from "./ActivityJournal";
import ValidationChecklist from "./ValidationChecklist";
import CorrectionComposer from "./CorrectionComposer";
import MissionReportPanel from "./MissionReportPanel";
import MissionPlanningPanel from "./MissionPlanningPanel";

export default function MissionDetail({
  mission,
  onChecklistChange,
  onAddCorrection,
  onValidate,
  onGenerateReport,
  reportGenerating,
  planningBusy,
  onRegeneratePlan,
  onSavePlan,
  onValidatePlan,
  onDraftPlan,
}: {
  mission: Mission;
  onChecklistChange: (id: string, patch: Partial<ValidationItem>) => void;
  onAddCorrection: (content: string) => void;
  onValidate: () => void;
  onGenerateReport: () => void;
  reportGenerating: boolean;
  planningBusy: boolean;
  onRegeneratePlan: () => Promise<void>;
  onSavePlan: (plan: MissionPlanDraft) => Promise<void>;
  onValidatePlan: () => Promise<void>;
  onDraftPlan: (plan: MissionPlanDraft) => Promise<void>;
}) {
  const planningOnly = mission.planningRequired && [
    "draft",
    "analyzing",
    "needs_clarification",
    "plan_ready",
    "plan_validated",
  ].includes(mission.status);

  return (
    <article className="forge-detail">
      <header className="forge-detail__header">
        <div>
          <p className="forge-eyebrow">{mission.project}</p>
          <h2>{mission.title}</h2>
        </div>
        <MissionStatusBadge status={mission.status} />
      </header>

      <div className="forge-detail__facts">
        <div><span>Objectif</span><p>{mission.objective}</p></div>
        <div><span>Résultat annoncé</span><p>{mission.announcedResult}</p></div>
      </div>

      <section className="forge-detail__section">
        <h3>Périmètre</h3>
        <ul>{mission.scope.map((item) => <li key={item}>{item}</li>)}</ul>
        {(mission.branch || mission.previewUrl) && (
          <div className="forge-resource-links">
            {mission.branch && <span><GitBranch size={15} /> {mission.branch}</span>}
            {mission.previewUrl && (
              <a href={mission.previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Ouvrir la version de test
              </a>
            )}
          </div>
        )}
      </section>

      <section className="forge-detail__section">
        <h3>Journal de Cody</h3>
        <ActivityJournal entries={mission.activities} />
      </section>

      {mission.planningRequired && (
        <MissionPlanningPanel
          key={mission.currentPlan?.id ?? mission.id}
          mission={mission}
          busy={planningBusy}
          onRegenerate={onRegeneratePlan}
          onSave={onSavePlan}
          onValidate={onValidatePlan}
          onDraft={onDraftPlan}
        />
      )}

      {!planningOnly && (
        <>
      <section className="forge-detail__section">
        <h3>Checklist de vérification</h3>
        <ValidationChecklist
          items={mission.checklist}
          lastVerifiedAt={mission.lastVerifiedAt}
          onChange={onChecklistChange}
        />
      </section>

      <MissionReportPanel
        mission={mission}
        report={mission.report}
        generating={reportGenerating}
        onGenerate={onGenerateReport}
      />

      <section className="forge-detail__section">
        <h3>Notes et corrections</h3>
        {mission.corrections.length > 0 ? (
          <ul className="forge-corrections">
            {mission.corrections.map((correction) => (
              <li key={correction.id}>
                <p>{correction.content}</p>
                <time dateTime={correction.createdAt}>
                  {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(correction.createdAt))}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="forge-muted">Aucune correction demandée pour le moment.</p>
        )}
        <CorrectionComposer onAdd={onAddCorrection} />
      </section>

      <footer className="forge-detail__actions">
        <p><ShieldCheck size={18} /> Cette action reste locale et ne déclenche aucun déploiement.</p>
        <button
          className="forge-button forge-button--primary"
          type="button"
          onClick={onValidate}
          disabled={mission.status === "validated"}
        >
          {mission.status === "validated" ? "Mission validée" : "Valider la mission"}
        </button>
      </footer>
        </>
      )}
    </article>
  );
}
