import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import { createAgentAssistanceToken } from "@/lib/server/agentAssistanceTokens";
import ClientAccessManager from "../ClientAccessManager";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    saved?: string;
    edit?: string;
    silence?: string;
    reopened?: string;
    error?: string;
  }>;
};

type DossierRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

type ClientRow = {
  id: string;
  name: string;
  status: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  nda_number: string | null;
  address: string | null;
  client_notifications_paused: boolean | null;
  dossiers: DossierRow[] | null;
};

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "nda":
      return "NDA";
    case "review":
      return "Review";
    case "prepa":
      return "Prépa";
    case "daily":
      return "Daily";
    case "non_conformite":
      return "Non-conformité";
    case "audit_blanc":
      return "Review";
    case "mise_en_conformite":
      return "Prépa";
    case "audit_reel":
      return "Prépa";
    default:
      return type;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "waiting_client":
      return "En attente client";
    case "assignable":
      return "À assigner";
    case "assigned":
      return "Assigné";
    case "in_progress":
      return "En cours";
    case "generated":
      return "Généré";
    case "collecting_documents":
      return "Collecte documents";
    case "under_review":
      return "En vérification";
    case "to_complete":
      return "À compléter";
    case "compliant":
      return "Conforme";
    case "archived":
      return "Archivé";
    default:
      return status;
  }
}

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case "nda":
      return "type";
    case "review":
      return "info";
    case "prepa":
      return "warn";
    case "daily":
      return "success";
    case "non_conformite":
      return "danger";
    case "audit_blanc":
      return "info";
    case "mise_en_conformite":
      return "warn";
    case "audit_reel":
      return "warn";
    default:
      return "neutral";
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "compliant":
    case "generated":
      return "success";
    case "waiting_client":
    case "to_complete":
      return "warn";
    case "in_progress":
    case "collecting_documents":
    case "under_review":
      return "info";
    case "archived":
      return "neutral";
    case "assignable":
    case "assigned":
      return "status";
    case "draft":
      return "neutral";
    default:
      return "status";
  }
}

export default async function ClientPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("organisations")
    .select(
      `
        id,
        name,
        status,
        email,
        phone,
        siret,
        nda_number,
        address,
        client_notifications_paused,
        dossiers (
          id,
          title,
          type,
          status,
          created_at
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main style={{ padding: "24px 28px" }}>
        <div
          style={{
            color: "var(--selen-danger)",
            background: "var(--selen-card)",
            border: "1px solid var(--selen-border)",
            borderRadius: "var(--radius-lg)",
            padding: 16,
          }}
        >
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main style={{ padding: "24px 28px", color: "var(--selen-text)" }}>
        Client introuvable
      </main>
    );
  }

  const typedClient = client as ClientRow;

  const activeDossiers = (typedClient.dossiers ?? []).filter(
    (dossier) => dossier.status !== "archived",
  );

  const archivedDossiers = (typedClient.dossiers ?? []).filter(
    (dossier) => dossier.status === "archived",
  );

  const dossierCount = activeDossiers.length;
  const archivedDossierCount = archivedDossiers.length;

  const activeDossierCount = activeDossiers.length;
  const isEditing = query.edit === "1";
  const emailsPaused = Boolean(typedClient.client_notifications_paused);

  async function updateClientAction(formData: FormData) {
    "use server";

    const clientId = String(formData.get("client_id") ?? "").trim();
    const name = formText(formData, "name");

    if (!clientId || !name) {
      redirect(`/agent/clients/${id}?error=missing-client-fields`);
    }

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("organisations")
      .update({
        name,
        email: formText(formData, "email"),
        phone: formText(formData, "phone"),
        siret: formText(formData, "siret"),
        nda_number: formText(formData, "nda_number"),
        address: formText(formData, "address"),
      })
      .eq("id", clientId);

    if (updateError) {
      console.error(updateError);
      redirect(`/agent/clients/${clientId}?error=save-client`);
    }

    redirect(`/agent/clients/${clientId}?saved=1`);
  }

  async function setClientNotificationsPausedAction(formData: FormData) {
    "use server";

    const clientId = String(formData.get("client_id") ?? "").trim();
    const paused = String(formData.get("paused") ?? "") === "true";

    if (!clientId) {
      redirect(`/agent/clients/${id}?error=save-client`);
    }

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("organisations")
      .update({ client_notifications_paused: paused })
      .eq("id", clientId);

    if (updateError) {
      console.error(updateError);
      redirect(`/agent/clients/${clientId}?error=save-client`);
    }

    redirect(`/agent/clients/${clientId}?silence=${paused ? "paused" : "active"}`);
  }

  async function openAssistanceModeAction(formData: FormData) {
    "use server";

    const clientId = String(formData.get("client_id") ?? "").trim();
    const dossierId = String(formData.get("dossier_id") ?? "").trim() || null;

    if (!clientId) {
      redirect(`/agent/clients/${id}?error=assistance`);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const result = await createAgentAssistanceToken({
      agentUserId: user?.id ?? null,
      agentEmail: user?.email ?? null,
      organisationId: clientId,
      dossierId,
      headersList: await headers(),
    });

    redirect(result.url);
  }

  async function reopenDossierAction(formData: FormData) {
    "use server";

    const clientId = String(formData.get("client_id") ?? "").trim();
    const dossierId = String(formData.get("dossier_id") ?? "").trim();

    if (!clientId || !dossierId) {
      redirect(`/agent/clients/${id}?error=reopen-dossier`);
    }

    const supabase = await createClient();
    const { error: reopenError } = await supabase
      .from("dossiers")
      .update({ status: "assignable" })
      .eq("id", dossierId)
      .eq("organisation_id", clientId)
      .eq("status", "archived");

    if (reopenError) {
      console.error(reopenError);
      redirect(`/agent/clients/${clientId}?error=reopen-dossier`);
    }

    redirect(`/agent/clients/${clientId}?reopened=1`);
  }

  async function archiveClientAction(formData: FormData) {
    "use server";

    const clientId = formData.get("client_id") as string;
    const confirmation = (formData.get("confirmation") as string)?.trim();

    if (confirmation !== "ARCHIVER") {
      throw new Error(
        "Confirmation invalide. Pour archiver ce client, écrivez ARCHIVER.",
      );
    }

    const supabase = await createClient();

    const { data: dossiers, error: dossiersError } = await supabase
      .from("dossiers")
      .select("id, status")
      .eq("organisation_id", clientId)
      .neq("status", "archived");

    if (dossiersError) {
      console.error(dossiersError);
      throw new Error("Impossible de vérifier les dossiers du client.");
    }

    if ((dossiers ?? []).length > 0) {
      throw new Error(
        "Impossible d’archiver ce client : il possède encore des dossiers actifs.",
      );
    }

    const { error: archiveError } = await supabase
      .from("organisations")
      .update({
        status: "archived",
        archived_at: new Date().toISOString(),
      })
      .eq("id", clientId);

    if (archiveError) {
      console.error(archiveError);
      throw new Error("Impossible d’archiver ce client.");
    }

    redirect("/agent/clients");
  }

  return (
    <main
      style={{
        padding: "24px 28px",
        maxWidth: 1120,
        margin: "0 auto",
        color: "var(--selen-text)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 9,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--selen-gold)",
              opacity: 0.8,
            }}
          >
            Fiche client
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--selen-text)",
              marginTop: 8,
              lineHeight: 1.2,
            }}
          >
            {typedClient.name}
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <SelenBadge variant="neutral" dot>
              {dossierCount} dossier{dossierCount > 1 ? "s" : ""} actif
              {dossierCount > 1 ? "s" : ""}
            </SelenBadge>

            {archivedDossierCount > 0 && (
              <SelenBadge variant="neutral" dot>
                {archivedDossierCount} archivé
                {archivedDossierCount > 1 ? "s" : ""}
              </SelenBadge>
            )}

            {typedClient.nda_number ? (
              <SelenBadge variant="type" dot>
                NDA : {typedClient.nda_number}
              </SelenBadge>
            ) : (
              <SelenBadge variant="warn" dot>
                Pas de NDA renseigné
              </SelenBadge>
            )}
          </div>
        </div>

        <Link
          href={`/agent/dossiers/new?client=${typedClient.id}`}
          style={{ textDecoration: "none" }}
        >
          <SelenButton variant="primary">+ Nouveau dossier</SelenButton>
        </Link>
        <form action={openAssistanceModeAction}>
          <input type="hidden" name="client_id" value={typedClient.id} />
          <SelenButton type="submit" variant="ghost">
            Ouvrir le Bureau Selen en mode assistance
          </SelenButton>
        </form>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1.6fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {query.saved === "1" ? (
          <div style={successStyle}>Modifications enregistrées</div>
        ) : null}
        {query.reopened === "1" ? (
          <div style={successStyle}>Dossier rouvert</div>
        ) : null}
        {query.silence === "paused" ? (
          <div style={successStyle}>
            Mode préparation silencieuse activé. Les emails automatiques
            destinés à ce client sont suspendus.
          </div>
        ) : null}
        {query.silence === "active" ? (
          <div style={successStyle}>
            Les emails client sont réactivés. Les prochains messages pourront
            être envoyés normalement.
          </div>
        ) : null}
        {query.error ? (
          <div style={errorStyle}>
            {query.error === "missing-client-fields"
              ? "Le nom de l’organisation est obligatoire."
              : "Erreur lors de l’enregistrement"}
          </div>
        ) : null}

        <SelenCard>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <SelenCardTitle>Informations client</SelenCardTitle>
            {!isEditing ? (
              <Link
                href={`/agent/clients/${typedClient.id}?edit=1`}
                style={{ textDecoration: "none" }}
              >
                <SelenButton variant="ghost">Modifier les informations</SelenButton>
              </Link>
            ) : null}
          </div>

          <div style={emailsPaused ? pausedNoticeStyle : activeNoticeStyle}>
            <strong>
              {emailsPaused ? "Emails client suspendus" : "Emails client actifs"}
            </strong>
            <p style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
              {emailsPaused
                ? "Mode préparation silencieuse activé. Les emails automatiques destinés à ce client sont suspendus. Vous pouvez préparer le dossier sans notifier le client."
                : "Les prochains messages client pourront être envoyés normalement."}
            </p>
            <form
              action={setClientNotificationsPausedAction}
              style={{ marginTop: 12 }}
            >
              <input type="hidden" name="client_id" value={typedClient.id} />
              <input
                type="hidden"
                name="paused"
                value={emailsPaused ? "false" : "true"}
              />
              <button type="submit" style={smallButtonStyle}>
                {emailsPaused
                  ? "Réactiver les emails client"
                  : "Bloquer temporairement les emails client"}
              </button>
            </form>
          </div>

          <div style={assistanceNoticeStyle}>
            <strong>Mode assistance agent</strong>
            <p style={{ margin: "6px 0 12px", lineHeight: 1.5 }}>
              Permet d’aider un client dans son Bureau Selen sans utiliser ses
              identifiants. Les actions réalisées sont tracées.
            </p>
            <form action={openAssistanceModeAction}>
              <input type="hidden" name="client_id" value={typedClient.id} />
              <button type="submit" style={smallButtonStyle}>
                Assister côté client
              </button>
            </form>
          </div>

          <ClientAccessManager
            initialEmail={typedClient.email}
            initialName={typedClient.name}
            organisationId={typedClient.id}
            clientNotificationsPaused={emailsPaused}
            embeddedMode
            title="Accès Bureau Selen"
          />

          {isEditing ? (
            <form action={updateClientAction} style={{ display: "grid", gap: 14 }}>
              <input type="hidden" name="client_id" value={typedClient.id} />
              <EditableField
                label="Nom affiché / organisation / organisme"
                name="name"
                defaultValue={typedClient.name}
                required
              />
              <EditableField
                label="Email de contact Studio"
                name="email"
                type="email"
                defaultValue={typedClient.email}
              />
              <p style={helpStyle}>
                Cet email est l’email de contact Studio. Il ne modifie pas
                l’email de connexion Bureau Selen / Supabase Auth.
              </p>
              <ReadOnlyInfo
                label="Email de connexion Bureau Selen"
                value="Géré dans Accès aux prestations / Supabase Auth"
              />
              <EditableField
                label="Téléphone"
                name="phone"
                defaultValue={typedClient.phone}
              />
              <EditableField
                label="SIRET"
                name="siret"
                defaultValue={typedClient.siret}
              />
              <EditableField
                label="N° NDA"
                name="nda_number"
                defaultValue={typedClient.nda_number}
              />
              <EditableField
                label="Adresse"
                name="address"
                defaultValue={typedClient.address}
                multiline
              />
              <p style={helpStyle}>
                Les champs prénom, nom du contact et notes internes ne sont pas
                stockés séparément dans cette fiche client pour le moment.
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href={`/agent/clients/${typedClient.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <SelenButton variant="ghost">Annuler</SelenButton>
                </Link>
                <SelenButton type="submit" variant="primary">
                  Enregistrer
                </SelenButton>
              </div>
            </form>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <ReadOnlyInfo
                label="Nom affiché / organisation / organisme"
                value={typedClient.name}
              />
              <ReadOnlyInfo
                label="Email de contact Studio"
                value={typedClient.email}
              />
              <ReadOnlyInfo
                label="Email de connexion Bureau Selen"
                value="Géré dans Accès aux prestations / Supabase Auth"
              />
              <ReadOnlyInfo label="Téléphone" value={typedClient.phone} />
              <ReadOnlyInfo label="SIRET" value={typedClient.siret} />
              <ReadOnlyInfo label="N° NDA" value={typedClient.nda_number} />
              <ReadOnlyInfo label="Adresse" value={typedClient.address} />
            </div>
          )}
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Dossiers du client</SelenCardTitle>

          {activeDossiers.length === 0 ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--selen-text3)",
              }}
            >
              Aucun dossier pour le moment.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {activeDossiers
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
                .map((dossier) => (
                  <Link
                    key={dossier.id}
                    href={`/agent/dossiers/${dossier.id}`}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.6fr 0.8fr 1fr 0.8fr",
                        gap: 12,
                        alignItems: "center",
                        padding: "14px 16px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--selen-bg3)",
                        border: "1px solid var(--selen-border)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--selen-text)",
                            marginBottom: 4,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {dossier.title}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--selen-text3)",
                          }}
                        >
                          Créé le{" "}
                          {new Date(dossier.created_at).toLocaleDateString(
                            "fr-FR",
                          )}
                        </div>
                      </div>

                      <div>
                        <SelenBadge
                          variant={getTypeBadgeVariant(dossier.type)}
                          dot
                        >
                          {getTypeLabel(dossier.type)}
                        </SelenBadge>
                      </div>

                      <div>
                        <SelenBadge
                          variant={getStatusBadgeVariant(dossier.status)}
                          dot
                        >
                          {getStatusLabel(dossier.status)}
                        </SelenBadge>
                      </div>

                      <div
                        style={{
                          textAlign: "right",
                          fontSize: 12,
                          color: "var(--selen-gold2)",
                        }}
                      >
                        Ouvrir →
                      </div>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </SelenCard>
      </div>
      {archivedDossiers.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <SelenCard>
            <SelenCardTitle>Dossiers archivés</SelenCardTitle>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {archivedDossiers
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime(),
                )
                .map((dossier) => (
                  <div
                    key={dossier.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.5fr 0.7fr 0.8fr 0.7fr 1fr",
                      gap: 12,
                      alignItems: "center",
                      padding: "14px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--selen-text)",
                          marginBottom: 4,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {dossier.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--selen-text3)" }}>
                        Créé le{" "}
                        {new Date(dossier.created_at).toLocaleDateString(
                          "fr-FR",
                        )}
                      </div>
                    </div>
                    <SelenBadge variant={getTypeBadgeVariant(dossier.type)} dot>
                      {getTypeLabel(dossier.type)}
                    </SelenBadge>
                    <SelenBadge
                      variant={getStatusBadgeVariant(dossier.status)}
                      dot
                    >
                      {getStatusLabel(dossier.status)}
                    </SelenBadge>
                    <Link
                      href={`/agent/dossiers/${dossier.id}`}
                      style={{
                        color: "var(--selen-gold2)",
                        fontSize: 12,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Consulter →
                    </Link>
                    <form action={openAssistanceModeAction}>
                      <input
                        type="hidden"
                        name="client_id"
                        value={typedClient.id}
                      />
                      <input
                        type="hidden"
                        name="dossier_id"
                        value={dossier.id}
                      />
                      <button type="submit" style={smallButtonStyle}>
                        Assister côté client
                      </button>
                    </form>
                    <form action={reopenDossierAction}>
                      <input
                        type="hidden"
                        name="client_id"
                        value={typedClient.id}
                      />
                      <input
                        type="hidden"
                        name="dossier_id"
                        value={dossier.id}
                      />
                      <button type="submit" style={smallButtonStyle}>
                        Rouvrir
                      </button>
                    </form>
                  </div>
                ))}
            </div>
          </SelenCard>
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <SelenCard>
          <SelenCardTitle>Zone danger</SelenCardTitle>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--selen-text2)",
              marginBottom: 12,
            }}
          >
            L’archivage retire ce client des listes actives, sans supprimer ses
            données historiques. Pour éviter les erreurs, un client ne peut être
            archivé que si tous ses dossiers sont déjà archivés.
          </p>

          {activeDossierCount > 0 ? (
            <div
              style={{
                border: "1px solid rgba(201, 122, 122, 0.35)",
                background: "rgba(201, 122, 122, 0.08)",
                borderRadius: "var(--radius-md)",
                padding: 14,
                color: "var(--selen-danger)",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Ce client ne peut pas être archivé pour le moment :{" "}
              {activeDossierCount} dossier
              {activeDossierCount > 1
                ? "s actifs sont encore ouverts"
                : " actif est encore ouvert"}
              . Archive d’abord les dossiers concernés.
            </div>
          ) : (
            <form
              action={archiveClientAction}
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              <input type="hidden" name="client_id" value={typedClient.id} />

              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--selen-text2)",
                }}
              >
                Pour confirmer, écris ARCHIVER
                <input
                  name="confirmation"
                  placeholder="ARCHIVER"
                  style={{
                    width: "100%",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  style={{
                    border: "1px solid rgba(201, 122, 122, 0.45)",
                    background: "rgba(201, 122, 122, 0.12)",
                    color: "var(--selen-danger)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Archiver ce client
                </button>
              </div>
            </form>
          )}
        </SelenCard>
      </div>
    </main>
  );
}

function EditableField({
  label,
  name,
  defaultValue,
  type = "text",
  required = false,
  multiline = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
  required?: boolean;
  multiline?: boolean;
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {multiline ? (
        <textarea
          name={name}
          defaultValue={defaultValue ?? ""}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue ?? ""}
          required={required}
          style={inputStyle}
        />
      )}
    </label>
  );
}

function ReadOnlyInfo({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div style={readOnlyFieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <span style={readOnlyValueStyle}>{value?.trim() || "Non renseigné"}</span>
    </div>
  );
}

const fieldStyle = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  color: "var(--selen-text2)",
};

const fieldLabelStyle = {
  fontSize: 10,
  color: "var(--selen-text3)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.1em",
};

const inputStyle = {
  width: "100%",
  background: "var(--selen-bg3)",
  border: "1px solid var(--selen-border)",
  borderRadius: "var(--radius-md)",
  padding: "10px 12px",
  color: "var(--selen-text)",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const helpStyle = {
  margin: "-4px 0 0",
  fontSize: 11,
  lineHeight: 1.45,
  color: "var(--selen-text3)",
};

const readOnlyFieldStyle = {
  display: "grid",
  gap: 5,
  padding: "10px 12px",
  border: "1px solid var(--selen-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--selen-bg3)",
};

const readOnlyValueStyle = {
  fontSize: 13,
  color: "var(--selen-text)",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap" as const,
};

const activeNoticeStyle = {
  border: "1px solid rgba(99, 179, 124, 0.35)",
  background: "rgba(99, 179, 124, 0.08)",
  borderRadius: "var(--radius-md)",
  padding: 12,
  color: "var(--selen-text)",
  fontSize: 13,
  marginBottom: 14,
};

const pausedNoticeStyle = {
  border: "1px solid rgba(214, 171, 91, 0.45)",
  background: "rgba(214, 171, 91, 0.12)",
  borderRadius: "var(--radius-md)",
  padding: 12,
  color: "var(--selen-text)",
  fontSize: 13,
  marginBottom: 14,
};

const assistanceNoticeStyle = {
  border: "1px solid rgba(128, 160, 190, 0.35)",
  background: "rgba(128, 160, 190, 0.08)",
  borderRadius: "var(--radius-md)",
  padding: 12,
  color: "var(--selen-text)",
  fontSize: 13,
  marginBottom: 14,
};

const successStyle = {
  border: "1px solid rgba(99, 179, 124, 0.35)",
  background: "rgba(99, 179, 124, 0.1)",
  borderRadius: "var(--radius-md)",
  padding: "10px 12px",
  color: "var(--selen-success)",
  fontSize: 13,
};

const errorStyle = {
  border: "1px solid rgba(201, 122, 122, 0.35)",
  background: "rgba(201, 122, 122, 0.1)",
  borderRadius: "var(--radius-md)",
  padding: "10px 12px",
  color: "var(--selen-danger)",
  fontSize: 13,
};

const smallButtonStyle = {
  border: "1px solid var(--selen-border)",
  background: "var(--selen-card)",
  color: "var(--selen-gold2)",
  borderRadius: "var(--radius-md)",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
