"use client";

import Link from "next/link";
import { AlertCircle, Archive, Bell, CheckCheck, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveForgeAlert,
  getForgeAccessLevel,
  listForgeAlerts,
  markForgeAlertsRead,
  recordForgeAlertContextOpen,
} from "@/lib/forge/data-access";
import type { ForgeAccessLevel, ForgeAlert, ForgeAlertLevel } from "@/lib/forge/types";

type Filter = "all" | "action" | "unread" | "critical" | "resolved";
const levelLabels: Record<ForgeAlertLevel, string> = {
  information: "Information",
  attention: "À surveiller",
  important: "Important",
  critical: "Critique",
};
const rank = { critical: 0, important: 1, attention: 2, information: 3 };

export default function ForgeAlertCenter() {
  const [alerts, setAlerts] = useState<ForgeAlert[]>([]);
  const [access, setAccess] = useState<ForgeAccessLevel>("none");
  const [filter, setFilter] = useState<Filter>("all");
  const [companion, setCompanion] = useState("all");
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextAlerts, nextAccess] = await Promise.all([listForgeAlerts(), getForgeAccessLevel()]);
      setAlerts(nextAlerts);
      setAccess(nextAccess);
    } catch {
      setError("Lil, je n’arrive pas à charger les alertes pour le moment. Vérifie ta connexion, puis réessaie.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => alerts
    .filter((alert) => showResolved || !["resolved", "archived"].includes(alert.status))
    .filter((alert) => companion === "all" || alert.companionKey === companion)
    .filter((alert) => {
      if (filter === "action") return alert.status === "action_required";
      if (filter === "unread") return !alert.readAt;
      if (filter === "critical") return alert.level === "critical";
      if (filter === "resolved") return alert.status === "resolved";
      return true;
    })
    .toSorted((left, right) =>
      Number(right.status === "action_required") - Number(left.status === "action_required")
      || rank[left.level] - rank[right.level]
      || right.createdAt.localeCompare(left.createdAt)
    ), [alerts, companion, filter, showResolved]);

  const attentionCount = alerts.filter((alert) =>
    alert.status === "action_required" || (!alert.readAt && !["resolved", "archived"].includes(alert.status))
  ).length;
  const companions = [...new Set(alerts.map((alert) => alert.companionKey))];

  async function markRead(ids: string[]) {
    setBusy(true);
    setError(null);
    try {
      await markForgeAlertsRead(ids);
      await load();
    } catch {
      setError("Lil, je n’ai pas pu enregistrer la lecture. Rien d’autre n’a été modifié.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setBusy(true);
    setError(null);
    try {
      await archiveForgeAlert(id);
      await load();
    } catch {
      setError("Lil, cette alerte ne peut pas encore être archivée. Termine d’abord l’action liée.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="forge-page forge-alert-page">
      <header className="forge-hero forge-alert-hero">
        <div className="forge-hero__mark"><Bell aria-hidden /></div>
        <div>
          <p className="forge-eyebrow">La Forge · Alertes internes</p>
          <h1>Ce qui demande ton attention</h1>
          <p>Lil, retrouve ici les décisions, blocages et résultats importants signalés par Cody et les autres Compagnons.</p>
        </div>
        <strong className="forge-alert-count" aria-label={`${attentionCount} alertes à lire ou traiter`}>
          {attentionCount}<span>à voir</span>
        </strong>
      </header>

      <section className="forge-alert-toolbar" aria-label="Filtres des alertes">
        <div className="forge-alert-filters">
          {([
            ["all", "Toutes"], ["action", "Action requise"], ["unread", "Non lues"],
            ["critical", "Critiques"], ["resolved", "Résolues"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value}
              className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <label>Compagnon
          <select value={companion} onChange={(event) => setCompanion(event.target.value)}>
            <option value="all">Tous</option>
            {companions.map((key) => <option key={key} value={key}>{key === "cody" ? "Cody" : key}</option>)}
          </select>
        </label>
        <label className="forge-alert-toggle">
          <input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} />
          Afficher l’historique résolu
        </label>
        {access === "admin" ? (
          <button className="forge-button" type="button" disabled={busy}
            onClick={() => void markRead(visible.filter((alert) => !alert.readAt).map((alert) => alert.id))}>
            <CheckCheck size={16} /> Tout marquer comme lu
          </button>
        ) : null}
      </section>

      {error ? <p className="forge-state forge-state--error" role="alert"><AlertCircle />{error}</p> : null}
      {loading ? <p className="forge-state"><RefreshCw className="forge-spin" />Je rassemble les alertes utiles…</p> : null}
      {!loading && visible.length === 0 ? (
        <p className="forge-state">Tout est calme pour le moment. Aucune alerte ne correspond à ces filtres.</p>
      ) : null}

      <section className="forge-alert-list" aria-live="polite">
        {visible.map((alert) => (
          <article key={alert.id} className={`forge-alert-card forge-alert-card--${alert.level} ${alert.readAt ? "" : "is-unread"}`}>
            <div className="forge-alert-card__top">
              <div>
                <span className="forge-alert-companion">{alert.companionKey === "cody" ? "Cody" : alert.companionKey}</span>
                <span className="forge-alert-level">{levelLabels[alert.level]}</span>
                {alert.status === "action_required" ? <span className="forge-alert-action">Action attendue</span> : null}
                {!alert.readAt ? <span className="forge-alert-unread">Non lue</span> : null}
              </div>
              <time dateTime={alert.createdAt}>{new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "medium", timeStyle: "short",
              }).format(new Date(alert.createdAt))}</time>
            </div>
            <h2>{alert.title}</h2>
            <p>{alert.message}</p>
            {Object.keys(alert.technicalDetails).length > 0 ? (
              <details><summary>Détails techniques</summary><pre>{JSON.stringify(alert.technicalDetails, null, 2)}</pre></details>
            ) : null}
            <div className="forge-alert-card__actions">
              <Link className="forge-button forge-button--primary" href={alert.actionTarget}
                onClick={() => {
                  if (access === "admin") {
                    void recordForgeAlertContextOpen(alert.id);
                    if (!alert.readAt) void markRead([alert.id]);
                  }
                }}>
                {alert.actionLabel}<ExternalLink size={15} />
              </Link>
              {!alert.readAt && access === "admin" ? (
                <button className="forge-button" type="button" disabled={busy} onClick={() => void markRead([alert.id])}>
                  Marquer comme lue
                </button>
              ) : null}
              {alert.status === "resolved" && access === "admin" ? (
                <button className="forge-button" type="button" disabled={busy} onClick={() => void archive(alert.id)}>
                  <Archive size={15} /> Archiver
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
