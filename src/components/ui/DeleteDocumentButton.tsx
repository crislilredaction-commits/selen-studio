"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

      const data = await res.json();

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
      style={{
        background: isDeleting ? "var(--selen-bg3)" : "transparent",
        color: isDeleting ? "var(--selen-text3)" : "var(--selen-danger)",
        border: "1px solid var(--selen-border)",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 11,
        cursor: isDeleting ? "not-allowed" : "pointer",
        fontFamily: "var(--font-body)",
        opacity: isDeleting ? 0.7 : 1,
      }}
      title="Supprimer le document"
    >
      {isDeleting ? "Suppression..." : "Supprimer"}
    </button>
  );
}
