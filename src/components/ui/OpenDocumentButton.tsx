"use client";

export default function OpenDocumentButton({ docId }: { docId: string }) {
  async function handleOpen() {
    const res = await fetch("/agent/api/open-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documentId: docId }),
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
    <button
      type="button"
      onClick={handleOpen}
      title="Ouvrir le document"
      style={{
        width: 32,
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
      👁
    </button>
  );
}
