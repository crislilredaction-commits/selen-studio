"use client";

import { Children, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

const LABELS = ["Programme", "Questionnaire de positionnement", "Évaluation finale"];

export default function DailyFormationReviewTabs({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const panels = Children.toArray(children);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % LABELS.length; break;
      case "ArrowLeft": next = (index + LABELS.length - 1) % LABELS.length; break;
      case "Home": next = 0; break;
      case "End": next = LABELS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div role="tablist" aria-label="Revue de la formation" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {LABELS.map((label, index) => (
          <button
            key={label}
            ref={button => { buttons.current[index] = button; }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={event => navigate(event, index)}
            style={{ minHeight: 44, flex: "1 1 180px", border: "1px solid var(--selen-border)", borderRadius: 9, padding: "10px 14px", cursor: "pointer", fontWeight: 800, fontSize: 13, background: selected === index ? "var(--selen-gold2)" : "var(--selen-bg2)", color: selected === index ? "var(--selen-ink)" : "var(--selen-text)" }}
          >{label}</button>
        ))}
      </div>
      {panels.map((panel, index) => (
        <section
          key={LABELS[index]}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={selected !== index}
          tabIndex={0}
          onInvalidCapture={event => {
            // Native form validation must be able to focus a field in any panel.
            flushSync(() => setSelected(index));
            let details = (event.target as HTMLElement).closest("details");
            while (details) {
              details.open = true;
              details = details.parentElement?.closest("details") ?? null;
            }
          }}
        >{panel}</section>
      ))}
    </div>
  );
}
