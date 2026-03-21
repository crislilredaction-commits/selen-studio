import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import DossierTimeline, {
  statusToStepIndex,
} from "@/components/ui/DossierTimeline";
import DocumentUpload from "@/components/ui/DocumentUpload";
import DocumentsList, {
  type DocumentItem,
} from "@/components/ui/DocumentsList";
import DossierHistorique, {
  type HistoryEntry,
} from "@/components/ui/DossierHistorique";
import NdaChecklist from "@/components/nda/NdaChecklist";
import { NDA_CHECKLIST } from "@/lib/ndaChecklist";
import SubmitButton from "@/components/ui/SubmitButton";
import NdaVariablesCard from "@/components/nda/NdaVariablesCard";
import OpenDocumentButton from "@/components/ui/OpenDocumentButton";
import DeleteDocumentButton from "@/components/ui/DeleteDocumentButton";
import AnalyzeNdaButton from "@/components/nda/AnalyzeNdaButton";
import AgentMessagingDrawer from "@/components/AgentMessagingDrawer";
import AnalyzeProgramButton from "@/components/program/AnalyzeProgramButton";
import AgentProgramEditor from "@/components/program/AgentProgramEditor";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type OrganisationRow = {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  siret?: string | null;
  nda_number?: string | null;
  address?: string | null;
};

type AgentProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type AssignmentRow = {
  id: string;
  is_primary: boolean;
  profiles: AgentProfile | AgentProfile[] | null;
};

type RelatedDossier = {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
};

type DbDocumentRow = {
  id: string;
  name: string;
  document_type: string;
  storage_path?: string | null;
  status:
    | "uploaded"
    | "validated"
    | "to_correct"
    | "generated"
    | "signed"
    | "archived";
  source: "agent_upload" | "client_upload" | "generated";
  created_at: string;
};

type MessageRow = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    nda: "NDA",
    review: "Review",
    prepa: "Prépa",
    daily: "Daily",
    non_conformite: "Non-conformité",
    audit_blanc: "Review",
    mise_en_conformite: "Prépa",
    audit_reel: "Prépa",
  };
  return map[type] ?? type;
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Brouillon",
    waiting_client: "En attente client",
    assignable: "À assigner",
    assigned: "Assigné",
    in_progress: "En cours",
    generated: "Généré",
    collecting_documents: "Collecte documents",
    under_review: "En vérification",
    to_complete: "À compléter",
    compliant: "Conforme",
    archived: "Archivé",
  };
  return map[status] ?? status;
}

function getStatusBadgeVariant(status: string) {
  if (status === "compliant" || status === "generated") return "success";
  if (status === "waiting_client" || status === "to_complete") return "warn";
  if (status === "in_progress" || status === "collecting_documents")
    return "info";
  if (status === "archived") return "neutral";
  return "status";
}

function mapDbDocumentToItem(doc: DbDocumentRow): DocumentItem {
  let fileType: "pdf" | "doc" | "other" = "other";

  const lower = doc.name.toLowerCase();
  if (lower.endsWith(".pdf")) fileType = "pdf";
  else if (
    lower.endsWith(".doc") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".pages")
  ) {
    fileType = "doc";
  }

  let status: "ok" | "pending" | "missing" = "pending";

  if (
    doc.status === "uploaded" ||
    doc.status === "validated" ||
    doc.status === "signed" ||
    doc.status === "generated"
  ) {
    status = "ok";
  } else if (doc.status === "to_correct") {
    status = "pending";
  } else if (doc.status === "archived") {
    status = "missing";
  }

  return {
    id: doc.id,
    name: doc.name,
    meta: `${doc.document_type} · ${new Date(doc.created_at).toLocaleDateString("fr-FR")}`,
    fileType,
    status,
  };
}

function extractPostalCodeAndCity(address?: string | null) {
  if (!address) {
    return { code_postal: "", ville: "" };
  }

  const match = address.match(/\b(\d{5})\b\s*-?\s*([A-Za-zÀ-ÿ' -]+)$/);

  if (!match) {
    return { code_postal: "", ville: "" };
  }

  return {
    code_postal: match[1] ?? "",
    ville: match[2]?.trim() ?? "",
  };
}

function getRegionFromPostalCode(codePostal?: string | null) {
  if (!codePostal || codePostal.length < 2) return "";

  const dept = codePostal.slice(0, 2);

  const regionMap: Record<string, string> = {
    "01": "Auvergne-Rhône-Alpes",
    "02": "Hauts-de-France",
    "03": "Auvergne-Rhône-Alpes",
    "04": "Provence-Alpes-Côte d’Azur",
    "05": "Provence-Alpes-Côte d’Azur",
    "06": "Provence-Alpes-Côte d’Azur",
    "07": "Auvergne-Rhône-Alpes",
    "08": "Grand Est",
    "09": "Occitanie",
    "10": "Grand Est",
    "11": "Occitanie",
    "12": "Occitanie",
    "13": "Provence-Alpes-Côte d’Azur",
    "14": "Normandie",
    "15": "Auvergne-Rhône-Alpes",
    "16": "Nouvelle-Aquitaine",
    "17": "Nouvelle-Aquitaine",
    "18": "Centre-Val de Loire",
    "19": "Nouvelle-Aquitaine",
    "21": "Bourgogne-Franche-Comté",
    "22": "Bretagne",
    "23": "Nouvelle-Aquitaine",
    "24": "Nouvelle-Aquitaine",
    "25": "Bourgogne-Franche-Comté",
    "26": "Auvergne-Rhône-Alpes",
    "27": "Normandie",
    "28": "Centre-Val de Loire",
    "29": "Bretagne",
    "30": "Occitanie",
    "31": "Occitanie",
    "32": "Occitanie",
    "33": "Nouvelle-Aquitaine",
    "34": "Occitanie",
    "35": "Bretagne",
    "36": "Centre-Val de Loire",
    "37": "Centre-Val de Loire",
    "38": "Auvergne-Rhône-Alpes",
    "39": "Bourgogne-Franche-Comté",
    "40": "Nouvelle-Aquitaine",
    "41": "Centre-Val de Loire",
    "42": "Auvergne-Rhône-Alpes",
    "43": "Auvergne-Rhône-Alpes",
    "44": "Pays de la Loire",
    "45": "Centre-Val de Loire",
    "46": "Occitanie",
    "47": "Nouvelle-Aquitaine",
    "48": "Occitanie",
    "49": "Pays de la Loire",
    "50": "Normandie",
    "51": "Grand Est",
    "52": "Grand Est",
    "53": "Pays de la Loire",
    "54": "Grand Est",
    "55": "Grand Est",
    "56": "Bretagne",
    "57": "Grand Est",
    "58": "Bourgogne-Franche-Comté",
    "59": "Hauts-de-France",
    "60": "Hauts-de-France",
    "61": "Normandie",
    "62": "Hauts-de-France",
    "63": "Auvergne-Rhône-Alpes",
    "64": "Nouvelle-Aquitaine",
    "65": "Occitanie",
    "66": "Occitanie",
    "67": "Grand Est",
    "68": "Grand Est",
    "69": "Auvergne-Rhône-Alpes",
    "70": "Bourgogne-Franche-Comté",
    "71": "Bourgogne-Franche-Comté",
    "72": "Pays de la Loire",
    "73": "Auvergne-Rhône-Alpes",
    "74": "Auvergne-Rhône-Alpes",
    "75": "Île-de-France",
    "76": "Normandie",
    "77": "Île-de-France",
    "78": "Île-de-France",
    "79": "Nouvelle-Aquitaine",
    "80": "Hauts-de-France",
    "81": "Occitanie",
    "82": "Occitanie",
    "83": "Provence-Alpes-Côte d’Azur",
    "84": "Provence-Alpes-Côte d’Azur",
    "85": "Pays de la Loire",
    "86": "Nouvelle-Aquitaine",
    "87": "Nouvelle-Aquitaine",
    "88": "Grand Est",
    "89": "Bourgogne-Franche-Comté",
    "90": "Bourgogne-Franche-Comté",
    "91": "Île-de-France",
    "92": "Île-de-France",
    "93": "Île-de-France",
    "94": "Île-de-France",
    "95": "Île-de-France",
  };

  return regionMap[dept] ?? "";
}

const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: "h1",
    action: "Dossier ouvert",
    author: "Agent",
    date: "01/03",
    variant: "gold",
  },
  {
    id: "h2",
    action: "Programme et CV reçus",
    author: "Upload client",
    date: "03/03",
    variant: "blue",
  },
  {
    id: "h3",
    action: "Relance envoyée au client",
    author: "Agent",
    date: "08/03",
    variant: "blue",
  },
  {
    id: "h4",
    action: "Statut → Collecte documents",
    author: "Agent",
    date: "10/03",
    variant: "gold",
  },
];

export default async function DossierPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const clientUrl = `${process.env.NEXT_PUBLIC_APP_URL}/client/dossier/${id}`;

  async function updateStatus(formData: FormData) {
    "use server";

    const dossierId = formData.get("dossier_id") as string;
    const status = formData.get("status") as string;
    const supabase = await createClient();

    const { error } = await supabase
      .from("dossiers")
      .update({ status })
      .eq("id", dossierId);

    if (error) {
      console.error(error);
      throw new Error("Impossible de mettre à jour le statut du dossier.");
    }

    redirect(`/agent/dossiers/${dossierId}`);
  }

  async function updateAssignment(formData: FormData) {
    "use server";

    const dossierId = formData.get("dossier_id") as string;
    const agentId = formData.get("agent_id") as string;
    const supabase = await createClient();

    const { data: existingAssignments, error: existingError } = await supabase
      .from("dossier_assignments")
      .select("id")
      .eq("dossier_id", dossierId);

    if (existingError) {
      console.error(existingError);
      throw new Error("Impossible de charger les assignations actuelles.");
    }

    if (existingAssignments?.length) {
      const existingIds = existingAssignments.map((item) => item.id);

      const { error: deleteError } = await supabase
        .from("dossier_assignments")
        .delete()
        .in("id", existingIds);

      if (deleteError) {
        console.error(deleteError);
        throw new Error("Impossible de réinitialiser l’assignation.");
      }
    }

    if (agentId) {
      const { error: insertError } = await supabase
        .from("dossier_assignments")
        .insert({
          dossier_id: dossierId,
          agent_id: agentId,
          is_primary: true,
        });

      if (insertError) {
        console.error(insertError);
        throw new Error("Impossible d’assigner cet agent.");
      }

      const { error: statusError } = await supabase
        .from("dossiers")
        .update({ status: "assigned" })
        .eq("id", dossierId);

      if (statusError) {
        console.error(statusError);
        throw new Error(
          "Impossible de mettre à jour le statut après assignation.",
        );
      }
    } else {
      const { error: statusError } = await supabase
        .from("dossiers")
        .update({ status: "assignable" })
        .eq("id", dossierId);

      if (statusError) {
        console.error(statusError);
        throw new Error("Impossible de remettre le dossier à assigner.");
      }
    }

    redirect(`/agent/dossiers/${dossierId}`);
  }

  async function updateDocumentType(formData: FormData) {
    "use server";

    const docId = formData.get("doc_id") as string;
    const documentType = formData.get("document_type") as string;
    const dossierId = formData.get("dossier_id") as string;

    const supabase = await createClient();

    const { error } = await supabase
      .from("documents")
      .update({ document_type: documentType })
      .eq("id", docId);

    if (error) {
      console.error(error);
      throw new Error("Impossible de modifier le type du document.");
    }

    redirect(`/agent/dossiers/${dossierId}`);
  }

  const { data: dossier, error } = await supabase
    .from("dossiers")
    .select(
      `
        id,
        title,
        type,
        status,
        created_at,
        updated_at,
        organisation_id,
        organisations:organisation_id (
          id,
          name,
          email,
          phone,
          siret,
          nda_number,
          address
        ),
        dossier_assignments (
          id,
          is_primary,
          profiles:agent_id (
            id,
            full_name,
            email
          )
        )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(error, null, 2)}</pre>
      </main>
    );
  }

  if (!dossier) {
    return (
      <main className="p-10" style={{ color: "var(--selen-text)" }}>
        Dossier introuvable.
      </main>
    );
  }

  const { data: dossierMessages, error: dossierMessagesError } = await supabase
    .from("messages")
    .select("id, content, sender_type, created_at")
    .eq("dossier_id", dossier.id)
    .order("created_at", { ascending: true });

  if (dossierMessagesError) {
    console.error(dossierMessagesError);
  }

  const { data: clientDocuments } = await supabase
    .from("documents")
    .select("*")
    .eq("organisation_id", dossier?.organisation_id)
    .is("dossier_id", null)
    .order("created_at", { ascending: false });

  const { data: agents, error: agentsError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("app_role", ["agent", "admin"])
    .order("full_name");

  if (agentsError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(agentsError, null, 2)}</pre>
      </main>
    );
  }

  const organisationRaw = Array.isArray(dossier.organisations)
    ? dossier.organisations[0]
    : dossier.organisations;

  const organisation = (organisationRaw ?? null) as OrganisationRow | null;

  const { data: relatedDossiers } = organisation
    ? await supabase
        .from("dossiers")
        .select("id, title, type, status, created_at")
        .eq("organisation_id", dossier.organisation_id)
        .neq("id", dossier.id)
        .order("created_at", { ascending: false })
    : { data: [] as RelatedDossier[] };

  const { data: documentsData, error: documentsError } = await supabase
    .from("documents")
    .select("id, name, document_type, status, source, created_at, storage_path")
    .eq("dossier_id", dossier.id)
    .order("created_at", { ascending: true });

  const { data: ndaVariablesData, error: ndaVariablesError } = await supabase
    .from("nda_variables")
    .select("*")
    .eq("dossier_id", dossier.id)
    .maybeSingle();

  if (ndaVariablesError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(ndaVariablesError, null, 2)}</pre>
      </main>
    );
  }

  const { data: latestProgramAnalysis, error: latestProgramAnalysisError } =
    await supabase
      .from("program_ai_analyses")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestProgramAnalysisError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestProgramAnalysisError, null, 2)}</pre>
      </main>
    );
  }

  const { data: latestProgramVersion, error: latestProgramVersionError } =
    await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossier.id)
      .eq("version_type", "agent_draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestProgramVersionError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestProgramVersionError, null, 2)}</pre>
      </main>
    );
  }

  const receivedKeys = [
    ...(documentsData ?? []).map((d) => d.document_type),
    ...((clientDocuments ?? []) as DbDocumentRow[]).map((d) => d.document_type),
  ].filter(Boolean);

  const canRunAutoAnalysis =
    receivedKeys.includes("cv_formateur") &&
    receivedKeys.includes("programme_formation") &&
    (receivedKeys.includes("avis_insee") || receivedKeys.includes("kbis"));

  if (documentsError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(documentsError, null, 2)}</pre>
      </main>
    );
  }

  const documents = ((documentsData ?? []) as DbDocumentRow[]).map(
    mapDbDocumentToItem,
  );
  const clientDocumentsItems = ((clientDocuments ?? []) as DbDocumentRow[]).map(
    mapDbDocumentToItem,
  );

  const primaryAssignment =
    dossier.dossier_assignments?.find((a: AssignmentRow) => a.is_primary) ??
    dossier.dossier_assignments?.[0] ??
    null;

  const assignedProfile = primaryAssignment?.profiles;
  const assignedAgent = Array.isArray(assignedProfile)
    ? assignedProfile[0]
    : assignedProfile;

  const currentStep = statusToStepIndex(dossier.status);

  const uniqueReceivedKeys = Array.from(new Set(receivedKeys));
  const docsReceived = NDA_CHECKLIST.filter((item) =>
    uniqueReceivedKeys.includes(item.key),
  ).length;
  const docsTotal = NDA_CHECKLIST.length;

  const extractedAddress = extractPostalCodeAndCity(organisation?.address);

  const ndaVariablesInitialValues = {
    ...ndaVariablesData,
    siret: ndaVariablesData?.siret ?? organisation?.siret ?? "",
    code_postal:
      ndaVariablesData?.code_postal ?? extractedAddress.code_postal ?? "",
    ville: ndaVariablesData?.ville ?? extractedAddress.ville ?? "",
    region:
      ndaVariablesData?.region ??
      getRegionFromPostalCode(
        ndaVariablesData?.code_postal ?? extractedAddress.code_postal,
      ) ??
      "",
  };

  const { data: unreadMessages } = await supabase
    .from("messages")
    .select("id")
    .eq("dossier_id", dossier.id)
    .eq("sender_type", "client")
    .is("read_by_agent_at", null);

  const hasUnread = (unreadMessages ?? []).length > 0;
  const unreadCount = (unreadMessages ?? []).length;

  return (
    <main
      style={{
        padding: 0,
        background: "var(--selen-bg)",
        minHeight: "100vh",
        color: "var(--selen-text)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 28px",
          borderBottom: "1px solid var(--selen-border)",
          background: "var(--selen-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--selen-text3)",
          }}
        >
          <Link
            href="/agent/dossiers"
            style={{ color: "var(--selen-text3)", textDecoration: "none" }}
          >
            Dossiers
          </Link>
          <span style={{ opacity: 0.4 }}>›</span>
          {organisation?.id ? (
            <>
              <Link
                href={`/agent/clients/${organisation.id}`}
                style={{ color: "var(--selen-text3)", textDecoration: "none" }}
              >
                {organisation.name ?? "Client"}
              </Link>
              <span style={{ opacity: 0.4 }}>›</span>
            </>
          ) : null}
          <span style={{ color: "var(--selen-text2)" }}>
            {getTypeLabel(dossier.type)} · {dossier.title}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <SelenButton variant="ghost" size="sm">
            Ajouter un document
          </SelenButton>
          <SelenButton variant="primary" size="sm">
            Générer le {getTypeLabel(dossier.type)}
          </SelenButton>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
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
            Fiche dossier
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--selen-text)",
              marginTop: 8,
              lineHeight: 1.2,
            }}
          >
            {dossier.title}
          </h1>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <SelenBadge variant="type" dot>
              {getTypeLabel(dossier.type)}
            </SelenBadge>

            <SelenBadge variant={getStatusBadgeVariant(dossier.status)} dot>
              {getStatusLabel(dossier.status)}
            </SelenBadge>

            {organisation?.name ? (
              <span style={{ fontSize: 13, color: "var(--selen-text2)" }}>
                {organisation.name}
              </span>
            ) : null}
          </div>
        </div>

        {relatedDossiers && relatedDossiers.length > 0 ? (
          <SelenCard style={{ marginBottom: 16 }}>
            <SelenCardTitle>Autres dossiers du client</SelenCardTitle>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {relatedDossiers.map((related) => (
                <Link
                  key={related.id}
                  href={`/agent/dossiers/${related.id}`}
                  style={{
                    display: "block",
                    minWidth: 220,
                    textDecoration: "none",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                    color: "var(--selen-text)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 6,
                    }}
                  >
                    {related.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--selen-text3)",
                    }}
                  >
                    {getTypeLabel(related.type)} ·{" "}
                    {getStatusLabel(related.status)}
                  </div>
                </Link>
              ))}
            </div>
          </SelenCard>
        ) : null}

        <DossierTimeline currentStep={currentStep} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SelenCard>
              <SelenCardTitle>Documents attendus</SelenCardTitle>

              <NdaChecklist receivedKeys={receivedKeys} />

              {documentsData?.map((doc) => (
                <form
                  key={doc.id}
                  action={updateDocumentType}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--selen-border)",
                  }}
                >
                  <input type="hidden" name="doc_id" value={doc.id} />
                  <input type="hidden" name="dossier_id" value={dossier.id} />

                  <div style={{ flex: 1, fontSize: 12 }}>{doc.name}</div>

                  <select
                    name="document_type"
                    defaultValue={doc.document_type}
                    style={{
                      fontSize: 11,
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: 6,
                      padding: "4px 6px",
                      color: "var(--selen-text)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    <option value="document_libre">Libre</option>
                    <option value="cv_formateur">CV formateur</option>
                    <option value="programme_formation">Programme</option>
                    <option value="avis_insee">Avis INSEE</option>
                    <option value="diplome_formateur">Diplôme</option>
                    <option value="kbis">KBis</option>
                    <option value="casier_judiciaire">Casier judiciaire</option>
                    <option value="convention_signee">Convention signée</option>
                  </select>

                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <SubmitButton label="OK" pendingLabel="..." />
                    <DeleteDocumentButton
                      documentId={doc.id}
                      documentName={doc.name}
                    />
                  </div>
                </form>
              ))}
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Documents client</SelenCardTitle>
              <DocumentUpload
                dossierId={dossier.id}
                organisationId={organisation?.id}
              />
              {clientDocuments?.length ? (
                clientDocuments.map((doc) => (
                  <form
                    key={doc.id}
                    action={updateDocumentType}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--selen-border)",
                    }}
                  >
                    <input type="hidden" name="doc_id" value={doc.id} />
                    <input type="hidden" name="dossier_id" value={dossier.id} />

                    <OpenDocumentButton docId={doc.id} />

                    <div
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: "var(--selen-text)",
                      }}
                    >
                      {doc.name}
                    </div>

                    <select
                      name="document_type"
                      defaultValue={doc.document_type}
                      style={{
                        fontSize: 11,
                        background: "var(--selen-bg3)",
                        border: "1px solid var(--selen-border)",
                        borderRadius: 6,
                        padding: "4px 6px",
                        color: "var(--selen-text)",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      <option value="document_libre">Libre</option>
                      <option value="cv_formateur">CV formateur</option>
                      <option value="programme_formation">Programme</option>
                      <option value="avis_insee">Avis INSEE</option>
                      <option value="diplome_formateur">Diplôme</option>
                      <option value="questionnaire_nda">
                        Questionnaire NDA
                      </option>
                      <option value="kbis">KBis</option>
                      <option value="casier_judiciaire">
                        Casier judiciaire
                      </option>
                      <option value="convention_signee">
                        Convention signée
                      </option>
                      <option value="liste_formateurs_signee">
                        Liste des formateurs signée
                      </option>
                    </select>

                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <SubmitButton label="OK" pendingLabel="..." />
                      <DeleteDocumentButton
                        documentId={doc.id}
                        documentName={doc.name}
                      />
                    </div>
                  </form>
                ))
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--selen-text3)",
                    padding: "6px 2px 2px",
                  }}
                >
                  Aucun document client pour le moment.
                </div>
              )}
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Changer le statut</SelenCardTitle>
              <form action={updateStatus} style={{ display: "flex", gap: 10 }}>
                <input type="hidden" name="dossier_id" value={dossier.id} />
                <select
                  name="status"
                  defaultValue={dossier.status}
                  style={{
                    flex: 1,
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                >
                  <option value="draft">Brouillon</option>
                  <option value="waiting_client">En attente client</option>
                  <option value="assignable">À assigner</option>
                  <option value="assigned">Assigné</option>
                  <option value="in_progress">En cours</option>
                  <option value="collecting_documents">
                    Collecte documents
                  </option>
                  <option value="under_review">En vérification</option>
                  <option value="to_complete">À compléter</option>
                  <option value="generated">Généré</option>
                  <option value="compliant">Conforme</option>
                  <option value="archived">Archivé</option>
                </select>

                <SubmitButton
                  label="Enregistrer"
                  pendingLabel="Enregistrement..."
                />
              </form>
            </SelenCard>

            <AgentMessagingDrawer
              dossierId={dossier.id}
              initialMessages={(dossierMessages ?? []) as MessageRow[]}
              hasUnread={hasUnread}
              unreadCount={unreadCount}
            />

            <AnalyzeProgramButton
              dossierId={dossier.id}
              initialAnalysis={latestProgramAnalysis}
            />

            <AgentProgramEditor
              dossierId={dossier.id}
              initialAnalysis={latestProgramAnalysis}
              initialVersion={latestProgramVersion}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SelenCard>
              <SelenCardTitle>Agent assigné</SelenCardTitle>

              {assignedAgent ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#0f0c08",
                      flexShrink: 0,
                    }}
                  >
                    {(assignedAgent.full_name ?? assignedAgent.email ?? "?")
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--selen-text)",
                      }}
                    >
                      {assignedAgent.full_name ?? assignedAgent.email}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--selen-text3)",
                        marginTop: 1,
                      }}
                    >
                      Agent Qualiopi
                    </div>
                  </div>
                </div>
              ) : (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text3)",
                    marginBottom: 12,
                  }}
                >
                  Aucun agent assigné
                </p>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {[
                  { val: `${docsReceived}/${docsTotal}`, label: "Docs reçus" },
                  { val: "5j", label: "Délai moyen" },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--font-display)",
                        fontSize: 20,
                        fontWeight: 600,
                        color: "var(--selen-gold2)",
                      }}
                    >
                      {s.val}
                    </span>
                    <div
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--selen-text3)",
                        marginTop: 2,
                      }}
                    >
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: "var(--selen-text3)" }}>
                Créé le{" "}
                {new Date(dossier.created_at).toLocaleDateString("fr-FR")} · Mis
                à jour le{" "}
                {new Date(dossier.updated_at).toLocaleDateString("fr-FR")}
              </div>
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Assigner un agent</SelenCardTitle>
              <form
                action={updateAssignment}
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="dossier_id" value={dossier.id} />
                <select
                  name="agent_id"
                  defaultValue={assignedAgent?.id ?? ""}
                  style={{
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                >
                  <option value="">Aucun agent</option>
                  {agents?.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.full_name ?? agent.email}
                    </option>
                  ))}
                </select>

                <SubmitButton
                  label="Enregistrer l’assignation"
                  pendingLabel="Enregistrement..."
                />
              </form>
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Lien client</SelenCardTitle>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Envoyez ce lien au client pour qu’il puisse compléter ses
                  informations essentielles et déposer ses documents.
                </p>

                <input
                  value={clientUrl}
                  readOnly
                  style={{
                    width: "100%",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 10px",
                    color: "var(--selen-text)",
                    fontSize: 12,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                  }}
                />
              </div>
            </SelenCard>

            <NdaVariablesCard
              dossierId={dossier.id}
              initialValues={ndaVariablesInitialValues}
            />
            {canRunAutoAnalysis && <AnalyzeNdaButton dossierId={dossier.id} />}

            <SelenCard>
              <SelenCardTitle>Historique</SelenCardTitle>
              <DossierHistorique entries={MOCK_HISTORY} />
            </SelenCard>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "20px 0 16px",
            opacity: 0.35,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background:
                "linear-gradient(to right, transparent, var(--selen-gold))",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              transform: "rotate(45deg)",
              background: "var(--selen-gold)",
            }}
          />
          <div
            style={{
              flex: 1,
              height: 1,
              background:
                "linear-gradient(to left, transparent, var(--selen-gold))",
            }}
          />
        </div>

        <SelenCard>
          <SelenCardTitle>Organisation cliente</SelenCardTitle>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
            }}
          >
            {[
              { label: "Nom", value: organisation?.name },
              { label: "SIRET", value: organisation?.siret },
              {
                label: "N° NDA",
                value: organisation?.nda_number,
                accent: true,
              },
              { label: "Email", value: organisation?.email, info: true },
              { label: "Téléphone", value: organisation?.phone },
              { label: "Adresse", value: organisation?.address },
            ].map((field) => (
              <div key={field.label}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--selen-text3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 4,
                  }}
                >
                  {field.label}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    color: field.accent
                      ? "var(--selen-gold2)"
                      : field.info
                        ? "var(--selen-info)"
                        : "var(--selen-text)",
                    fontWeight: field.accent ? 500 : 400,
                  }}
                >
                  {field.value ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </SelenCard>
      </div>
    </main>
  );
}
