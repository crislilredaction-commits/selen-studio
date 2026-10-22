"use client";

import type { MouseEvent } from "react";

const stages = [
  { id: "vue-ensemble", label: "Vue d'ensemble" },
  { id: "documents-avant-formation", label: "Avant" },
  { id: "pendant-formation", label: "Pendant" },
  { id: "apres-formation", label: "Après" },
] as const;

export default function SessionStageNavigation() {
  function navigate(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!(target instanceof HTMLElement)) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    // Preserve the native anchor behavior (URL fragment, history, keyboard navigation).
  }

  return (
    <nav aria-label="Étapes de la session" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      {stages.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(event) => navigate(event, id)}
          style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid var(--selen-border)", fontWeight: 700 }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
