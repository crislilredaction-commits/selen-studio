import type { Metadata } from "next";
import { AlertTriangle, Clock3, Hammer, ScrollText } from "lucide-react";
import AgentCard from "@/components/forge/AgentCard";
import { forgeAgents, forgeRecentActivities, initialMissions } from "@/lib/forge/demo-data";
import { activityTypeLabels } from "@/lib/forge/labels";
export const metadata: Metadata = {
  title: "La Forge · Selen Studio",
  description: "Centre de pilotage des agents IA de Selen.",
};

export default function ForgePage() {
  const active = initialMissions.filter((mission) => mission.status === "in_progress").length;
  const toReview = initialMissions.filter((mission) => mission.status === "to_review").length;
  const blocked = initialMissions.filter((mission) => mission.status === "blocked").length;

  return (
    <main className="forge-page">
      <header className="forge-hero">
        <div className="forge-hero__mark"><Hammer aria-hidden /></div>
        <div>
          <p className="forge-eyebrow">Atelier des intelligences de Selen</p>
          <h1>La Forge</h1>
          <p>Le centre de pilotage des agents IA de Selen, pour suivre leurs missions, leurs avancées et les vérifications à mener.</p>
        </div>
      </header>

      <section className="forge-section" aria-labelledby="forge-artisans">
        <div className="forge-section__heading">
          <div><p className="forge-eyebrow">Les artisans</p><h2 id="forge-artisans">Agents de La Forge</h2></div>
          <span>1 agent actif</span>
        </div>
        <div className="forge-agent-grid">
          {forgeAgents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      </section>

      <section className="forge-section" aria-labelledby="forge-synthesis">
        <div className="forge-section__heading">
          <div><p className="forge-eyebrow">Vue d’ensemble</p><h2 id="forge-synthesis">Synthèse de l’atelier</h2></div>
        </div>
        <div className="forge-stat-grid">
          <article><Hammer /><div><strong>{active}</strong><span>Missions en cours</span></div></article>
          <article><Clock3 /><div><strong>{toReview}</strong><span>À vérifier</span></div></article>
          <article><AlertTriangle /><div><strong>{blocked}</strong><span>Éléments bloqués</span></div></article>
        </div>
        <article className="forge-activity-card">
          <div className="forge-activity-card__title"><ScrollText /><h3>Dernières activités</h3></div>
          <ol>
            {forgeRecentActivities.map((activity) => (
              <li key={activity.id}>
                <span />
                <div><strong>{activity.message}</strong><p>{activity.mission} · {activityTypeLabels[activity.type]}</p></div>
                <time dateTime={activity.occurredAt}>
                  {new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(activity.occurredAt))}
                </time>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
