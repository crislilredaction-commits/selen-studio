"use client";

import { ArchiveRestore, ArrowLeft, ExternalLink, FileText, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listArchivedMissions, setMissionArchived } from "@/lib/forge/data-access";
import { missionStatusLabels } from "@/lib/forge/labels";
import type { Mission } from "@/lib/forge/types";
import { MissionStatusBadge } from "./Badges";

function formatDate(value?: string) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ForgeMissionArchives() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [companion, setCompanion] = useState("all");
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      setMissions(await listArchivedMissions());
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Les archives sont indisponibles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companions = useMemo(
    () => [...new Set(missions.map((mission) => mission.agentKey))].sort(),
    [missions],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("fr");
    return missions.filter((mission) => (
      (!term || `${mission.title} ${mission.project} ${mission.branch ?? ""}`.toLocaleLowerCase("fr").includes(term))
      && (status === "all" || mission.status === status)
      && (companion === "all" || mission.agentKey === companion)
      && (!month || mission.archivedAt?.startsWith(month))
    ));
  }, [companion, missions, month, search, status]);

  async function restore(mission: Mission) {
    if (!window.confirm(
      `Restaurer « ${mission.title} » dans la liste visible ? Son statut ${missionStatusLabels[mission.status]} sera conservé et aucune exécution ne sera relancée.`,
    )) return;
    const reason = window.prompt("Indiquez le motif de la restauration.");
    if (!reason || reason.trim().length < 3) return;

    setBusyId(mission.id);
    setFeedback(null);
    try {
      await setMissionArchived(mission.id, false, reason.trim());
      setMissions((current) => current.filter((item) => item.id !== mission.id));
      setFeedback("Mission restaurée dans la liste visible, sans reprise automatique.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "La restauration a échoué.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="forge-page forge-archive-page">
      <Link className="forge-back-link" href="/agent/forge/cody">
        <ArrowLeft size={16} /> Retour aux missions actives
      </Link>
      <header className="forge-archive-hero">
        <div>
          <p className="forge-eyebrow">La Forge · Cody</p>
          <h1>Archives des missions</h1>
          <p>Les rapports, plans, checkpoints, incidents, alertes et journaux restent conservés.</p>
        </div>
        <strong>{missions.length}</strong>
      </header>

      <section className="forge-archive-toolbar" aria-label="Rechercher et filtrer les archives">
        <label className="forge-archive-search">
          <Search size={16} />
          <span className="sr-only">Rechercher</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Titre, projet ou branche"
          />
        </label>
        <label>
          <span>Statut final</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Tous</option>
            {[...new Set(missions.map((mission) => mission.status))].sort().map((value) => (
              <option key={value} value={value}>{missionStatusLabels[value]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Compagnon</span>
          <select value={companion} onChange={(event) => setCompanion(event.target.value)}>
            <option value="all">Tous</option>
            {companions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>Date d’archivage</span>
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      </section>

      {feedback ? <p className="forge-save-status" role="status">{feedback}</p> : null}
      {loading ? (
        <div className="forge-state"><RefreshCw className="forge-spin" /> Chargement des archives…</div>
      ) : visible.length === 0 ? (
        <div className="forge-state">Aucune mission archivée ne correspond à ces critères.</div>
      ) : (
        <div className="forge-archive-list">
          {visible.map((mission) => (
            <article key={mission.id} className="forge-archive-card">
              <header>
                <div>
                  <p className="forge-eyebrow">{mission.agentKey} · {mission.project}</p>
                  <h2>{mission.title}</h2>
                </div>
                <MissionStatusBadge status={mission.status} />
              </header>
              <dl>
                <div><dt>Archivée le</dt><dd>{formatDate(mission.archivedAt)}</dd></div>
                <div><dt>Créée le</dt><dd>{formatDate(mission.createdAt)}</dd></div>
                <div><dt>Priorité</dt><dd>{mission.priority}</dd></div>
                <div><dt>Branche</dt><dd>{mission.branch ?? "Non renseignée"}</dd></div>
                <div><dt>Checkpoints</dt><dd>{mission.checkpoints.length}</dd></div>
                <div><dt>Incidents</dt><dd>{mission.incidents.length}</dd></div>
              </dl>
              <div className="forge-archive-actions">
                {mission.report ? (
                  <details>
                    <summary><FileText size={15} /> Ouvrir le rapport</summary>
                    <pre>{mission.report.markdownContent || mission.report.summary}</pre>
                  </details>
                ) : <span className="forge-muted">Aucun rapport enregistré.</span>}
                {mission.previewUrl ? (
                  <a className="forge-button forge-button--secondary" href={mission.previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} /> Preview
                  </a>
                ) : null}
                <button
                  className="forge-button forge-button--secondary"
                  type="button"
                  disabled={busyId === mission.id}
                  onClick={() => void restore(mission)}
                >
                  <ArchiveRestore size={15} /> Restaurer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
