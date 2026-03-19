"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  dossierId: string;
};

export default function AnalyzeNdaButton({ dossierId }: Props) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  async function handleAnalyze() {
    try {
      setIsRunning(true);

      const formData = new FormData();
      formData.append("dossier_id", dossierId);

      const res = await fetch("/agent/api/analyse-nda", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let message = "Analyse impossible.";
        try {
          const data = await res.json();
          message = data?.error || message;
        } catch {
          // rien
        }
        alert(message);
        return;
      }

      router.refresh();
      alert("Analyse terminée ✨");
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue pendant l’analyse.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleAnalyze}
      disabled={isRunning}
      style={{
        marginTop: 12,
        background: isRunning ? "var(--selen-copper)" : "var(--selen-gold)",
        color: "#1a120b",
        border: "none",
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 12,
        cursor: isRunning ? "not-allowed" : "pointer",
        fontFamily: "var(--font-body)",
        opacity: isRunning ? 0.85 : 1,
      }}
    >
      {isRunning
        ? "⏳ Analyse en cours..."
        : "🧠 Analyser automatiquement le dossier"}
    </button>
  );
}
