"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

type Props = {
  documentId: string;
  documentName?: string;
};

export default function DeleteDocumentButton({
  documentId,
  documentName,
}: Props) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Supprimer ce document${documentName ? ` : ${documentName}` : ""} ?`,
    );

    if (!confirmed) return;

    try {
      setIsDeleting(true);

      const res = await fetch("/agent/api/delete-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Impossible de supprimer le document.");
        return;
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue pendant la suppression.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      title="Supprimer le document"
      style={{
        background: "transparent",
        border: "1px solid var(--selen-danger)",
        color: "var(--selen-danger)",
        borderRadius: "var(--radius-sm)",
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: isDeleting ? "not-allowed" : "pointer",
        opacity: isDeleting ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isDeleting) {
          e.currentTarget.style.background = "rgba(185, 78, 72, 0.12)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Trash2 size={16} />
    </button>
  );
}
