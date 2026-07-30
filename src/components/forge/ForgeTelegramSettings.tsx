"use client";

import { Send } from "lucide-react";
import { useEffect, useState } from "react";

type Status = {
  enabled: boolean;
  runtime: {
    enabled: boolean;
    allowed: boolean;
    configured: boolean;
    environment: string;
  };
};

export default function ForgeTelegramSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/agent/api/forge/telegram");
    if (response.ok) setStatus(await response.json() as Status);
  }

  useEffect(() => {
    let active = true;
    void fetch("/agent/api/forge/telegram")
      .then((response) => response.ok ? response.json() as Promise<Status> : null)
      .then((nextStatus) => {
        if (active && nextStatus) setStatus(nextStatus);
      });
    return () => { active = false; };
  }, []);
  if (!status) return null;

  const operational = status.runtime.enabled && status.runtime.allowed && status.runtime.configured;

  async function toggle() {
    if (!status) return;
    const wasEnabled = status.enabled;
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/agent/api/forge/telegram", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !wasEnabled }),
    });
    setFeedback(response.ok
      ? `Lil, les alertes Telegram sont maintenant ${wasEnabled ? "en pause" : "actives"}.`
      : "Lil, je n’ai pas pu modifier le canal Telegram. Rien d’autre n’a été changé.");
    await load();
    setBusy(false);
  }

  async function test() {
    if (!window.confirm("Envoyer maintenant un message de test clairement identifié sur ton Telegram privé ?")) return;
    setBusy(true);
    setFeedback(null);
    const response = await fetch("/agent/api/forge/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    setFeedback(response.ok
      ? "Lil, le message de test a bien été envoyé sur Telegram."
      : "Lil, le test Telegram n’a pas abouti. Le détail technique est disponible dans les journaux serveur.");
    setBusy(false);
  }

  return (
    <section className="forge-alert-toolbar" aria-label="Relais Telegram">
      <div>
        <strong><Send size={16} aria-hidden /> Relais Telegram privé</strong>
        <p>
          {status.enabled && operational
            ? "Les alertes importantes de Cody peuvent t’être transmises sur Telegram."
            : "Aucun message Telegram automatique ne sera envoyé dans cet état."}
        </p>
      </div>
      <button className="forge-button" type="button" disabled={busy || !operational} onClick={() => void toggle()}>
        {status.enabled ? "Mettre en pause" : "Activer"}
      </button>
      <button className="forge-button" type="button" disabled={busy || !operational} onClick={() => void test()}>
        Envoyer un test
      </button>
      {feedback ? <p role="status">{feedback}</p> : null}
    </section>
  );
}
