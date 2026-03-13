"use client";

import { useState, type CSSProperties } from "react";

export type DocumentItem = {
  id: string;
  name: string;
  meta?: string;
  fileType?: "pdf" | "doc" | "other";
  status?: "ok" | "pending" | "missing";
};

type DocumentsListProps = {
  documents: DocumentItem[];
};

function getFileTypeLabel(fileType?: DocumentItem["fileType"]) {
  switch (fileType) {
    case "pdf":
      return "PDF";
    case "doc":
      return "DOC";
    default:
      return "!";
  }
}

function getFileTypeStyles(fileType?: DocumentItem["fileType"]): CSSProperties {
  switch (fileType) {
    case "pdf":
      return {
        background: "rgba(201, 106, 106, 0.14)",
        color: "var(--selen-danger)",
      };
    case "doc":
      return {
        background: "rgba(106, 160, 201, 0.14)",
        color: "var(--selen-info)",
      };
    default:
      return {
        background: "rgba(201, 160, 64, 0.14)",
        color: "var(--selen-warn)",
      };
  }
}

function getStatusLabel(status?: DocumentItem["status"]) {
  switch (status) {
    case "ok":
      return "Reçu";
    case "pending":
      return "Attendu";
    case "missing":
      return "Manquant";
    default:
      return "—";
  }
}

function getStatusStyles(status?: DocumentItem["status"]): CSSProperties {
  switch (status) {
    case "ok":
      return {
        background: "var(--selen-success-bg)",
        color: "var(--selen-success)",
      };
    case "pending":
      return {
        background: "var(--selen-warn-bg)",
        color: "var(--selen-warn)",
      };
    case "missing":
      return {
        background: "var(--selen-danger-bg)",
        color: "var(--selen-danger)",
      };
    default:
      return {
        background: "rgba(255,255,255,0.04)",
        color: "var(--selen-text3)",
      };
  }
}

export default function DocumentsList({ documents }: DocumentsListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(documentId: string) {
    const confirmed = window.confirm(
      "Supprimer ce document du dossier et du stockage ?",
    );
    if (!confirmed) return;

    setDeletingId(documentId);

    const res = await fetch("/agent/api/delete-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId }),
    });

    setDeletingId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Erreur suppression document");
      return;
    }

    window.location.reload();
  }

  async function handleOpen(documentId: string) {
    const res = await fetch("/agent/api/open-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Impossible d’ouvrir le document");
      return;
    }

    const data = await res.json();
    if (!data?.url) {
      alert("Lien sécurisé introuvable");
      return;
    }

    window.open(data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: "var(--font-body)",
      }}
    >
      {documents.map((doc) => (
        <div
          key={doc.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--selen-bg3)",
            border: "1px solid var(--selen-border)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              flexShrink: 0,
              ...getFileTypeStyles(doc.fileType),
            }}
          >
            {getFileTypeLabel(doc.fileType)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--selen-text)",
                marginBottom: 2,
                fontFamily: "var(--font-body)",
              }}
            >
              {doc.name}
            </div>

            <div
              style={{
                fontSize: 11,
                color: "var(--selen-text3)",
                marginBottom: 4,
                fontFamily: "var(--font-body)",
              }}
            >
              {doc.meta ?? "—"}
            </div>

            <button
              type="button"
              onClick={() => handleOpen(doc.id)}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 11,
                color: "var(--selen-gold2)",
                textDecoration: "none",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ouvrir / télécharger
            </button>
          </div>

          <div
            style={{
              borderRadius: "var(--radius-full)",
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              ...getStatusStyles(doc.status),
            }}
          >
            {getStatusLabel(doc.status)}
          </div>

          <button
            type="button"
            onClick={() => handleDelete(doc.id)}
            disabled={deletingId === doc.id}
            style={{
              marginLeft: 8,
              background: "transparent",
              border: "1px solid var(--selen-border)",
              color: "var(--selen-text2)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            {deletingId === doc.id ? "..." : "Supprimer"}
          </button>
        </div>
      ))}
    </div>
  );
}
