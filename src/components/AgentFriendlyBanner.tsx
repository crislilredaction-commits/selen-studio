"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MESSAGES = [
  "Tu avances bien. Je garde les détails administratifs sous contrôle pendant que tu pilotes l'essentiel. ✨",
  "Un dossier à la fois, et on finit toujours par dompter la paperasse. 🗂️",
  "Petit rappel amical : une vérification maintenant évite souvent trois relances demain. 🌿",
  "Tout n'a pas besoin d'être traité d'un coup. Commence par ce qui bloque réellement la suite. 🎯",
  "Sélion a sorti sa loupe : si quelque chose mérite ton attention, on le mettra devant, pas sous une montagne de menus. 🔎",
  "Les preuves bien rangées aujourd'hui, c'est un audit beaucoup plus calme demain. ☕",
  "Tu peux respirer : les tâches secondaires peuvent attendre leur tour. On garde le cap sur la prochaine action utile. 🧭",
  "Une session propre, c'est surtout une suite de petites validations simples. Pas besoin d'en faire un roman. 📚",
  "Quand un écran commence à ressembler à un cockpit d'Airbus, c'est souvent qu'il est temps de le simplifier. 😌",
  "Tu n'as pas à tout mémoriser : Studio est justement là pour porter la charge administrative avec toi. ✨",
  "Un bon dossier n'est pas celui qui contient le plus de choses, mais celui où l'on retrouve immédiatement la bonne preuve. 📎",
  "Aujourd'hui aussi, priorité à l'utile. Le reste attendra poliment dans sa file. 🌙",
];

function pickMessage(pathname: string) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const seed = `${dayKey}:${pathname}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return seed % MESSAGES.length;
}

export default function AgentFriendlyBanner() {
  const pathname = usePathname();
  const [index, setIndex] = useState(() => pickMessage(pathname));

  useEffect(() => {
    const key = "selen-studio-friendly-history";
    let history: number[] = [];
    try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch { history = []; }
    let next = pickMessage(pathname);
    for (let step = 0; step < MESSAGES.length && history.includes(next); step += 1) next = (next + 1) % MESSAGES.length;
    const nextHistory = [next, ...history.filter((value) => value !== next)].slice(0, 4);
    localStorage.setItem(key, JSON.stringify(nextHistory));
    setIndex(next);
  }, [pathname]);

  return (
    <div style={{ maxWidth: 1180, margin: "14px auto 0", padding: "0 28px" }} aria-live="polite">
      <div style={{ border: "1px solid var(--selen-border)", borderRadius: 12, background: "linear-gradient(90deg, rgba(201,148,58,.12), rgba(245,208,138,.05))", color: "var(--selen-text2)", padding: "10px 14px", fontSize: 13, lineHeight: 1.5 }}>
        {MESSAGES[index]}
      </div>
    </div>
  );
}
