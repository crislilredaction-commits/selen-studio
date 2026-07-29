"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Hammer, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { initialMissions } from "@/lib/forge/demo-data";
import { missionFilters } from "@/lib/forge/labels";
import type { Mission, MissionStatus, ValidationItem } from "@/lib/forge/types";
import { AgentStatusBadge } from "./Badges";
import MissionCard from "./MissionCard";
import MissionDetail from "./MissionDetail";

const storageKey = "selen-forge-cody-v1";
type Filter = (typeof missionFilters)[number]["value"];

export default function CodyWorkspace() {
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [selectedId, setSelectedId] = useState(initialMissions[0].id);
  const [filter, setFilter] = useState<Filter>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setMissions(JSON.parse(stored) as Mission[]);
    } catch {
      // Une donnée locale invalide ne doit jamais empêcher l'ouverture de La Forge.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify(missions));
  }, [hydrated, missions]);

  const visibleMissions = useMemo(
    () => missions.filter((mission) => filter === "all" || mission.status === filter),
    [filter, missions],
  );
  const selectedMission = missions.find((mission) => mission.id === selectedId) ?? visibleMissions[0] ?? missions[0];

  function updateMission(id: string, updater: (mission: Mission) => Mission) {
    setMissions((current) => current.map((mission) => (mission.id === id ? updater(mission) : mission)));
  }

  function selectFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    const first = missions.find((mission) => nextFilter === "all" || mission.status === nextFilter);
    if (first) setSelectedId(first.id);
  }

  function changeChecklist(id: string, patch: Partial<ValidationItem>) {
    updateMission(selectedMission.id, (mission) => ({
      ...mission,
      lastVerifiedAt: new Date().toISOString(),
      checklist: mission.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function addCorrection(content: string) {
    updateMission(selectedMission.id, (mission) => ({
      ...mission,
      status: "changes_requested",
      corrections: [
        ...mission.corrections,
        { id: crypto.randomUUID(), content, createdAt: new Date().toISOString() },
      ],
      activities: [
        ...mission.activities,
        {
          id: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          type: "correction",
          message: `Correction demandée : ${content}`,
          status: "changes_requested",
        },
      ],
    }));
    setFilter("all");
  }

  function validateMission() {
    if (!window.confirm(`Confirmer la validation de la mission « ${selectedMission.title} » ?`)) return;
    updateMission(selectedMission.id, (mission) => ({
      ...mission,
      status: "validated" as MissionStatus,
      progress: 100,
      activities: [
        ...mission.activities,
        {
          id: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
          type: "completed",
          message: "Mission validée par Lil",
          status: "validated",
        },
      ],
    }));
    setFilter("all");
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
          onAddCorrection={addCorrection}
          onValidate={validateMission}
        />
      </div>
    </main>
  );
}
