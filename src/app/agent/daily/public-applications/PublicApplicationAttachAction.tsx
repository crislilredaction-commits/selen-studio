"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import SelenButton from "@/components/ui/SelenButton";

type Props = {
  requestId: string;
};

export default function PublicApplicationAttachAction({ requestId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function attach() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/agent/api/daily/public-applications/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Impossible de rattacher cette candidature.");
        return;
      }
      router.refresh();
    } catch {
      setError("Impossible de contacter Studio. Réessaie dans quelques instants.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 7, justifyItems: "start" }}>
      <SelenButton onClick={attach} disabled={pending}>
        {pending ? "Rattachement…" : "Confirmer le rattachement"}
      </SelenButton>
      <span style={{ color: "var(--selen-text3)", fontSize: 11, lineHeight: 1.45 }}>
        Le dossier rejoint la revue Selen de la session. Cela ne confirme ni l’inscription ni la formation avant signature de la convention.
      </span>
      {error ? (
        <span style={{ color: "var(--selen-danger)", fontSize: 11, lineHeight: 1.45 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
