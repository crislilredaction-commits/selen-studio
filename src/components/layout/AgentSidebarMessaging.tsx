"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Selion from "@/components/ui/Selion";
import { createClient } from "@supabase/supabase-js";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  dossier_id: string | null;
  dossier_title: string | null;
  organisation_name: string | null;
  link_path: string | null;
  pinned: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

type InternalMessageItem = {
  id: string;
  content: string;
  dossier_id: string | null;
  created_at: string;
  author_name?: string | null;
  pinned?: boolean;
  pinned_at?: string | null;
};

const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function AgentSidebarMessaging() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"clients" | "epingles" | "equipe">("clients");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [internalMessages, setInternalMessages] = useState<
    InternalMessageItem[]
  >([]);
  const [internalDraft, setInternalDraft] = useState("");
  const [sendingInternal, setSendingInternal] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("Équipe Selen");

  async function loadNotifications() {
    try {
      const res = await fetch("/agent/api/notifications/list", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setNotifications(data?.items ?? []);
      }
    } catch {
      // silencieux
    }
  }

  async function loadInternalMessages() {
    try {
      const res = await fetch("/agent/api/internal-messages/list", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setInternalMessages(data?.items ?? []);
      }
    } catch {
      // silencieux
    }
  }

  useEffect(() => {
    loadNotifications();
    loadInternalMessages();
  }, []);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel("sidebar-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          loadNotifications();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_messages" },
        () => {
          loadInternalMessages();
        },
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, []);

  const visibleNotifications = useMemo(() => {
    return notifications.filter((item) => !item.dismissed_at);
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return visibleNotifications.filter((item) => !item.read_at).length;
  }, [visibleNotifications]);

  const sortedNotifications = useMemo(() => {
    return [...visibleNotifications].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, [visibleNotifications]);

  const sortedInternalMessages = useMemo(() => {
    return [...internalMessages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [internalMessages]);

  const pinnedInternalMessages = useMemo(() => {
    return sortedInternalMessages.filter((item) => item.pinned);
  }, [sortedInternalMessages]);

  async function updateNotification(
    notificationId: string,
    action: "pin" | "unpin" | "dismiss" | "read",
  ) {
    try {
      const res = await fetch("/agent/api/notifications/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notificationId, action }),
      });

      if (res.ok) {
        await loadNotifications();
      }
    } catch {
      // silencieux
    }
  }

  async function sendInternalMessage() {
    if (!internalDraft.trim()) return;

    try {
      setSendingInternal(true);
      setInternalError(null);

      const res = await fetch("/agent/api/internal-messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: internalDraft.trim(),
          authorName: authorName.trim() || "Équipe Selen",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? "Erreur lors de l’envoi à l’équipe.");
      }

      setInternalDraft("");
      await loadInternalMessages();
    } catch (error) {
      setInternalError(
        error instanceof Error ? error.message : "Erreur inconnue.",
      );
    } finally {
      setSendingInternal(false);
    }
  }

  function getInternalAuthor(item: InternalMessageItem) {
    return item.author_name ?? "Équipe";
  }

  function renderNotificationList(
    items: NotificationItem[],
    emptyText: string,
  ) {
    if (items.length === 0) {
      return (
        <div
          style={{
            fontSize: 11,
            color: "var(--selen-text3)",
            padding: "8px 6px",
          }}
        >
          {emptyText}
        </div>
      );
    }

    return items.map((item) => (
      <div
        key={item.id}
        style={{
          border: "1px solid var(--selen-border)",
          background: "var(--selen-bg3)",
          borderRadius: "var(--radius-md)",
          padding: "10px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--selen-text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.organisation_name ?? "Client"}
            </div>

            <div
              style={{
                fontSize: 10,
                color: "var(--selen-text3)",
                marginTop: 2,
                lineHeight: 1.35,
              }}
            >
              {item.dossier_title ?? "Dossier"} · {item.title}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() =>
                updateNotification(item.id, item.pinned ? "unpin" : "pin")
              }
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: item.pinned
                  ? "var(--selen-gold2)"
                  : "var(--selen-text3)",
              }}
              title={item.pinned ? "Désépingler" : "Épingler"}
            >
              📌
            </button>

            <button
              type="button"
              onClick={() => updateNotification(item.id, "dismiss")}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "var(--selen-text3)",
              }}
              title="Traité"
            >
              ✓
            </button>
          </div>
        </div>

        {item.content ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--selen-text2)",
              lineHeight: 1.45,
              marginTop: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {item.content}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
            gap: 8,
          }}
        >
          <Link
            href={item.link_path ?? "/agent/dossiers"}
            onClick={() => updateNotification(item.id, "read")}
            style={{
              fontSize: 11,
              color: "var(--selen-gold2)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Ouvrir →
          </Link>

          {!item.read_at && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: "var(--selen-gold)",
                color: "var(--selen-ink)",
                borderRadius: 999,
                padding: "2px 7px",
                flexShrink: 0,
              }}
            >
              Nouveau
            </span>
          )}
        </div>
      </div>
    ));
  }

  return (
    <div
      style={{
        ...({
          "--selen-text": "var(--selen-text-oncard)",
          "--selen-text2": "var(--selen-text2-oncard)",
          "--selen-text3": "var(--selen-text3-oncard)",
          "--selen-bg2": "var(--selen-card2)",
          "--selen-bg3": "rgba(247, 239, 224, 0.08)",
          "--selen-border": "rgba(245, 208, 138, 0.18)",
          "--selen-border2": "rgba(245, 208, 138, 0.34)",
        } as React.CSSProperties),
        position: "relative",
        zIndex: open ? 80 : 1,
        border: "1px solid var(--selen-border)",
        background: "var(--selen-card-texture), var(--selen-card)",
        borderRadius: "var(--radius-lg)",
        overflow: "visible",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Selion compact size={34} animate={unreadCount > 0} />
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--selen-text)",
              }}
            >
              Messagerie
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--selen-text3)",
                marginTop: 2,
              }}
            >
              {unreadCount > 0
                ? `${unreadCount} alerte${unreadCount > 1 ? "s" : ""}`
                : "Tout est calme"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {unreadCount > 0 && (
            <span
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 999,
                background: "var(--selen-gold)",
                color: "var(--selen-ink)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                padding: "0 6px",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}

          <span
            style={{
              color: "var(--selen-gold2)",
              fontSize: 14,
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(100% + 10px)",
            zIndex: 90,
            border: "1px solid var(--selen-border)",
            background: "var(--selen-card-texture), var(--selen-card)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 -18px 45px rgba(58, 44, 32, 0.32)",
            padding: 10,
            height: "min(620px, calc(100vh - 180px))",
            minHeight: 460,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setTab("clients")}
              style={{
                border: "1px solid var(--selen-border)",
                background:
                  tab === "clients" ? "var(--selen-bg3)" : "transparent",
                color: "var(--selen-text)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Clients
            </button>

            <button
              type="button"
              onClick={() => setTab("epingles")}
              style={{
                border: "1px solid var(--selen-border)",
                background:
                  tab === "epingles" ? "var(--selen-bg3)" : "transparent",
                color: "var(--selen-text)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Épinglés
            </button>

            <button
              type="button"
              onClick={() => setTab("equipe")}
              style={{
                border: "1px solid var(--selen-border)",
                background:
                  tab === "equipe" ? "var(--selen-bg3)" : "transparent",
                color: "var(--selen-text)",
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              Équipe
            </button>
          </div>

          {tab === "clients" && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: 4,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {renderNotificationList(
                sortedNotifications,
                "Aucune alerte client pour le moment.",
              )}
            </div>
          )}

          {tab === "epingles" && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: 4,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {pinnedInternalMessages.length === 0 ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--selen-text3)",
                    padding: "8px 6px",
                  }}
                >
                  Aucun message épinglé pour le moment.
                </div>
              ) : (
                pinnedInternalMessages.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid var(--selen-border)",
                      background: "var(--selen-bg3)",
                      borderRadius: "var(--radius-md)",
                      padding: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--selen-text3)",
                        }}
                      >
                        {getInternalAuthor(item)} ·{" "}
                        {new Date(item.created_at).toLocaleString("fr-FR")}
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch(
                            "/agent/api/internal-messages/update-status",
                            {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                messageId: item.id,
                                action: item.pinned ? "unpin" : "pin",
                              }),
                            },
                          );

                          if (res.ok) {
                            await loadInternalMessages();
                          }
                        }}
                        style={{
                          background: item.pinned
                            ? "rgba(212, 159, 63, 0.16)"
                            : "transparent",
                          border: "1px solid var(--selen-border)",
                          cursor: "pointer",
                          fontSize: 10,
                          color: item.pinned
                            ? "var(--selen-gold2)"
                            : "var(--selen-text3)",
                          flexShrink: 0,
                          borderRadius: "999px",
                          padding: "4px 8px",
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                        title={item.pinned ? "Désépingler" : "Épingler"}
                      >
                        {item.pinned ? "Épinglé" : "Épingler"}
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--selen-text)",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === "equipe" && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                overflow: "hidden",
              }}
            >
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Nom affiché"
                style={{
                  width: "100%",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  color: "var(--selen-text)",
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingRight: 4,
                }}
              >
                {sortedInternalMessages.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--selen-text3)",
                      padding: "8px 6px",
                    }}
                  >
                    Aucun message équipe pour le moment.
                  </div>
                ) : (
                  sortedInternalMessages.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid var(--selen-border)",
                        background: "var(--selen-bg3)",
                        borderRadius: "var(--radius-md)",
                        padding: "10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--selen-text3)",
                            lineHeight: 1.35,
                          }}
                        >
                          {getInternalAuthor(item)} ·{" "}
                          {new Date(item.created_at).toLocaleString("fr-FR")}
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            const res = await fetch(
                              "/agent/api/internal-messages/update-status",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  messageId: item.id,
                                  action: item.pinned ? "unpin" : "pin",
                                }),
                              },
                            );

                            if (res.ok) {
                              await loadInternalMessages();
                            }
                          }}
                          style={{
                            background: item.pinned
                              ? "rgba(212, 159, 63, 0.18)"
                              : "rgba(255,255,255,0.03)",
                            border: "1px solid var(--selen-border)",
                            borderRadius: 999,
                            padding: "4px 8px",
                            cursor: "pointer",
                            fontSize: 10,
                            fontWeight: 700,
                            color: item.pinned
                              ? "var(--selen-gold2)"
                              : "var(--selen-text2)",
                            flexShrink: 0,
                            whiteSpace: "nowrap",
                          }}
                          title={item.pinned ? "Désépingler" : "Épingler"}
                        >
                          {item.pinned ? "Épinglé" : "Épingler"}
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--selen-text)",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {item.content}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <textarea
                value={internalDraft}
                onChange={(e) => setInternalDraft(e.target.value)}
                placeholder="Écrire à l'équipe..."
                style={{
                  width: "100%",
                  minHeight: 90,
                  maxHeight: 130,
                  resize: "vertical",
                  background: "var(--selen-bg3)",
                  border: "1px solid var(--selen-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 12px",
                  color: "var(--selen-text)",
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              />

              {internalError ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--selen-danger)",
                    lineHeight: 1.4,
                    flexShrink: 0,
                  }}
                >
                  {internalError}
                </div>
              ) : null}

              <button
                type="button"
                onClick={sendInternalMessage}
                disabled={sendingInternal || !internalDraft.trim()}
                style={{
                  background:
                    sendingInternal || !internalDraft.trim()
                      ? "rgba(201, 148, 58, 0.45)"
                      : "var(--selen-gold)",
                  color: "var(--selen-ink)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  padding: "10px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor:
                    sendingInternal || !internalDraft.trim()
                      ? "not-allowed"
                      : "pointer",
                  flexShrink: 0,
                }}
              >
                {sendingInternal ? "Envoi..." : "Envoyer à l'équipe"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
