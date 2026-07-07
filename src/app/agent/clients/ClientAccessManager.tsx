"use client";

import { useEffect, useState } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import SelenBadge from "@/components/ui/SelenBadge";

type Tool = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
  display_order: number | null;
  created_at: string;
};

type Client = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type Access = {
  id: string;
  user_id: string;
  tool_slug: string;
  status: string;
  access_type: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type AccessResponse = {
  tools: Tool[];
  client: Client | null;
  accesses: Access[];
  message?: string;
  error?: string;
};

type ClientAccessManagerProps = {
  initialEmail?: string | null;
  initialName?: string | null;
  organisationId?: string | null;
  clientNotificationsPaused?: boolean;
  embeddedMode?: boolean;
  title?: string;
};

function getDefaultEndDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 3);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "Illimité";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getToolName(tools: Tool[], slug: string) {
  return tools.find((tool) => tool.slug === slug)?.name ?? slug;
}

export default function ClientAccessManager({
  initialEmail = "",
  initialName = "",
  organisationId = null,
  clientNotificationsPaused = false,
  embeddedMode = false,
  title,
}: ClientAccessManagerProps = {}) {
  const defaultEmail = initialEmail?.trim().toLowerCase() ?? "";
  const defaultName = initialName?.trim() ?? "";
  const [email, setEmail] = useState(defaultEmail);
  const [fullName, setFullName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [selectedToolSlug, setSelectedToolSlug] = useState("");
  const [accessType, setAccessType] = useState<"limited" | "unlimited">(
    "limited",
  );
  const [endsAt, setEndsAt] = useState(getDefaultEndDate());
  const [data, setData] = useState<AccessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tools = data?.tools ?? [];
  const accesses = data?.accesses ?? [];
  const client = data?.client ?? null;
  const hasLoaded = data !== null;
  const selectedAccess = accesses.find(
    (access) => access.tool_slug === selectedToolSlug,
  );
  const hasActiveAccess = accesses.some((access) => access.status === "active");

  void organisationId;

  const activeTools = tools.filter((tool) => tool.is_active);

  useEffect(() => {
    loadAccesses(defaultEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultEmail]);

  async function loadAccesses(targetEmail = email) {
    const cleanEmail = targetEmail.trim().toLowerCase();

    setLoading(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(
        `/agent/api/access?email=${encodeURIComponent(cleanEmail)}`,
      );

      const result = (await response.json()) as AccessResponse;

      if (!response.ok) {
        throw new Error(result.error ?? "Erreur pendant le chargement.");
      }

      setData(result);

      const firstActiveTool = result.tools?.find((tool) => tool.is_active);

      if (!selectedToolSlug && firstActiveTool?.slug) {
        setSelectedToolSlug(firstActiveTool.slug);
      }

      if (result.message) {
        setNotice(result.message);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Erreur inconnue pendant le chargement.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createUser() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Renseigne d’abord l’email du client.");
      return;
    }

    setActionLoading(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/agent/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create_user",
          email: cleanEmail,
          fullName,
          password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Erreur pendant la création client.");
      }

      if (result.temporaryPassword) {
        setNotice(
          `Utilisateur créé. Mot de passe temporaire : ${result.temporaryPassword}`,
        );
      } else {
        setNotice(result.message ?? "Utilisateur retrouvé.");
      }

      await loadAccesses(cleanEmail);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Erreur inconnue pendant la création client.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function grantAccess() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Renseigne d’abord l’email du client.");
      return;
    }

    if (!selectedToolSlug) {
      setError("Choisis une prestation à activer.");
      return;
    }

    if (accessType === "limited" && !endsAt) {
      setError("Choisis une date de fin pour l’accès limité.");
      return;
    }

    setActionLoading(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/agent/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "grant_access",
          email: cleanEmail,
          toolSlug: selectedToolSlug,
          accessType,
          endsAt: accessType === "limited" ? `${endsAt}T23:59:59.000Z` : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Erreur pendant l’activation.");
      }

      setNotice(result.message ?? "Accès activé.");
      await loadAccesses(cleanEmail);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Erreur inconnue pendant l’activation.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function deactivateAccess(accessId: string) {
    const cleanEmail = email.trim().toLowerCase();

    setActionLoading(true);
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/agent/api/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "deactivate_access",
          accessId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Erreur pendant la désactivation.");
      }

      setNotice(result.message ?? "Accès désactivé.");
      await loadAccesses(cleanEmail);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Erreur inconnue pendant la désactivation.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <SelenCard>
      <SelenCardTitle>
        {title ?? (embeddedMode ? "Accès Bureau Selen" : "Accès aux prestations")}
      </SelenCardTitle>

      {embeddedMode ? (
        <p
          style={{
            margin: "8px 0 0",
            color: "var(--selen-text2)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Créez le compte de connexion, activez une prestation et vérifiez les
          accès client sans quitter cette fiche.
        </p>
      ) : null}

      {clientNotificationsPaused ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(214, 161, 74, 0.45)",
            background: "rgba(214, 161, 74, 0.1)",
            color: "var(--selen-text)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Les emails client sont suspendus. Vous pouvez préparer l’accès, mais
          aucun email ne sera envoyé tant que le mode préparation silencieuse
          est actif.
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: embeddedMode ? "1fr" : "1.4fr 1fr auto",
          gap: 12,
          alignItems: "end",
          marginTop: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>
            Email de connexion Bureau Selen
          </span>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="client@email.fr"
            style={{
              height: 42,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--selen-border)",
              background: "var(--selen-bg3)",
              color: "var(--selen-text)",
              padding: "0 12px",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>
            Nom complet optionnel
          </span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Nom du client"
            style={{
              height: 42,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--selen-border)",
              background: "var(--selen-bg3)",
              color: "var(--selen-text)",
              padding: "0 12px",
            }}
          />
        </label>

        <SelenButton
          variant="primary"
          onClick={() => loadAccesses()}
          disabled={loading || actionLoading}
        >
          {loading ? "Recherche..." : "Rechercher le compte"}
        </SelenButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: embeddedMode ? "1fr" : "1fr auto",
          gap: 12,
          alignItems: "end",
          marginTop: 12,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>
            Mot de passe temporaire optionnel
          </span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Laisser vide pour générer automatiquement"
            style={{
              height: 42,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--selen-border)",
              background: "var(--selen-bg3)",
              color: "var(--selen-text)",
              padding: "0 12px",
            }}
          />
        </label>

        <SelenButton
          variant="ghost"
          onClick={createUser}
          disabled={Boolean(client) || actionLoading || loading}
        >
          {client ? "Compte Bureau Selen existant" : "Créer le compte Bureau Selen"}
        </SelenButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: embeddedMode ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        <StatusLine
          label="Compte de connexion"
          value={
            client
              ? "Compte de connexion existant"
              : hasLoaded
                ? "Aucun compte de connexion trouvé"
                : "Recherche à lancer"
          }
          tone={client ? "success" : hasLoaded ? "warning" : "neutral"}
        />
        <StatusLine
          label="Accès prestation"
          value={
            hasActiveAccess
              ? "Accès prestation actif"
              : hasLoaded
                ? "Aucun accès prestation actif"
                : "Recherche à lancer"
          }
          tone={hasActiveAccess ? "success" : hasLoaded ? "warning" : "neutral"}
        />
      </div>

      {notice ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(108, 190, 140, 0.45)",
            background: "rgba(108, 190, 140, 0.08)",
            color: "var(--selen-text)",
            fontSize: 13,
          }}
        >
          {notice}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(220, 80, 80, 0.45)",
            background: "rgba(220, 80, 80, 0.08)",
            color: "var(--selen-danger)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          padding: 14,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--selen-border)",
          background: "var(--selen-bg3)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: "var(--selen-text2)",
            marginBottom: 12,
          }}
        >
          {client ? (
            <>
              Compte Bureau Selen trouvé :{" "}
              <strong style={{ color: "var(--selen-text)" }}>
                {client.email}
              </strong>
            </>
          ) : (
            "Recherchez un compte de connexion Bureau Selen ou créez-le avant d’activer une prestation."
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: embeddedMode ? "1fr" : "1.4fr 0.8fr 0.8fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>
              Prestation
            </span>
            <select
              value={selectedToolSlug}
              onChange={(event) => setSelectedToolSlug(event.target.value)}
              style={{
                height: 42,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg2)",
                color: "var(--selen-text)",
                padding: "0 12px",
              }}
            >
              {activeTools.length === 0 ? (
                <option value="">Aucune prestation active</option>
              ) : (
                activeTools.map((tool) => (
                  <option key={tool.id} value={tool.slug}>
                    {tool.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>
              Type d’accès
            </span>
            <select
              value={accessType}
              onChange={(event) =>
                setAccessType(event.target.value as "limited" | "unlimited")
              }
              style={{
                height: 42,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg2)",
                color: "var(--selen-text)",
                padding: "0 12px",
              }}
            >
              <option value="limited">Limité</option>
              <option value="unlimited">Illimité</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--selen-text2)" }}>
              Fin d’accès
            </span>
            <input
              type="date"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              disabled={accessType === "unlimited"}
              style={{
                height: 42,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--selen-border)",
                background: "var(--selen-bg2)",
                color: "var(--selen-text)",
                padding: "0 12px",
                opacity: accessType === "unlimited" ? 0.5 : 1,
              }}
            />
          </label>

          <SelenButton
            variant="primary"
            onClick={grantAccess}
            disabled={!client || actionLoading || loading}
          >
            {selectedAccess?.status === "active"
              ? "Mettre à jour l’accès"
              : "Activer l’accès"}
          </SelenButton>
        </div>

        {selectedAccess ? (
          <p
            style={{
              margin: "12px 0 0",
              color: "var(--selen-text2)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            Cet accès existe déjà. L’action met à jour l’accès existant sans
            créer de doublon.
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 18 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 13,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--selen-gold)",
            marginBottom: 10,
          }}
        >
          Accès existants
        </div>

        {accesses.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--selen-text3)",
              padding: "8px 0",
            }}
          >
            Aucun accès trouvé pour ce client.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accesses.map((access) => (
              <div
                key={access.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.3fr 0.8fr 0.8fr 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--selen-border)",
                  background: "var(--selen-bg3)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--selen-text)",
                    }}
                  >
                    {getToolName(tools, access.tool_slug)}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--selen-text3)",
                      marginTop: 3,
                    }}
                  >
                    {access.tool_slug}
                  </div>
                </div>

                <SelenBadge
                  variant={access.status === "active" ? "success" : "neutral"}
                  dot
                >
                  {access.status === "active"
                    ? "Actif"
                    : access.status === "disabled"
                      ? "Désactivé"
                      : access.status === "expired"
                        ? "Expiré"
                        : access.status}
                </SelenBadge>

                <SelenBadge
                  variant={access.access_type === "unlimited" ? "info" : "type"}
                  dot
                >
                  {access.access_type === "unlimited" ? "Illimité" : "Limité"}
                </SelenBadge>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text2)",
                  }}
                >
                  Jusqu’au {formatDate(access.ends_at)}
                </div>

                <button
                  type="button"
                  onClick={() => deactivateAccess(access.id)}
                  disabled={actionLoading || access.status !== "active"}
                  style={{
                    border: "1px solid var(--selen-border)",
                    background: "transparent",
                    color:
                      access.status === "active"
                        ? "var(--selen-danger)"
                        : "var(--selen-text3)",
                    borderRadius: "var(--radius-md)",
                    padding: "8px 10px",
                    cursor:
                      actionLoading || access.status !== "active"
                        ? "not-allowed"
                        : "pointer",
                    fontSize: 12,
                    opacity: access.status === "active" ? 1 : 0.5,
                  }}
                >
                  Désactiver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SelenCard>
  );
}

function StatusLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}) {
  const borderColor =
    tone === "success"
      ? "rgba(108, 190, 140, 0.45)"
      : tone === "warning"
        ? "rgba(214, 161, 74, 0.45)"
        : "var(--selen-border)";
  const background =
    tone === "success"
      ? "rgba(108, 190, 140, 0.08)"
      : tone === "warning"
        ? "rgba(214, 161, 74, 0.1)"
        : "var(--selen-bg3)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        background,
        borderRadius: "var(--radius-md)",
        padding: 12,
      }}
    >
      <div
        style={{
          color: "var(--selen-text3)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ color: "var(--selen-text)", fontSize: 13, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}
