"use client";

import { useEffect, useMemo, useState } from "react";

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
  unreadCount = 0,
}: {
  dossierId: string;
  initialMessages?: MessageItem[];
  hasUnread?: boolean;
  unreadCount?: number;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages);
  const [localHasUnread, setLocalHasUnread] = useState(hasUnread);

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [messages]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    setLocalHasUnread(hasUnread);
  }, [hasUnread]);

  useEffect(() => {
    async function markAsRead() {
      if (!isOpen || !localHasUnread) return;

      try {
        await fetch("/agent/api/messages/read-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dossierId }),
        });

        setLocalHasUnread(false);
      } catch {
        // on laisse silencieux : ce n'est pas bloquant pour l'UI
      }
    }

    markAsRead();
  }, [isOpen, localHasUnread, dossierId]);

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
          senderType: "agent",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Erreur lors de l’envoi du message.");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          width: "100%",
          background: "var(--selen-bg2)",
          border: "1px solid var(--selen-border)",
          borderRadius: "var(--radius-md)",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "var(--selen-text)",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            Messagerie client
          </div>

          <div
            style={{
              fontSize: 11,
              color: "var(--selen-text3)",
              marginTop: 4,
            }}
          >
            {unreadCount > 0
              ? `${unreadCount} message${unreadCount > 1 ? "s" : ""} non lu${unreadCount > 1 ? "s" : ""}`
              : messages.length > 0
                ? "Conversation ouverte"
                : "Ouvrir la conversation"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {localHasUnread && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: "var(--selen-gold)",
                color: "#1a120b",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Nouveau
            </span>
          )}

          {unreadCount > 0 && (
            <span
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 999,
                background: "var(--selen-gold)",
                color: "#1a120b",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                padding: "0 6px",
              }}
            >
              {unreadCount}
            </span>
          )}

          <span style={{ color: "var(--selen-gold)", fontSize: 16 }}>✉</span>
        </div>
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.42)",
              zIndex: 80,
            }}
          />

          <aside
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              width: "min(520px, 100vw)",
              height: "100vh",
              background: "var(--selen-bg)",
              borderLeft: "1px solid var(--selen-border)",
              boxShadow: "-10px 0 30px rgba(0,0,0,0.25)",
              zIndex: 90,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "18px 18px 14px",
                borderBottom: "1px solid var(--selen-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--selen-text)",
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
                  Échanges liés à ce dossier
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  border: "1px solid var(--selen-border)",
                  background: "var(--selen-bg2)",
                  color: "var(--selen-text)",
                  borderRadius: "var(--radius-sm)",
                  width: 38,
                  height: 38,
                  cursor: "pointer",
                  fontSize: 18,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
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
                        borderRadius: 14,
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

            <div
              style={{
                borderTop: "1px solid var(--selen-border)",
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                background: "var(--selen-bg)",
              }}
            >
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Écrire un message au client..."
                style={{
                  width: "100%",
                  minHeight: 120,
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
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
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
                    cursor:
                      sending || !message.trim() ? "not-allowed" : "pointer",
                    minWidth: 180,
                  }}
                >
                  {sending ? "Envoi..." : "Envoyer le message"}
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
