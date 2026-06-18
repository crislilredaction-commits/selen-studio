"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  dossierId: string;
  initialUpdatedAt?: string | null;
  initialStatus?: string | null;
};

type DossierStateResponse = {
  ok?: boolean;
  dossier?: {
    status?: string | null;
    updated_at?: string | null;
  };
};

export default function DossierAutoRefreshNotice({
  dossierId,
  initialUpdatedAt,
  initialStatus,
}: Props) {
  const router = useRouter();
  const initialFingerprint = useMemo(
    () => `${initialStatus ?? ""}:${initialUpdatedAt ?? ""}`,
    [initialStatus, initialUpdatedAt],
  );
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkForUpdate() {
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch(
          `/agent/api/dossiers/state?dossierId=${encodeURIComponent(
            dossierId,
          )}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => null)) as
          | DossierStateResponse
          | null;

        if (!response.ok || !data?.ok || cancelled) return;

        const nextFingerprint = `${data.dossier?.status ?? ""}:${
          data.dossier?.updated_at ?? ""
        }`;

        if (nextFingerprint && nextFingerprint !== initialFingerprint) {
          setHasUpdate(true);
        }
      } catch {
        // Polling discret : on ignore les erreurs ponctuelles.
      }
    }

    const interval = window.setInterval(() => void checkForUpdate(), 15000);
    void checkForUpdate();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [dossierId, initialFingerprint]);

  if (!hasUpdate) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 12,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        border: "1px solid rgba(201, 148, 58, 0.34)",
        borderRadius: "var(--radius-md)",
        background: "var(--selen-card)",
        color: "var(--selen-text-oncard)",
        padding: "10px 12px",
        boxShadow: "var(--selen-shadow)",
        marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 13 }}>
        Le dossier a été mis à jour côté client.
      </span>
      <button
        type="button"
        onClick={() => router.refresh()}
        style={{
          border: "1px solid rgba(201, 148, 58, 0.38)",
          borderRadius: "var(--radius-sm)",
          background: "var(--selen-gold2)",
          color: "#2d2116",
          padding: "7px 10px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Actualiser
      </button>
    </div>
  );
}
