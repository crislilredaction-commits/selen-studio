import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
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
import { NDA_REQUIRED_DOCUMENT_KEYS } from "@/lib/ndaChecklist";
import SubmitButton from "@/components/ui/SubmitButton";
import NdaVariablesCard from "@/components/nda/NdaVariablesCard";
import OpenDocumentButton from "@/components/ui/OpenDocumentButton";
import DeleteDocumentButton from "@/components/ui/DeleteDocumentButton";
import AnalyzeNdaButton from "@/components/nda/AnalyzeNdaButton";
import AgentMessagingDrawer from "@/components/AgentMessagingDrawer";
import AnalyzeProgramButton from "@/components/program/AnalyzeProgramButton";
import AgentProgramEditor from "@/components/program/AgentProgramEditor";
import { getVitrineClientUrl } from "@/lib/vitrineLinks";
import {
  inferNdaDocumentReviewStatus,
  inferNdaDocumentRole,
  normalizeNdaDocumentType,
  type NdaDocumentReviewStatus,
  type NdaDocumentRole,
} from "@/lib/ndaDocumentTypes";

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
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role: "agent" | "admin" | string | null;
};

type AssignmentRow = {
  id: string;
  agent_id: string | null;
  is_primary: boolean;
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
  is_visible_to_client?: boolean | null;
  document_role?: NdaDocumentRole | string | null;
  review_status?: NdaDocumentReviewStatus | string | null;
  generated_from_model?: string | null;
  version_group?: string | null;
  parent_document_id?: string | null;
  requires_client_action?: boolean | null;
  validated_at?: string | null;
  validated_by?: string | null;
  visible_to_client_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type MessageRow = {
  id: string;
  content: string;
  sender_type: "agent" | "client";
  created_at: string;
};

type PreauditSessionSummary = {
  id: string;
  user_id: string;
  status: string | null;
  audit_type: string | null;
  is_new_entrant: boolean | null;
  applicable_indicators: number[] | null;
  excluded_indicators: number[] | null;
  created_at: string;
  updated_at: string | null;
};

type ReviewCaseSummary = {
  id: string;
  status: string | null;
  report_status: string | null;
  client_email: string | null;
  updated_at: string | null;
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
    preaudit: "Préaudit",
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

function isPreauditDossierType(type: string) {
  return type === "preaudit";
}

function isReviewDossierType(type: string) {
  return type === "review" || type === "audit_blanc";
}

function formatReviewStatus(status?: string | null, reportStatus?: string | null) {
  if (reportStatus === "sent") return "Rapport envoyé";
  if (status === "report_ready") return "Rapport prêt";
  if (status) return getStatusLabel(status);
  return "—";
}

function formatReviewReportStatus(status?: string | null) {
  if (status === "not_started") return "Non commencé";
  if (status === "draft") return "Brouillon";
  if (status === "ready") return "Rapport prêt";
  if (status === "sent") return "Envoyé au client";
  return status ?? "—";
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

function getDocumentRoleLabel(role: NdaDocumentRole) {
  const labels: Record<NdaDocumentRole, string> = {
    initial_client_document: "Document initial client",
    agent_uploaded_document: "Document agent",
    generated_document: "Document généré",
    client_to_complete: "À compléter par le client",
    client_returned_document: "Retour client",
    supporting_evidence: "Pièce justificative",
    internal_working_file: "Interne agent",
    final_validated_file: "Dossier final validé",
    maf_procedure: "Procédure MAF",
    dreets_complement_request: "Demande complémentaire DREETS",
    dreets_refusal_letter: "Lettre de refus DREETS",
    corrected_after_refusal: "Dossier corrigé après refus",
  };

  return labels[role];
}

function getDocumentReviewStatusLabel(status: NdaDocumentReviewStatus) {
  const labels: Record<NdaDocumentReviewStatus, string> = {
    not_reviewed: "À vérifier",
    pending_client: "En attente client",
    received: "Reçu",
    to_correct: "À corriger",
    validated: "Validé",
    rejected: "Refusé",
    archived: "Archivé",
    superseded: "Remplacé",
  };

  return labels[status];
}

function getDocumentWorkflowMeta(doc: DbDocumentRow) {
  const role = inferNdaDocumentRole({
    documentRole: doc.document_role,
    source: doc.source,
  });
  const reviewStatus = inferNdaDocumentReviewStatus({
    reviewStatus: doc.review_status,
    status: doc.status,
    source: doc.source,
  });
  const visibility = doc.is_visible_to_client
    ? "visible client"
    : "interne Studio";

  return `${getDocumentRoleLabel(role)} · ${getDocumentReviewStatusLabel(
    reviewStatus,
  )} · ${visibility}`;
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

function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase admin manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function findAuthUserIdByEmail(email: string) {
  const admin = getSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();

  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(
        `Impossible de retrouver le compte client Supabase Auth. ${error.message}`,
      );
    }

    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );

    if (found?.id) {
      return found.id;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

async function getLatestPreauditSessionByEmail(email?: string | null) {
  if (!email) return null;

  const userId = await findAuthUserIdByEmail(email);

  if (!userId) return null;

  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from("preaudit_sessions")
    .select(
      "id, user_id, status, audit_type, is_new_entrant, applicable_indicators, excluded_indicators, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de charger la session préaudit du client. ${error.message}`,
    );
  }

  return data as PreauditSessionSummary | null;
}

async function getPreauditIndicatorAnswerCount(
  session: PreauditSessionSummary,
) {
  const applicableIndicators = session.applicable_indicators ?? [];

  if (!applicableIndicators.length) return 0;

  const admin = getSupabaseAdminClient();

  const counts = await Promise.all(
    applicableIndicators.map(async (indicatorNumber) => {
      try {
        const { data, error } = await admin.rpc(
          "get_preaudit_indicator_answers",
          {
            p_session_id: session.id,
            p_indicator_number: indicatorNumber,
          },
        );

        if (error) {
          console.error(error);
          return 0;
        }

        return Array.isArray(data) ? data.length : 0;
      } catch (error) {
        console.error(error);
        return 0;
      }
    }),
  );

  return counts.reduce((total, count) => total + count, 0);
}

export default async function DossierPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

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
    const documentType = normalizeNdaDocumentType(
      formData.get("document_type") as string,
    );
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

  async function archiveDossier(formData: FormData) {
    "use server";

    const dossierId = formData.get("dossier_id") as string;
    const confirmation = (formData.get("confirmation") as string)?.trim();

    if (confirmation !== "ARCHIVER") {
      throw new Error(
        "Confirmation incorrecte. Pour archiver ce dossier, saisissez ARCHIVER.",
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("dossiers")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", dossierId);

    if (error) {
      console.error(error);
      throw new Error("Impossible d’archiver ce dossier.");
    }

    redirect("/agent/dossiers");
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

  const isNdaDossier = dossier.type === "nda";
  const isPreauditDossier = isPreauditDossierType(dossier.type);
  const isReviewDossier = isReviewDossierType(dossier.type);
  const resolvedClientUrl = getVitrineClientUrl(dossier.type, dossier.id);

  const { data: assignments, error: assignmentsError } = await supabase
    .from("dossier_assignments")
    .select("id, agent_id, is_primary")
    .eq("dossier_id", dossier.id);

  if (assignmentsError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(assignmentsError, null, 2)}</pre>
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
    .from("agent_profiles")
    .select("id, email, first_name, last_name, role")
    .eq("is_active", true)
    .in("role", ["agent", "admin"])
    .order("first_name", { ascending: true });

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

  const preauditSession =
    dossier.type === "preaudit"
      ? await getLatestPreauditSessionByEmail(organisation?.email)
      : null;

  const preauditApplicableCount =
    preauditSession?.applicable_indicators?.length ?? 0;

  const preauditExcludedCount =
    preauditSession?.excluded_indicators?.length ?? 0;

  const preauditIndicatorAnswerCount = preauditSession
    ? await getPreauditIndicatorAnswerCount(preauditSession)
    : 0;

  const { data: reviewCaseRaw } =
    isReviewDossier
      ? await supabase
          .from("audit_blanc_cases")
          .select("id, status, report_status, client_email, updated_at")
          .eq("dossier_id", dossier.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  const reviewCase = reviewCaseRaw as ReviewCaseSummary | null;
  const showGenericGenerateButton = !["preaudit", "review", "audit_blanc"].includes(
    dossier.type,
  );

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
    .select(
      "id, name, document_type, status, source, created_at, storage_path, is_visible_to_client, document_role, review_status, generated_from_model, version_group, parent_document_id, requires_client_action, validated_at, validated_by, visible_to_client_at, metadata",
    )
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

  const { data: latestClientDecision, error: latestClientDecisionError } =
    await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossier.id)
      .eq("version_type", "client_sent")
      .not("client_decision", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (latestClientDecisionError) {
    return (
      <main className="p-10" style={{ color: "var(--selen-danger)" }}>
        <pre>{JSON.stringify(latestClientDecisionError, null, 2)}</pre>
      </main>
    );
  }

  const receivedKeys = [
    ...(documentsData ?? []).map((d) => d.document_type),
    ...((clientDocuments ?? []) as DbDocumentRow[]).map((d) => d.document_type),
  ]
    .filter(Boolean)
    .map((documentType) => normalizeNdaDocumentType(documentType));

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
  const relatedActiveDossiers = ((relatedDossiers ?? []) as RelatedDossier[])
    .filter((related) => related.status !== "archived")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const relatedArchivedDossiers = ((relatedDossiers ?? []) as RelatedDossier[])
    .filter((related) => related.status === "archived")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const allNdaDocuments = [
    ...((documentsData ?? []) as DbDocumentRow[]),
    ...((clientDocuments ?? []) as DbDocumentRow[]),
  ];
  const initialClientDocuments = allNdaDocuments.filter(
    (doc) =>
      inferNdaDocumentRole({
        documentRole: doc.document_role,
        source: doc.source,
      }) === "initial_client_document",
  );
  const agentDocuments = allNdaDocuments.filter(
    (doc) =>
      inferNdaDocumentRole({
        documentRole: doc.document_role,
        source: doc.source,
      }) === "agent_uploaded_document",
  );
  const generatedDocuments = allNdaDocuments.filter(
    (doc) =>
      inferNdaDocumentRole({
        documentRole: doc.document_role,
        source: doc.source,
      }) === "generated_document",
  );
  const visibleClientDocuments = allNdaDocuments.filter(
    (doc) => doc.is_visible_to_client,
  );
  const documentsToReview = allNdaDocuments.filter((doc) => {
    const reviewStatus = inferNdaDocumentReviewStatus({
      reviewStatus: doc.review_status,
      status: doc.status,
      source: doc.source,
    });

    return reviewStatus === "not_reviewed" || reviewStatus === "to_correct";
  });

  const primaryAssignment =
    ((assignments ?? []) as AssignmentRow[]).find((a) => a.is_primary) ??
    ((assignments ?? []) as AssignmentRow[])[0] ??
    null;

  const assignedAgent =
    ((agents ?? []) as AgentProfile[]).find(
      (agent) => agent.id === primaryAssignment?.agent_id,
    ) ?? null;

  const assignedAgentDisplayName = assignedAgent
    ? [assignedAgent.first_name, assignedAgent.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      assignedAgent.email ||
      "Agent sans nom"
    : "";

  const preauditTimelineSteps = [
    { label: "Dossier\ncréé" },
    { label: "Profil client\nrempli" },
    { label: "Indicateurs\ngénérés" },
    { label: "Réponses\nen cours" },
    { label: "Synthèse\ndisponible" },
    { label: "Rapport\nexporté" },
    { label: "Clôturé" },
  ];

  const reviewTimelineSteps = [
    { label: "Création\ndossier" },
    { label: "Planification\naudit" },
    { label: "Préparation\ncollecte" },
    { label: "Audit\nréalisé" },
    { label: "Rapport en\npréparation" },
    { label: "Rapport\nenvoyé" },
    { label: "Clôturé" },
  ];

  const currentStep = statusToStepIndex(dossier.status);
  const preauditCurrentStep = preauditSession
    ? preauditIndicatorAnswerCount > 0
      ? 3
      : preauditApplicableCount > 0
        ? 2
        : 1
    : 0;
  const reviewCurrentStep = reviewCase
    ? reviewCase.report_status === "sent"
      ? 5
      : reviewCase.report_status === "ready" ||
          reviewCase.status === "report_ready"
        ? 4
        : reviewCase.status === "in_progress"
          ? 3
          : reviewCase.status === "booked" ||
              reviewCase.status === "partially_booked"
            ? 1
            : 2
    : 0;
  const dossierTimelineSteps = isPreauditDossier
    ? preauditTimelineSteps
    : isReviewDossier
      ? reviewTimelineSteps
      : undefined;
  const dossierCurrentStep = isPreauditDossier
    ? preauditCurrentStep
    : isReviewDossier
      ? reviewCurrentStep
      : currentStep;

  const uniqueReceivedKeys = Array.from(new Set(receivedKeys));
  const docsReceived = NDA_REQUIRED_DOCUMENT_KEYS.filter((key) =>
    uniqueReceivedKeys.includes(key),
  ).length;
  const docsTotal = NDA_REQUIRED_DOCUMENT_KEYS.length;
  const phase1InfoStatus =
    ndaVariablesData || uniqueReceivedKeys.includes("questionnaire_nda")
      ? "completed"
      : "unknown";
  const ndaDocumentSummaryItems = [
    {
      label: "Initiaux client",
      value: initialClientDocuments.length,
      hint: "Documents déposés par le client ou repris comme tels.",
    },
    {
      label: "Agent",
      value: agentDocuments.length,
      hint: "Documents importés côté Studio, invisibles client par défaut.",
    },
    {
      label: "Générés",
      value: generatedDocuments.length,
      hint: "Documents produits par Selen, pas encore branchés pour le NDA.",
    },
    {
      label: "Visibles client",
      value: visibleClientDocuments.length,
      hint: "Documents explicitement publiés côté Vitrine.",
    },
    {
      label: "À vérifier",
      value: documentsToReview.length,
      hint: "Documents non revus ou marqués à corriger.",
    },
  ];

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

  const historyItems: Array<{
    id: string;
    label: string;
    rawDate: Date;
  }> = [];

  function addHistoryItem(id: string, label: string, value?: string | null) {
    if (!value) return;

    const rawDate = new Date(value);
    if (Number.isNaN(rawDate.getTime())) return;

    historyItems.push({ id, label, rawDate });
  }

  addHistoryItem(`dossier-created-${dossier.id}`, "Dossier créé", dossier.created_at);

  if (dossier.updated_at !== dossier.created_at) {
    addHistoryItem(
      `dossier-updated-${dossier.id}`,
      "Dossier mis à jour",
      dossier.updated_at,
    );
  }

  ((documentsData ?? []) as DbDocumentRow[]).forEach((doc) => {
    addHistoryItem(
      `document-${doc.id}`,
      `Document ajouté : ${doc.name}`,
      doc.created_at,
    );
  });

  ((dossierMessages ?? []) as MessageRow[]).forEach((message) => {
    addHistoryItem(
      `message-${message.id}`,
      message.sender_type === "client"
        ? "Message client reçu"
        : "Message agent envoyé",
      message.created_at,
    );
  });

  if (preauditSession) {
    addHistoryItem(
      `preaudit-${preauditSession.id}`,
      "Préaudit client mis à jour",
      preauditSession.updated_at ?? preauditSession.created_at,
    );
  }

  if (reviewCase?.updated_at) {
    addHistoryItem(
      `review-${reviewCase.id}`,
      "Fiche Review mise à jour",
      reviewCase.updated_at,
    );
  }

  const historyEntries: HistoryEntry[] = historyItems
    .sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())
    .map((item) => ({
      id: item.id,
      label: item.label,
      date: item.rawDate.toLocaleDateString("fr-FR"),
    }));

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
          {showGenericGenerateButton ? (
            <SelenButton variant="primary" size="sm" type="button">
              Générer le {getTypeLabel(dossier.type)}
            </SelenButton>
          ) : null}
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

        {relatedActiveDossiers.length > 0 ||
        relatedArchivedDossiers.length > 0 ? (
          <SelenCard style={{ marginBottom: 16 }}>
            <SelenCardTitle>Autres dossiers du client</SelenCardTitle>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {[...relatedActiveDossiers, ...relatedArchivedDossiers].map((related) => (
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
                    opacity: related.status === "archived" ? 0.72 : 1,
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

        <DossierTimeline
          currentStep={dossierCurrentStep}
          steps={dossierTimelineSteps}
        />

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
              <SelenCardTitle>
                {isNdaDossier ? "Documents attendus" : "Documents complémentaires"}
              </SelenCardTitle>

              {isNdaDossier ? (
                <>
                  <NdaChecklist
                    receivedKeys={receivedKeys}
                    phase1InfoStatus={phase1InfoStatus}
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: 8,
                      margin: "12px 0",
                    }}
                  >
                    {ndaDocumentSummaryItems.map((item) => (
                      <div
                        key={item.label}
                        title={item.hint}
                        style={{
                          border: "1px solid var(--selen-border)",
                          borderRadius: 8,
                          background: "rgba(255, 248, 232, 0.55)",
                          padding: "8px 10px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--selen-text3)",
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: "var(--selen-text)",
                          }}
                        >
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: "0 0 10px",
                  }}
                >
                  Les pièces NDA ne sont pas attendues pour ce type de dossier.
                  Ajoutez ici seulement les documents utiles au suivi agent.
                </p>
              )}

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

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12 }}>{doc.name}</div>
                    {isNdaDossier ? (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--selen-text3)",
                          marginTop: 2,
                        }}
                      >
                        {getDocumentWorkflowMeta(doc as DbDocumentRow)}
                      </div>
                    ) : null}
                  </div>

                  <select
                    name="document_type"
                    defaultValue={normalizeNdaDocumentType(doc.document_type)}
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
                    <option value="diplomes_formateur_principal">Diplôme</option>
                    <option value="kbis">KBis</option>
                    <option value="casier_judiciaire_n3">Casier judiciaire</option>
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

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--selen-text)",
                        }}
                      >
                        {doc.name}
                      </div>
                      {isNdaDossier ? (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--selen-text3)",
                            marginTop: 2,
                          }}
                        >
                          {getDocumentWorkflowMeta(doc as DbDocumentRow)}
                        </div>
                      ) : null}
                    </div>

                    <select
                      name="document_type"
                      defaultValue={normalizeNdaDocumentType(doc.document_type)}
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
                      <option value="diplomes_formateur_principal">Diplôme</option>
                      <option value="kbis">KBis</option>
                      <option value="casier_judiciaire_n3">
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

            {dossier.type === "nda" ? (
              <AnalyzeProgramButton
                dossierId={dossier.id}
                initialAnalysis={latestProgramAnalysis}
              />
            ) : null}

            {latestClientDecision ? (
              <SelenCard>
                <SelenCardTitle>
                  Retour du client sur le programme
                </SelenCardTitle>

                <div style={{ fontSize: 13, color: "var(--selen-text)" }}>
                  <strong>Décision :</strong>{" "}
                  {latestClientDecision.client_decision === "validated"
                    ? "Programme validé"
                    : "Programme refusé / à corriger"}
                </div>
              </SelenCard>
            ) : null}

            {dossier.type === "nda" ? (
              <AgentProgramEditor
                dossierId={dossier.id}
                initialAnalysis={latestProgramAnalysis}
                initialVersion={latestProgramVersion}
              />
            ) : null}
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
                    {assignedAgentDisplayName
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
                      {assignedAgentDisplayName}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--selen-text3)",
                        marginTop: 1,
                      }}
                    >
                      {assignedAgent.role === "admin"
                        ? "Admin · assignable"
                        : "Agent Qualiopi"}
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
                  {agents?.map((agent) => {
                    const displayName =
                      [agent.first_name, agent.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim() ||
                      agent.email ||
                      "Agent sans nom";

                    return (
                      <option key={agent.id} value={agent.id}>
                        {displayName} ·{" "}
                        {agent.role === "admin" ? "Admin" : "Agent"}
                      </option>
                    );
                  })}
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
                  {isPreauditDossier
                    ? "Envoyez ce lien au client pour accéder à son espace préaudit."
                    : isReviewDossier
                      ? "Envoyez ce lien au client pour accéder à son espace audit blanc Review."
                      : "Envoyez ce lien au client pour qu’il puisse compléter ses informations essentielles et déposer ses documents."}
                </p>

                <input
                  value={resolvedClientUrl}
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

            {isReviewDossier ? (
              <SelenCard>
                <SelenCardTitle>Review</SelenCardTitle>

                {reviewCase ? (
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
                      Cette fiche dossier est reliée à un audit blanc Review.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Statut
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {formatReviewStatus(
                            reviewCase.status,
                            reviewCase.report_status,
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Rapport
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {formatReviewReportStatus(reviewCase.report_status)}
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/agent/audits-blancs/${reviewCase.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: "var(--radius-sm)",
                        padding: "9px 12px",
                        background:
                          "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
                        color: "#0f0c08",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Ouvrir la fiche Review →
                    </Link>
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: 12,
                      color: "var(--selen-text3)",
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    Aucun audit blanc Review n’est encore relié à ce dossier.
                  </p>
                )}
              </SelenCard>
            ) : null}

            {isPreauditDossier ? (
              <SelenCard>
                <SelenCardTitle>Synthèse préaudit client</SelenCardTitle>

                {preauditSession ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Statut
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditSession.status ?? "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Audit
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditSession.audit_type ?? "Non renseigné"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Nouvel entrant
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditSession.is_new_entrant ? "Oui" : "Non"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Indicateurs
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditApplicableCount} applicables
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Exclus
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditExcludedCount}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "var(--selen-bg3)",
                          border: "1px solid var(--selen-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--selen-text3)",
                            marginBottom: 4,
                          }}
                        >
                          Réponses indicateurs
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text)",
                            fontWeight: 600,
                          }}
                        >
                          {preauditIndicatorAnswerCount}
                        </div>
                      </div>
                    </div>

                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Dernière mise à jour :{" "}
                      {new Date(
                        preauditSession.updated_at ??
                          preauditSession.created_at,
                      ).toLocaleDateString("fr-FR")}
                    </p>

                    <Link
                      href={`/agent/dossiers/${dossier.id}/preaudit`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: "var(--radius-sm)",
                        padding: "9px 12px",
                        background:
                          "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
                        color: "#0f0c08",
                        fontSize: 13,
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Voir la synthèse préaudit →
                    </Link>
                  </div>
                ) : (
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
                      Aucune session préaudit n’a été retrouvée pour l’email de
                      cette organisation.
                    </p>

                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--selen-text3)",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Email recherché : {organisation?.email ?? "—"}
                    </p>
                  </div>
                )}
              </SelenCard>
            ) : null}

            {dossier.type === "nda" ? (
              <>
                <NdaVariablesCard
                  dossierId={dossier.id}
                  initialValues={ndaVariablesInitialValues}
                />
                {canRunAutoAnalysis && (
                  <AnalyzeNdaButton dossierId={dossier.id} />
                )}
              </>
            ) : null}

            <SelenCard>
              <SelenCardTitle>Historique</SelenCardTitle>
              {historyEntries.length ? (
                <DossierHistorique entries={historyEntries} />
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Aucun historique réel enregistré pour le moment.
                </p>
              )}
            </SelenCard>
            <SelenCard>
              <SelenCardTitle>Zone danger</SelenCardTitle>

              <p
                style={{
                  fontSize: 12,
                  color: "var(--selen-text3)",
                  lineHeight: 1.5,
                  marginBottom: 12,
                }}
              >
                Cette action archive le dossier. Il ne sera plus considéré comme
                un dossier actif, mais les données restent conservées.
              </p>

              <form
                action={archiveDossier}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <input type="hidden" name="dossier_id" value={dossier.id} />

                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--selen-text3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Tapez ARCHIVER pour confirmer
                </label>

                <input
                  name="confirmation"
                  placeholder="ARCHIVER"
                  style={{
                    width: "100%",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    color: "var(--selen-text)",
                    fontSize: 13,
                    fontFamily: "var(--font-body)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />

                <SubmitButton
                  label="Archiver ce dossier"
                  pendingLabel="Archivage..."
                />
              </form>
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
