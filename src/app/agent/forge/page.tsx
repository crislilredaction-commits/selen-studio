import type { Metadata } from "next";
import { Hammer } from "lucide-react";
import AgentCard from "@/components/forge/AgentCard";
import ForgeSummary from "@/components/forge/ForgeSummary";
import { forgeAgents } from "@/lib/forge/demo-data";
export const metadata: Metadata = {
  title: "La Forge · Selen Studio",
  description: "Centre de pilotage des agents IA de Selen.",
};

export default function ForgePage() {
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
        <ForgeSummary />
      </section>
    </main>
  );
}
