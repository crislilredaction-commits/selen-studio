"use client";

import { useEffect, useState } from "react";

type StageId = "overview" | "before" | "during" | "after";

const stages: Array<{ id: StageId; fragment: string; label: string; description: string }> = [
  { id: "overview", fragment: "vue-ensemble", label: "Vue d’ensemble", description: "Priorité, progression et repères" },
  { id: "before", fragment: "documents-avant-formation", label: "Avant", description: "Candidatures, documents et positionnements" },
  { id: "during", fragment: "pendant-formation", label: "Pendant", description: "Présences, régularisations et suivi" },
  { id: "after", fragment: "apres-formation", label: "Après", description: "Évaluations, satisfaction et clôture" },
];

function stageFromHash(): StageId {
  if (typeof window === "undefined") return "overview";
  const fragment = decodeURIComponent(window.location.hash.slice(1));
  const direct = stages.find((stage) => stage.fragment === fragment);
  if (direct) return direct.id;
  const target = fragment ? document.getElementById(fragment) : null;
  const panel = target?.closest<HTMLElement>("[data-session-stage]");
  const stage = panel?.dataset.sessionStage;
  return stages.some((item) => item.id === stage) ? stage as StageId : "overview";
}

export default function SessionStageNavigation() {
  const [activeStage, setActiveStage] = useState<StageId>("overview");

  useEffect(() => {
    const activateHash = () => setActiveStage(stageFromHash());
    activateHash();
    window.addEventListener("hashchange", activateHash);
    return () => window.removeEventListener("hashchange", activateHash);
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-session-stage]").forEach((panel) => {
      panel.hidden = panel.dataset.sessionStage !== activeStage;
    });
    const fragment = decodeURIComponent(window.location.hash.slice(1));
    if (!fragment) return;
    const target = document.getElementById(fragment);
    if (target instanceof HTMLDetailsElement) target.open = true;
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }, [activeStage]);

  return <section aria-label="Espace de travail de la session">
    <nav aria-label="Étapes de la session" style={styles.tabs}>
      {stages.map((stage) => {
        const selected = stage.id === activeStage;
        return <a
          key={stage.id}
          id={`session-tab-${stage.id}`}
          href={`#${stage.fragment}`}
          aria-current={selected ? "page" : undefined}
          onClick={() => setActiveStage(stage.id)}
          style={{ ...styles.tab, ...(selected ? styles.activeTab : null) }}
        >
          <strong>{stage.label}</strong>
          <span style={styles.description}>{stage.description}</span>
        </a>;
      })}
    </nav>
  </section>;
}

const styles: Record<string, React.CSSProperties> = {
  tabs: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(190px,100%),1fr))", gap: 10, marginBottom: 18 },
  tab: { display: "grid", gap: 4, minHeight: 68, padding: "11px 13px", borderRadius: 10, border: "1px solid var(--selen-border)", background: "var(--selen-bg3)", color: "var(--selen-text)", textDecoration: "none" },
  activeTab: { borderColor: "var(--selen-gold2)", background: "var(--selen-bg2)", boxShadow: "inset 0 -3px 0 var(--selen-gold2)" },
  description: { color: "var(--selen-text2)", fontSize: 11, lineHeight: 1.35 },
};
