"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Hammer, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addCorrection,
  generateDemoMissionReport,
  getMissionDetails,
  listMissions,
  updateValidationItem,
  validateMission,
} from "@/lib/forge/data-access";
import { missionFilters } from "@/lib/forge/labels";
import type { Mission, ValidationItem } from "@/lib/forge/types";
import { AgentStatusBadge } from "./Badges";
import MissionCard from "./MissionCard";
import MissionDetail from "./MissionDetail";

type Filter = (typeof missionFilters)[number]["value"];

export default function CodyWorkspace() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
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

  const visibleMissions = useMemo(
    () => missions.filter((mission) => filter === "all" || mission.status === filter),
    [filter, missions],
  );
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

      <nav className="forge-filters" aria-label="Filtrer les missions">
        {missionFilters.map((item) => (
          <button key={item.value} className={filter === item.value ? "is-active" : ""} onClick={() => selectFilter(item.value)}>
            {item.label}
            <span>{missions.filter((mission) => item.value === "all" || mission.status === item.value).length}</span>
          </button>
        ))}
      </nav>

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
        />
      </div>
      )}
    </main>
  );
}
