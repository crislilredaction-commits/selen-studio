"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./session-workspace.module.css";

type StageId = "overview" | "before" | "during" | "after";
const stages: Array<{ id: StageId; fragment: string; label: string; description: string }> = [
  { id: "overview", fragment: "vue-ensemble", label: "Vue d’ensemble", description: "Priorité, progression et repères" },
  { id: "before", fragment: "documents-avant-formation", label: "Avant", description: "Inscriptions, positionnements et pièces" },
  { id: "during", fragment: "pendant-formation", label: "Pendant", description: "Présences, incidents et régularisations" },
  { id: "after", fragment: "apres-formation", label: "Après", description: "Évaluations, satisfaction et clôture" },
];
const toolStages: Record<string, StageId> = { evaluation: "after", satisfaction: "after", closure: "after", followup: "during", timeline: "overview" };

function stageFromHash(): StageId {
  if (typeof window === "undefined") return "overview";
  const fragment = decodeURIComponent(window.location.hash.slice(1));
  const direct = stages.find((stage) => stage.fragment === fragment);
  if (direct) return direct.id;
  const target = fragment ? document.getElementById(fragment) : null;
  const stage = target?.closest<HTMLElement>("[data-session-stage]")?.dataset.sessionStage;
  return stages.some((item) => item.id === stage) ? stage as StageId : "overview";
}

function stageFromPath(pathname: string): StageId {
  const segment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return segment === "full" ? "overview" : toolStages[segment] ?? "before";
}

export default function SessionWorkspaceNavigation({ sessionId }: { sessionId: string }) {
  const pathname = usePathname();
  const isWorkspace = pathname.endsWith("/full");
  const [workspaceStage, setWorkspaceStage] = useState<StageId>("overview");
  const activeStage = isWorkspace ? workspaceStage : stageFromPath(pathname);

  useEffect(() => {
    if (!isWorkspace) return;
    const activateLocation = () => setWorkspaceStage(stageFromHash());
    activateLocation();
    window.addEventListener("hashchange", activateLocation);
    return () => window.removeEventListener("hashchange", activateLocation);
  }, [isWorkspace, pathname]);

  useEffect(() => {
    if (!isWorkspace) return;
    document.querySelectorAll<HTMLElement>("[data-session-stage]").forEach((panel) => {
      panel.hidden = panel.dataset.sessionStage !== activeStage;
    });
    const fragment = decodeURIComponent(window.location.hash.slice(1));
    if (!fragment) return;
    const target = document.getElementById(fragment);
    if (target instanceof HTMLDetailsElement) target.open = true;
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
  }, [activeStage, isWorkspace]);

  return <>
    <nav aria-label="Étapes de la session" className={styles.stageTabs}>
      {stages.map((stage) => {
        const selected = stage.id === activeStage;
        return <Link key={stage.id} id={`session-tab-${stage.id}`} href={`/agent/daily/session-dossiers/${encodeURIComponent(sessionId)}/full#${stage.fragment}`} aria-current={selected ? "page" : undefined} onClick={() => { if (isWorkspace) setWorkspaceStage(stage.id); }} className={`${styles.stageTab} ${selected ? styles.activeStageTab : ""}`}>
          <strong>{stage.label}</strong><span>{stage.description}</span>
        </Link>;
      })}
    </nav>
    <nav aria-label="Outils de cette session" className={styles.toolNav}>
      <span className={styles.toolLabel}>Outils de cette session</span>
      <Link href={`/agent/daily/session-dossiers/${sessionId}`}>Programme & inscriptions</Link>
      <Link href={`/agent/daily/session-dossiers/${sessionId}/timeline`}>Chronologie</Link>
      <Link href={`/agent/daily/session-dossiers/${sessionId}/followup`}>Suivi pendant</Link>
      <Link href={`/agent/daily/session-dossiers/${sessionId}/evaluation`}>Évaluation</Link>
      <Link href={`/agent/daily/session-dossiers/${sessionId}/satisfaction`}>Satisfaction</Link>
      <Link href={`/agent/daily/session-dossiers/${sessionId}/closure`}>Clôture</Link>
    </nav>
  </>;
}
