"use client";

function getErrorMessage(error?: string) {
  switch (error) {
    case "document_not_found":
      return "Document introuvable.";
    case "missing_storage_path":
      return "Ce document n'a pas de fichier associe.";
    case "signed_url_failed":
      return "Impossible de generer le lien de telechargement.";
    case "unauthorized":
      return "Acces non autorise.";
    default:
      return "Impossible d'ouvrir ce document.";
  }
}

export default function OpenDocumentButton({ docId }: { docId: string }) {
  async function handleOpen() {
    const targetWindow = window.open("", "_blank");
    if (targetWindow) {
      targetWindow.opener = null;
    }

    try {
      const res = await fetch("/agent/api/open-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId: docId }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok || !data?.url) {
        targetWindow?.close();
        alert(getErrorMessage(data?.error));
        return;
      }

      if (targetWindow) {
        targetWindow.location.href = data.url;
      } else {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      targetWindow?.close();
      console.error(error);
      alert("Impossible d'ouvrir ce document.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      title="Ouvrir le document"
      style={{
        minWidth: 58,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "1px solid var(--selen-border)",
        borderRadius: 8,
        color: "var(--selen-text2)",
        cursor: "pointer",
        fontSize: 14,
        fontFamily: "var(--font-body)",
      }}
    >
      Ouvrir
    </button>
  );
}
