"use client";

import { useMemo, useState } from "react";

type MessageItem = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

export default function AgentMessagingDrawer({
  dossierId,
  initialMessages = [],
  hasUnread = false,
}: {
  dossierId: string;
  initialMessages?: MessageItem[];
  hasUnread?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [messages]);

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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erreur envoi message");
      }

      const newMessage: MessageItem = {
        id: crypto.randomUUID(),
        content: message.trim(),
        sender_type: "agent",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, newMessage]);
      setSuccess(true);
      setMessage("");
      setIsOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--selen-bg2)",
        border: "1px solid var(--selen-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          color: "var(--selen-text)",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Messagerie client
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--selen-text3)",
              marginTop: 4,
            }}
          >
            {messages.length > 0
              ? `${messages.length} message${messages.length > 1 ? "s" : ""}`
              : "Aucun message pour le moment"}
          </div>
        </div>

        <div
          style={{
            fontSize: 18,
            color: "var(--selen-gold)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          ▾
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            borderTop: "1px solid var(--selen-border)",
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              maxHeight: 280,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingRight: 4,
            }}
          >
            {sortedMessages.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--selen-text3)",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                }}
              >
                Aucun échange pour le moment.
              </div>
            ) : (
              sortedMessages.map((item) => {
                const isAgent = item.sender_type === "agent";

                return (
                  <div
                    key={item.id}
                    style={{
                      alignSelf: isAgent ? "flex-end" : "flex-start",
                      maxWidth: "88%",
                      background: isAgent
                        ? "rgba(212, 159, 63, 0.16)"
                        : "var(--selen-bg3)",
                      border: `1px solid ${
                        isAgent
                          ? "rgba(212, 159, 63, 0.35)"
                          : "var(--selen-border)"
                      }`,
                      borderRadius: "14px",
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--selen-text3)",
                        marginBottom: 6,
                      }}
                    >
                      {isAgent ? "Agent" : "Client"} ·{" "}
                      {new Date(item.created_at).toLocaleString("fr-FR")}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: "var(--selen-text)",
                        whiteSpace: "pre-wrap",
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
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Écrire un message au client..."
            style={{
              width: "100%",
              minHeight: 110,
              resize: "vertical",
              background: "var(--selen-bg3)",
              border: "1px solid var(--selen-border)",
              borderRadius: "var(--radius-md)",
              padding: "12px 14px",
              color: "var(--selen-text)",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: "var(--font-body)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {success && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--selen-success, #8bc48a)",
                  }}
                >
                  Message envoyé avec succès.
                </span>
              )}

              {error && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--selen-danger, #d87c7c)",
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
                  sending || !message.trim()
                    ? "rgba(212, 159, 63, 0.45)"
                    : "var(--selen-gold)",
                color: "#1a120b",
                border: "none",
                borderRadius: "var(--radius-md)",
                padding: "10px 16px",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "var(--font-body)",
                cursor: sending || !message.trim() ? "not-allowed" : "pointer",
                minWidth: 170,
              }}
            >
              {sending ? "Envoi..." : "Envoyer le message"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
