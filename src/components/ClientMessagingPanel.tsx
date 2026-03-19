"use client";

import { useEffect, useMemo, useState } from "react";

type MessageItem = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

export default function ClientMessagingPanel({
  dossierId,
  initialMessages = [],
}: {
  dossierId: string;
  initialMessages?: MessageItem[];
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [messages]);

  useEffect(() => {
    async function loadMessages() {
      try {
        const res = await fetch(
          `/agent/api/messages/list?dossierId=${encodeURIComponent(dossierId)}`,
          {
            cache: "no-store",
          },
        );

        const data = await res.json().catch(() => null);

        if (res.ok) {
          setMessages(data?.items ?? []);
          return;
        }

        setMessages(initialMessages);
      } catch {
        setMessages(initialMessages);
      }
    }

    if (dossierId) {
      loadMessages();
    } else {
      setMessages(initialMessages);
    }
  }, [dossierId, initialMessages]);

  useEffect(() => {
    async function markAsRead() {
      try {
        await fetch("/agent/api/messages/read-client", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dossierId }),
        });
      } catch {
        // silencieux
      }
    }

    markAsRead();
  }, [dossierId]);

  async function sendMessage() {
    try {
      if (!message.trim()) return;

      setSending(true);
      setError(null);
      setSuccess(false);

      const res = await fetch("/agent/api/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dossierId,
          content: message.trim(),
          senderType: "client",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Erreur lors de l’envoi du message.");
      }

      const newMessage: MessageItem = {
        id: crypto.randomUUID(),
        content: message.trim(),
        sender_type: "client",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, newMessage]);
      setMessage("");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      id="client-messaging-panel"
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px solid #deceb7",
        background: "rgba(255,252,247,0.88)",
        padding: "1.5rem",
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.2,
            color: "#3a261a",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Messagerie avec votre agent
        </h2>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "#5f4d3d",
            margin: "8px 0 0",
            fontFamily: "sans-serif",
          }}
        >
          Utilisez cet espace pour poser une question ou répondre à votre agent
          directement depuis la plateforme.
        </p>
      </div>

      <div
        style={{
          maxHeight: 320,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingRight: 4,
          marginBottom: 14,
        }}
      >
        {sortedMessages.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "#7a6453",
              border: "1px solid #ead9bf",
              background: "#fbf3e4",
              padding: "12px 14px",
              borderRadius: 8,
              fontFamily: "sans-serif",
            }}
          >
            Aucun message pour le moment.
          </div>
        ) : (
          sortedMessages.map((item) => {
            const isClient = item.sender_type === "client";

            return (
              <div
                key={item.id}
                style={{
                  alignSelf: isClient ? "flex-end" : "flex-start",
                  maxWidth: "88%",
                  background: isClient ? "#f7eee2" : "#f8f1e8",
                  border: "1px solid #deceb7",
                  borderRadius: 14,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "#7f6b58",
                    marginBottom: 6,
                    fontFamily: "sans-serif",
                  }}
                >
                  {isClient ? "Vous" : "Agent"} ·{" "}
                  {new Date(item.created_at).toLocaleString("fr-FR")}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#3a261a",
                    whiteSpace: "pre-wrap",
                    fontFamily: "sans-serif",
                  }}
                >
                  {item.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      <textarea
        id="client-message-input"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Écrire un message à votre agent..."
        style={{
          width: "100%",
          minHeight: 120,
          resize: "vertical",
          background: "#fffdfa",
          border: "1px solid #d9ccb9",
          borderRadius: 8,
          padding: "12px 14px",
          fontSize: 14,
          color: "#3a261a",
          outline: "none",
          fontFamily: "sans-serif",
          boxSizing: "border-box",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {success && (
            <span
              style={{
                fontSize: 12,
                color: "#446236",
                fontFamily: "sans-serif",
              }}
            >
              Message envoyé avec succès.
            </span>
          )}

          {error && (
            <span
              style={{
                fontSize: 12,
                color: "#8a2f2f",
                fontFamily: "sans-serif",
              }}
            >
              {error}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={sendMessage}
          disabled={sending || !message.trim()}
          style={{
            background:
              sending || !message.trim() ? "rgba(75,46,30,0.45)" : "#4b2e1e",
            color: "white",
            border: "1px solid #4b2e1e",
            borderRadius: 3,
            padding: "12px 20px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "sans-serif",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: sending || !message.trim() ? "not-allowed" : "pointer",
            minWidth: 180,
          }}
        >
          {sending ? "Envoi..." : "Envoyer le message"}
        </button>
      </div>
    </div>
  );
}
