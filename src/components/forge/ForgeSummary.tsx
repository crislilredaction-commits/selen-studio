"use client";

import { AlertTriangle, Clock3, Hammer, RefreshCw, ScrollText } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { activityTypeLabels } from "@/lib/forge/labels";
import { listMissions } from "@/lib/forge/data-access";
import type { Mission } from "@/lib/forge/types";

export default function ForgeSummary() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMissions(await listMissions());
    } catch {
      setError("La synthèse de La Forge ne peut pas être chargée pour le moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recentActivities = useMemo(
    () =>
      missions
        .flatMap((mission) =>
          mission.activities.map((activity) => ({ ...activity, mission: mission.title })),
        )
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, 4),
    [missions],
  );

  if (loading) {
    return <div className="forge-state" role="status"><RefreshCw className="forge-spin" /> Chargement de l’atelier…</div>;
  }

  if (error) {
    return (
      <div className="forge-state forge-state--error" role="alert">
        <AlertTriangle /> <span>{error}</span>
        <button className="forge-button forge-button--secondary" onClick={() => void load()}>Réessayer</button>
      </div>
    );
  }

  const active = missions.filter((mission) => mission.status === "in_progress").length;
  const toReview = missions.filter((mission) => mission.status === "to_review").length;
  const blocked = missions.filter((mission) => mission.status === "blocked").length;

  return (
    <>
      <div className="forge-stat-grid">
        <article><Hammer /><div><strong>{active}</strong><span>Missions en cours</span></div></article>
        <article><Clock3 /><div><strong>{toReview}</strong><span>À vérifier</span></div></article>
        <article><AlertTriangle /><div><strong>{blocked}</strong><span>Éléments bloqués</span></div></article>
      </div>
      <article className="forge-activity-card">
        <div className="forge-activity-card__title"><ScrollText /><h3>Dernières activités</h3></div>
        {recentActivities.length ? (
          <ol>
            {recentActivities.map((activity) => (
              <li key={activity.id}>
                <span />
                <div><strong>{activity.message}</strong><p>{activity.mission} · {activityTypeLabels[activity.type]}</p></div>
                <time dateTime={activity.occurredAt}>
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.occurredAt))}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="forge-muted">Aucune activité enregistrée dans La Forge.</p>
        )}
      </article>
    </>
  );
}
