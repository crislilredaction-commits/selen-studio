"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Hammer, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addCorrection,
  createPlanningMission,
  generateDemoMissionReport,
  getMissionDetails,
  listMissions,
  pauseMission,
  requestMissionPlan,
  resolveMissionIncident,
  resumeBlockedMission,
  resumeMission,
  setPlanningAnalysisState,
  storeMissionPlan,
  updateMissionPriority,
  updateMissionCheckpoint,
  updateValidationItem,
  validateMission,
  validateMissionPlan,
  type NewPlanningMissionInput,
} from "@/lib/forge/data-access";
import { missionFilters } from "@/lib/forge/labels";
import type { Mission, MissionCheckpoint, MissionCheckpointStatus, MissionIncident, MissionPlanDraft, MissionPriority, ValidationItem } from "@/lib/forge/types";
import { AgentStatusBadge } from "./Badges";
import MissionCard from "./MissionCard";
import MissionDetail from "./MissionDetail";
import NewMissionForm from "./NewMissionForm";

type Filter = (typeof missionFilters)[number]["value"];
type SortOrder = "priority" | "newest";

const priorityRank: Record<MissionPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export default function CodyWorkspace() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("priority");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [planningBusy, setPlanningBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadMissions = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextMissions = await listMissions();
      setMissions(nextMissions);
      setSelectedId((current) => {
        const candidate = preferredId ?? current;
        return nextMissions.some((mission) => mission.id === candidate)
          ? candidate
          : nextMissions[0]?.id ?? null;
      });
    } catch {
      setError("Les missions de Cody ne peuvent pas être chargées. Vérifiez que la migration Forge est appliquée.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  const visibleMissions = useMemo(() => (
    missions
      .filter((mission) => filter === "all" || mission.status === filter)
      .toSorted((left, right) => {
        if (sortOrder === "newest") return right.createdAt.localeCompare(left.createdAt);
        return priorityRank[left.priority] - priorityRank[right.priority]
          || left.createdAt.localeCompare(right.createdAt)
          || left.id.localeCompare(right.id);
      })
  ), [filter, missions, sortOrder]);
  const selectedMission = missions.find((mission) => mission.id === selectedId)
    ?? visibleMissions[0]
    ?? missions[0];

  function updateMission(id: string, updater: (mission: Mission) => Mission) {
    setMissions((current) => current.map((mission) => (mission.id === id ? updater(mission) : mission)));
  }

  function selectFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    const first = missions.find((mission) => nextFilter === "all" || mission.status === nextFilter);
    if (first) setSelectedId(first.id);
  }

  async function changeChecklist(id: string, patch: Partial<ValidationItem>) {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setFeedback(null);
    updateMission(missionId, (mission) => ({
      ...mission,
      lastVerifiedAt: new Date().toISOString(),
      checklist: mission.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    setSaving(true);
    try {
      await updateValidationItem(id, patch);
      const refreshed = await getMissionDetails(missionId);
      updateMission(missionId, () => refreshed);
      setFeedback("Vérification enregistrée.");
    } catch {
      setFeedback("L’enregistrement a échoué. Les données ont été rechargées.");
      await loadMissions(missionId);
    } finally {
      setSaving(false);
    }
  }

  async function submitCorrection(content: string) {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await addCorrection(missionId, content);
      await loadMissions(missionId);
      setFilter("all");
      setFeedback("Correction ajoutée et journal mis à jour.");
    } catch {
      setFeedback("La correction n’a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  }

  async function submitValidation() {
    if (!selectedMission) return;
    if (!window.confirm(`Confirmer la validation de la mission « ${selectedMission.title} » ?`)) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await validateMission(missionId);
      await loadMissions(missionId);
      setFilter("all");
      setFeedback("Mission validée et journal mis à jour.");
    } catch {
      setFeedback("La mission n’a pas pu être validée.");
    } finally {
      setSaving(false);
    }
  }

  async function generateReport() {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setReportGenerating(true);
    setFeedback(null);
    try {
      await generateDemoMissionReport(selectedMission);
      await loadMissions(missionId);
      setFeedback(selectedMission.report ? "Rapport régénéré et journal mis à jour." : "Rapport généré et journal mis à jour.");
    } catch {
      await loadMissions(missionId);
      setFeedback("La génération du rapport a échoué.");
    } finally {
      setReportGenerating(false);
    }
  }

  async function changePriority(priority: MissionPriority) {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await updateMissionPriority(missionId, priority);
      await loadMissions(missionId);
      setFeedback("Priorité mise à jour.");
    } catch (priorityError) {
      setFeedback(priorityError instanceof Error ? priorityError.message : "La priorité n’a pas pu être mise à jour.");
    } finally {
      setSaving(false);
    }
  }

  async function pauseSelectedMission() {
    if (!selectedMission) return;
    if (!window.confirm(`Mettre en pause « ${selectedMission.title} » ? Le traitement en cours sera interrompu.`)) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await pauseMission(missionId);
      await loadMissions(missionId);
      setFilter("all");
      setFeedback("Mission mise en pause. Son cadrage et sa progression sont conservés.");
    } catch (pauseError) {
      setFeedback(pauseError instanceof Error ? pauseError.message : "La mission n’a pas pu être mise en pause.");
    } finally {
      setSaving(false);
    }
  }

  async function resumeSelectedMission() {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await resumeMission(missionId);
      await loadMissions(missionId);
      setFilter("all");
      setFeedback("Mission reprise avec sa progression existante.");
    } catch (resumeError) {
      setFeedback(resumeError instanceof Error ? resumeError.message : "La mission n’a pas pu être reprise.");
    } finally {
      setSaving(false);
    }
  }

  async function changeCheckpoint(
    checkpoint: MissionCheckpoint,
    status: MissionCheckpointStatus,
    message?: string,
  ) {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await updateMissionCheckpoint(
        missionId,
        checkpoint.key,
        status,
        message,
        checkpoint.key === "plan_validated" && status === "completed"
          ? selectedMission.currentPlan?.id
          : undefined,
      );
      await loadMissions(missionId);
      setFeedback(status === "failed" ? "Échec enregistré dans les checkpoints et le journal." : "Checkpoint enregistré.");
    } catch (checkpointError) {
      setFeedback(checkpointError instanceof Error ? checkpointError.message : "Le checkpoint n’a pas pu être mis à jour.");
    } finally {
      setSaving(false);
    }
  }

  async function resolveIncident(
    incident: MissionIncident,
    status: "resolved" | "ignored_with_justification",
    message: string,
  ) {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await resolveMissionIncident(
        incident.id,
        status,
        message,
        status === "ignored_with_justification" ? message : undefined,
      );
      await loadMissions(missionId);
      setFeedback(status === "resolved"
        ? "Incident résolu et historique conservé."
        : "Incident ignoré avec justification enregistrée.");
    } catch (incidentError) {
      setFeedback(incidentError instanceof Error
        ? incidentError.message
        : "L’incident n’a pas pu être mis à jour.");
    } finally {
      setSaving(false);
    }
  }

  async function resumeBlockedSelectedMission() {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setSaving(true);
    setFeedback(null);
    try {
      await resumeBlockedMission(missionId);
      await loadMissions(missionId);
      setFeedback("Mission reprise au checkpoint concerné.");
    } catch (resumeError) {
      setFeedback(resumeError instanceof Error
        ? resumeError.message
        : "La mission bloquée n’a pas pu être reprise.");
    } finally {
      setSaving(false);
    }
  }

  async function createAndAnalyzeMission(input: NewPlanningMissionInput) {
    setPlanningBusy(true);
    setFeedback(null);
    let missionId: string | null = null;
    try {
      missionId = await createPlanningMission(input);
      await setPlanningAnalysisState(missionId, "analyzing", "Cody analyse la demande et prépare le cadrage");
      await loadMissions(missionId);
      const plan = await requestMissionPlan(input);
      await storeMissionPlan(missionId, plan, "generate");
      await loadMissions(missionId);
      setFilter("all");
      setFeedback(plan.blockingQuestions.length
        ? "Cadrage généré. Une ou plusieurs précisions bloquantes sont requises."
        : "Cadrage généré et prêt à être relu.");
    } catch (planningError) {
      if (missionId) {
        await setPlanningAnalysisState(
          missionId,
          "draft",
          "La génération du cadrage a échoué ; la demande source est conservée",
        ).catch(() => undefined);
        await loadMissions(missionId);
      }
      setFeedback(planningError instanceof Error
        ? planningError.message
        : "La création du cadrage a échoué.");
    } finally {
      setPlanningBusy(false);
    }
  }

  async function regeneratePlan() {
    if (!selectedMission?.brief) return;
    const missionId = selectedMission.id;
    const input: NewPlanningMissionInput = {
      title: selectedMission.title,
      sourceRequest: selectedMission.brief.sourceRequest,
      sourceContext: selectedMission.brief.sourceContext,
      sourceConstraints: selectedMission.brief.sourceConstraints,
      priority: selectedMission.priority,
    };
    setPlanningBusy(true);
    setFeedback(null);
    try {
      await setPlanningAnalysisState(missionId, "analyzing", "Cody régénère le cadrage sans écraser les versions précédentes");
      const plan = await requestMissionPlan(input);
      await storeMissionPlan(missionId, plan, "regenerate");
      await loadMissions(missionId);
      setFeedback("Nouvelle version du cadrage enregistrée.");
    } catch (planningError) {
      await loadMissions(missionId);
      setFeedback(planningError instanceof Error ? planningError.message : "La régénération a échoué.");
    } finally {
      setPlanningBusy(false);
    }
  }

  async function savePlan(plan: MissionPlanDraft, action: "edit" | "draft" = "edit") {
    if (!selectedMission) return;
    const missionId = selectedMission.id;
    setPlanningBusy(true);
    setFeedback(null);
    try {
      await storeMissionPlan(missionId, plan, action);
      await loadMissions(missionId);
      setFeedback(action === "draft" ? "Nouvelle version enregistrée en brouillon." : "Modifications enregistrées dans une nouvelle version.");
    } catch (planningError) {
      setFeedback(planningError instanceof Error ? planningError.message : "L’enregistrement du cadrage a échoué.");
    } finally {
      setPlanningBusy(false);
    }
  }

  async function submitPlanValidation() {
    if (!selectedMission) return;
    if (!window.confirm(`Valider explicitement le cadrage de « ${selectedMission.title} » ?`)) return;
    const missionId = selectedMission.id;
    setPlanningBusy(true);
    setFeedback(null);
    try {
      await validateMissionPlan(missionId);
      await loadMissions(missionId);
      setFeedback("Cadrage validé. La mission peut désormais entrer en exécution.");
    } catch (planningError) {
      setFeedback(planningError instanceof Error ? planningError.message : "La validation du cadrage a échoué.");
    } finally {
      setPlanningBusy(false);
    }
  }

  return (
    <main className="forge-page forge-cody-page">
      <Link className="forge-back-link" href="/agent/forge"><ArrowLeft size={16} /> Retour à La Forge</Link>
      <header className="forge-cody-hero">
        <div className="forge-cody-hero__portrait">
          <Image src="/agents/cody.png" alt="Portrait de Cody" fill priority sizes="(max-width: 700px) 96px, 142px" />
        </div>
        <div>
          <p className="forge-eyebrow"><Hammer size={14} /> Premier artisan de La Forge</p>
          <div className="forge-cody-hero__title"><h1>Cody</h1><AgentStatusBadge status="in_progress" /></div>
          <p className="forge-cody-role">Agent développeur</p>
          <p>Cody transforme les cahiers des charges de Selen en fonctionnalités testables.</p>
        </div>
        <Sparkles className="forge-cody-hero__sparkle" aria-hidden />
      </header>

      <NewMissionForm busy={planningBusy} onSubmit={createAndAnalyzeMission} />

      <div className="forge-queue-toolbar">
        <nav className="forge-filters" aria-label="Filtrer les missions">
          {missionFilters.map((item) => (
            <button key={item.value} className={filter === item.value ? "is-active" : ""} onClick={() => selectFilter(item.value)}>
              {item.label}
              <span>{missions.filter((mission) => item.value === "all" || mission.status === item.value).length}</span>
            </button>
          ))}
        </nav>
        <label className="forge-sort">
          <span>Trier</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
            <option value="priority">Priorité, puis ancienneté</option>
            <option value="newest">Plus récentes</option>
          </select>
        </label>
      </div>

      {saving && <p className="forge-save-status" role="status"><RefreshCw className="forge-spin" /> Enregistrement…</p>}
      {feedback && <p className="forge-save-status" role="status">{feedback}</p>}

      {loading && (
        <div className="forge-state" role="status"><RefreshCw className="forge-spin" /> Chargement des missions de Cody…</div>
      )}

      {!loading && error && (
        <div className="forge-state forge-state--error" role="alert">
          <AlertTriangle /> <span>{error}</span>
          <button className="forge-button forge-button--secondary" onClick={() => void loadMissions()}>Réessayer</button>
        </div>
      )}

      {!loading && !error && missions.length === 0 && (
        <div className="forge-state">Aucune mission n’est encore enregistrée pour Cody.</div>
      )}

      {!loading && !error && selectedMission && (
      <div className="forge-workspace">
        <aside className="forge-mission-list" aria-label="Missions de Cody">
          {visibleMissions.length ? visibleMissions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              selected={mission.id === selectedMission.id}
              onSelect={() => setSelectedId(mission.id)}
            />
          )) : <p className="forge-empty">Aucune mission dans cette catégorie.</p>}
        </aside>
        <MissionDetail
          mission={selectedMission}
          onChecklistChange={changeChecklist}
          onAddCorrection={submitCorrection}
          onValidate={submitValidation}
          onGenerateReport={generateReport}
          reportGenerating={reportGenerating}
          planningBusy={planningBusy}
          onRegeneratePlan={regeneratePlan}
          onSavePlan={(plan) => savePlan(plan)}
          onValidatePlan={submitPlanValidation}
          onDraftPlan={(plan) => savePlan(plan, "draft")}
          onPriorityChange={changePriority}
          onPause={pauseSelectedMission}
          onResume={resumeSelectedMission}
          missionActionBusy={saving}
          onCheckpointUpdate={changeCheckpoint}
          onIncidentResolve={resolveIncident}
          onBlockedResume={resumeBlockedSelectedMission}
        />
      </div>
      )}
    </main>
  );
}
