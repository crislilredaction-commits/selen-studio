"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type AuditBlancCase = {
  id: string;
  client_email: string;
  status: string;
  offer: string;
  price_paid: number | null;
  currency: string | null;
  calendly_mode: string | null;
  calendly_event_1_start: string | null;
  calendly_event_1_end: string | null;
  calendly_event_2_start: string | null;
  calendly_event_2_end: string | null;
  meeting_url: string | null;
  report_status: string;
  report_storage_path: string | null;
  created_at: string;
  updated_at: string;
  brand_usage_diagnostic:
    | "a_verifier"
    | "conforme"
    | "mineure"
    | "majeure"
    | null;
  brand_usage_notes: string | null;
};

type AgentProfile = {
  email: string;
  role: "agent" | "admin";
};

type AuditBlancDocument = {
  id: string;
  name: string;
  document_type: string;
  storage_path: string;
  public_url: string | null;
  is_visible_to_client: boolean;
  uploaded_by_email: string | null;
  created_at: string;
  source_model_id: string | null;
};

type PreauditDocumentModel = {
  id: string;
  name: string;
  description: string | null;
  related_indicators: number[] | null;
  file_url: string | null;
};

type AgentNote = {
  id: string;
  agent_email: string | null;
  note: string;
  created_at: string;
};

type IndicatorNote = {
  indicator_number: number;
  agent_diagnostic: "a_verifier" | "conforme" | "mineure" | "majeure" | null;
  user_notes: string | null;
  updated_at: string | null;
};

type AuditSummary = {
  conforme: number;
  mineure: number;
  majeure: number;
  aVerifier: number;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPrice(value?: number | null) {
  if (!value) return "Non renseigné";
  return `${(value / 100).toFixed(2).replace(".", ",")} €`;
}

function formatOffer(offer?: string | null) {
  if (offer === "direct") return "Audit blanc direct — 397 €";
  if (offer === "reserved_after_auto_audit") {
    return "Audit blanc après auto-audit — 199 €";
  }
  if (offer === "manual") return "Dossier manuel";
  return "Offre inconnue";
}

function formatStatus(status?: string | null) {
  if (status === "paid") return "Paiement validé";
  if (status === "booking_pending") return "Rendez-vous à planifier";
  if (status === "partially_booked") return "Un rendez-vous sur deux réservé";
  if (status === "booked") return "Rendez-vous réservé";
  if (status === "in_progress") return "Audit en cours";
  if (status === "report_ready") return "Rapport prêt";
  if (status === "completed") return "Terminé";
  if (status === "cancelled") return "Annulé";
  return "À vérifier";
}

function formatReportStatus(status?: string | null) {
  if (status === "not_started") return "Non commencé";
  if (status === "draft") return "Brouillon";
  if (status === "ready") return "Prêt";
  if (status === "sent") return "Envoyé au client";
  return "À vérifier";
}

function diagnosticLabel(value?: string | null) {
  if (value === "conforme") return "✅ Conforme";
  if (value === "mineure") return "⚠️ Mineure";
  if (value === "majeure") return "🚨 Majeure";
  if (value === "a_verifier") return "… À vérifier";
  return "Non renseigné";
}

function diagnosticColor(value?: string | null) {
  if (value === "conforme") return "#6a8a4a";
  if (value === "mineure") return "var(--ocre-gold)";
  if (value === "majeure") return "var(--rust)";
  return "var(--ink-faint)";
}

function buildAuditSummary(indicatorNotes: IndicatorNote[]): AuditSummary {
  return indicatorNotes.reduce(
    (acc, note) => {
      if (note.agent_diagnostic === "conforme") acc.conforme += 1;
      else if (note.agent_diagnostic === "mineure") acc.mineure += 1;
      else if (note.agent_diagnostic === "majeure") acc.majeure += 1;
      else acc.aVerifier += 1;

      return acc;
    },
    {
      conforme: 0,
      mineure: 0,
      majeure: 0,
      aVerifier: 0,
    },
  );
}

function isoToLocalInput(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  const pad = (num: number) => String(num).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localInputToIso(value: string) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function extractStoragePathFromPublicUrl(value?: string | null) {
  if (!value) return "";

  const marker = "/storage/v1/object/public/selen-documents/";
  const markerIndex = value.indexOf(marker);

  if (markerIndex >= 0) {
    return value.slice(markerIndex + marker.length);
  }

  return value.replace(/^\/+/, "");
}

function pdfText(value?: string | null) {
  return value?.trim() || "Non renseigné.";
}

function diagnosticLabelPlain(value?: string | null) {
  if (value === "conforme") return "Conforme";
  if (value === "mineure") return "Non-conformité mineure probable";
  if (value === "majeure") return "Non-conformité majeure probable";
  if (value === "a_verifier") return "À vérifier";
  return "Non renseigné";
}

function generateAuditReportPdfBlob({
  auditCase,
  indicatorNotes,
  auditSummary,
}: {
  auditCase: AuditBlancCase;
  indicatorNotes: IndicatorNote[];
  auditSummary: AuditSummary;
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const margin = 14;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Rapport d'audit blanc Qualiopi", margin, y);

  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Client : ${auditCase.client_email}`, margin, y);

  y += 6;

  doc.text(
    `Généré le : ${new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date())}`,
    margin,
    y,
  );

  y += 10;

  doc.setDrawColor(178, 138, 98);
  doc.line(margin, y, 196, y);

  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Synthèse générale", margin, y);

  y += 7;

  autoTable(doc, {
    startY: y,
    head: [["Élément", "Résultat"]],
    body: [
      [
        "Usage des marques",
        diagnosticLabelPlain(auditCase.brand_usage_diagnostic),
      ],
      ["Indicateurs conformes", String(auditSummary.conforme)],
      ["Non-conformités mineures probables", String(auditSummary.mineure)],
      ["Non-conformités majeures probables", String(auditSummary.majeure)],
      ["À vérifier", String(auditSummary.aVerifier)],
    ],
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      valign: "top",
    },
    headStyles: {
      fillColor: [178, 138, 98],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 90 },
    },
    margin: { left: margin, right: margin },
  });

  const lastTable = (doc as unknown as { lastAutoTable?: { finalY?: number } })
    .lastAutoTable;

  y = (lastTable?.finalY ?? y + 35) + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Constats détaillés", margin, y);

  y += 7;

  const sortedNotes = [...indicatorNotes].sort(
    (a, b) => a.indicator_number - b.indicator_number,
  );

  const rows = [
    [
      "Usage des marques",
      diagnosticLabelPlain(auditCase.brand_usage_diagnostic),
      pdfText(auditCase.brand_usage_notes),
    ],
    ...sortedNotes.map((note) => [
      `Indicateur ${note.indicator_number}`,
      diagnosticLabelPlain(note.agent_diagnostic),
      pdfText(note.user_notes),
    ]),
  ];

  autoTable(doc, {
    startY: y,
    head: [["Partie", "Diagnostic", "Notes / constats"]],
    body: rows,
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 3,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [62, 42, 31],
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 45 },
      2: { cellWidth: 93 },
    },
    margin: { left: margin, right: margin },
  });

  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 90, 65);
    doc.text(
      `Selen Editions - Rapport d'audit blanc - Page ${page}/${pageCount}`,
      margin,
      288,
    );
  }

  return doc.output("blob") as Blob;
}

export default function AgentAuditBlancDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const caseId = params.id;

  const supabase = useMemo(() => createClient(), []);

  function getDocumentHref(document: AuditBlancDocument) {
    const storagePath = extractStoragePathFromPublicUrl(
      document.storage_path || document.public_url,
    );

    if (!storagePath) {
      return document.public_url ?? "#";
    }

    return supabase.storage.from("selen-documents").getPublicUrl(storagePath)
      .data.publicUrl;
  }
  const [loading, setLoading] = useState(true);
  const [savingCase, setSavingCase] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [auditCase, setAuditCase] = useState<AuditBlancCase | null>(null);
  const [documents, setDocuments] = useState<AuditBlancDocument[]>([]);
  const [notes, setNotes] = useState<AgentNote[]>([]);

  const [newNote, setNewNote] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("rapport_audit_blanc");
  const [documentVisible, setDocumentVisible] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [indicatorNotes, setIndicatorNotes] = useState<IndicatorNote[]>([]);

  const [documentModels, setDocumentModels] = useState<PreauditDocumentModel[]>(
    [],
  );
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [linkingModel, setLinkingModel] = useState(false);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const auditSummary = buildAuditSummary(indicatorNotes);

  const indicatorConstats = [...indicatorNotes]
    .filter(
      (note) =>
        note.agent_diagnostic ||
        (note.user_notes && note.user_notes.trim().length > 0),
    )
    .sort((a, b) => a.indicator_number - b.indicator_number);

  async function loadDetail() {
    setLoading(true);
    setError("");
    setSuccess("");

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      router.replace("/client/login");
      return;
    }

    const userEmail = authData.user.email ?? "";

    const { data: agentData, error: agentError } = await supabase
      .from("agent_profiles")
      .select("email, role")
      .eq("email", userEmail.toLowerCase())
      .eq("is_active", true)
      .maybeSingle();

    if (agentError) {
      setError(`Impossible de vérifier l’accès agent. ${agentError.message}`);
      setLoading(false);
      return;
    }

    if (!agentData) {
      setError("Accès agent non autorisé pour ce compte.");
      setLoading(false);
      return;
    }

    setAgent(agentData as AgentProfile);

    const { data: caseData, error: caseError } = await supabase
      .from("audit_blanc_cases")
      .select(
        "id, client_email, status, offer, price_paid, currency, calendly_mode, calendly_event_1_start, calendly_event_1_end, calendly_event_2_start, calendly_event_2_end, meeting_url, report_status, report_storage_path, brand_usage_diagnostic, brand_usage_notes, created_at, updated_at",
      )
      .eq("id", caseId)
      .maybeSingle();

    if (caseError) {
      setError(`Impossible de charger le dossier. ${caseError.message}`);
      setLoading(false);
      return;
    }

    if (!caseData) {
      setError("Dossier audit blanc introuvable.");
      setLoading(false);
      return;
    }

    setAuditCase(caseData as AuditBlancCase);

    const { data: documentData, error: documentError } = await supabase
      .from("audit_blanc_documents")
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      )
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (documentError) {
      setError(`Impossible de charger les documents. ${documentError.message}`);
      setLoading(false);
      return;
    }

    setDocuments((documentData ?? []) as AuditBlancDocument[]);

    const { data: noteData, error: noteError } = await supabase
      .from("audit_blanc_agent_notes")
      .select("id, agent_email, note, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });

    if (noteError) {
      setError(`Impossible de charger les notes. ${noteError.message}`);
      setLoading(false);
      return;
    }

    const { data: modelData, error: modelError } = await supabase
      .from("preaudit_document_models")
      .select("id, name, description, related_indicators, file_url")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (modelError) {
      setError(
        `Impossible de charger les modèles de documents. ${modelError.message}`,
      );
      setLoading(false);
      return;
    }

    setDocumentModels((modelData ?? []) as PreauditDocumentModel[]);

    setNotes((noteData ?? []) as AgentNote[]);

    const { data: indicatorNoteData, error: indicatorNoteError } =
      await supabase
        .from("audit_blanc_indicator_notes")
        .select("indicator_number, agent_diagnostic, user_notes, updated_at")
        .eq("case_id", caseId)
        .order("indicator_number", { ascending: true });

    if (indicatorNoteError) {
      setError(
        `Impossible de charger la synthèse des indicateurs. ${indicatorNoteError.message}`,
      );
      setLoading(false);
      return;
    }

    setIndicatorNotes((indicatorNoteData ?? []) as IndicatorNote[]);

    setLoading(false);
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  function updateCaseField(field: keyof AuditBlancCase, value: string | null) {
    setAuditCase((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev,
    );
  }

  async function saveCase() {
    if (!auditCase) return;

    setSavingCase(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("audit_blanc_cases")
      .update({
        status: auditCase.status,
        calendly_mode: auditCase.calendly_mode,
        calendly_event_1_start: auditCase.calendly_event_1_start,
        calendly_event_1_end: auditCase.calendly_event_1_end,
        calendly_event_2_start: auditCase.calendly_event_2_start,
        calendly_event_2_end: auditCase.calendly_event_2_end,
        meeting_url: auditCase.meeting_url,
        report_status: auditCase.report_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (updateError) {
      setError(updateError.message);
      setSavingCase(false);
      return;
    }

    setSuccess("Dossier mis à jour.");
    setSavingCase(false);
  }

  async function addInternalNote() {
    if (!auditCase || !agent || !newNote.trim()) return;

    setSavingNote(true);
    setError("");
    setSuccess("");

    const { data, error: insertError } = await supabase
      .from("audit_blanc_agent_notes")
      .insert({
        case_id: auditCase.id,
        agent_email: agent.email,
        note: newNote.trim(),
      })
      .select("id, agent_email, note, created_at")
      .single();

    if (insertError) {
      setError(insertError.message);
      setSavingNote(false);
      return;
    }

    setNotes((prev) => [data as AgentNote, ...prev]);
    setNewNote("");
    setSuccess("Note ajoutée.");
    setSavingNote(false);
  }

  function toggleSelectedModelId(modelId: string) {
    setSelectedModelIds((prev) =>
      prev.includes(modelId)
        ? prev.filter((id) => id !== modelId)
        : [...prev, modelId],
    );
  }

  async function linkSelectedExistingDocumentsToCase() {
    if (!auditCase || !agent) {
      setError("Dossier ou agent introuvable.");
      return;
    }

    if (selectedModelIds.length === 0) {
      setError("Sélectionnez au moins un document à rendre visible.");
      return;
    }

    const modelsToLink = documentModels.filter((model) =>
      selectedModelIds.includes(model.id),
    );

    const validModels = modelsToLink.filter((model) => {
      const alreadyLinked = documents.some(
        (document) => document.source_model_id === model.id,
      );

      return model.file_url && !alreadyLinked;
    });

    if (validModels.length === 0) {
      setError(
        "Aucun document sélectionné ne peut être ajouté : ils sont peut-être déjà visibles ou sans fichier associé.",
      );
      return;
    }

    setLinkingModel(true);
    setError("");
    setSuccess("");

    const rowsToInsert = validModels.map((model) => {
      const storagePath = extractStoragePathFromPublicUrl(model.file_url);

      const { data: publicUrlData } = supabase.storage
        .from("selen-documents")
        .getPublicUrl(storagePath);

      return {
        case_id: auditCase.id,
        name: model.name,
        document_type: "document_correctif",
        storage_bucket: "selen-documents",
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        uploaded_by_email: agent.email,
        is_visible_to_client: true,
        source_model_id: model.id,
      };
    });

    const { data: documentData, error: insertError } = await supabase
      .from("audit_blanc_documents")
      .insert(rowsToInsert)
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      );

    if (insertError) {
      setError(`Impossible d’associer les documents : ${insertError.message}`);
      setLinkingModel(false);
      return;
    }

    setDocuments((prev) => [
      ...((documentData ?? []) as AuditBlancDocument[]),
      ...prev,
    ]);

    setSelectedModelIds([]);
    setSuccess(
      `${validModels.length} document${validModels.length > 1 ? "s" : ""} rendu${
        validModels.length > 1 ? "s" : ""
      } visible${validModels.length > 1 ? "s" : ""} dans l’espace client.`,
    );
    setLinkingModel(false);
  }

  async function generateAuditReportPdf() {
    if (!auditCase || !agent) {
      setError("Dossier ou agent introuvable.");
      return;
    }

    try {
      setGeneratingPdf(true);
      setError("");
      setSuccess("");

      const pdfBlob = generateAuditReportPdfBlob({
        auditCase,
        indicatorNotes,
        auditSummary,
      });

      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error("Le fichier PDF généré est vide.");
      }

      const safeEmail = sanitizeFileName(auditCase.client_email);
      const fileName = `rapport-audit-blanc-${safeEmail}-${Date.now()}.pdf`;
      const storagePath = `audit-blanc/${auditCase.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("selen-documents")
        .upload(storagePath, pdfBlob, {
          upsert: false,
          contentType: "application/pdf",
        });

      if (uploadError) {
        throw new Error(`Erreur upload PDF : ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from("selen-documents")
        .getPublicUrl(storagePath);

      const { data: documentData, error: insertError } = await supabase
        .from("audit_blanc_documents")
        .insert({
          case_id: auditCase.id,
          name: "Rapport d’audit blanc",
          document_type: "rapport_audit_blanc",
          storage_bucket: "selen-documents",
          storage_path: storagePath,
          public_url: publicUrlData.publicUrl,
          uploaded_by_email: agent.email,
          is_visible_to_client: true,
        })
        .select(
          "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
        )
        .single();

      if (insertError) {
        throw new Error(
          `PDF généré, mais impossible de l’associer au dossier : ${insertError.message}`,
        );
      }

      const { error: caseUpdateError } = await supabase
        .from("audit_blanc_cases")
        .update({
          report_status: "sent",
          report_storage_path: storagePath,
          status: "report_ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", auditCase.id);

      if (caseUpdateError) {
        throw new Error(
          `PDF généré, mais statut dossier non mis à jour : ${caseUpdateError.message}`,
        );
      }

      setDocuments((prev) => [documentData as AuditBlancDocument, ...prev]);

      setAuditCase((prev) =>
        prev
          ? {
              ...prev,
              report_status: "sent",
              report_storage_path: storagePath,
              status: "report_ready",
              updated_at: new Date().toISOString(),
            }
          : prev,
      );

      setSuccess("Rapport PDF généré et visible dans l’espace client.");
    } catch (error) {
      console.error("Erreur génération rapport PDF :", error);

      setError(
        error instanceof Error
          ? `Impossible de générer le rapport PDF : ${error.message}`
          : "Impossible de générer le rapport PDF. Une erreur inconnue est survenue.",
      );
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function uploadDocument() {
    if (!auditCase || !agent || !selectedFile) {
      setError("Sélectionnez un fichier à déposer.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    const cleanFileName = sanitizeFileName(selectedFile.name);
    const storagePath = `audit-blanc/${auditCase.id}/${Date.now()}-${cleanFileName}`;
    const finalName = documentName.trim() || selectedFile.name;

    const { error: uploadError } = await supabase.storage
      .from("selen-documents")
      .upload(storagePath, selectedFile, {
        upsert: false,
      });

    if (uploadError) {
      setError(`Erreur upload : ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("selen-documents")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    const { data: documentData, error: insertError } = await supabase
      .from("audit_blanc_documents")
      .insert({
        case_id: auditCase.id,
        name: finalName,
        document_type: documentType,
        storage_bucket: "selen-documents",
        storage_path: storagePath,
        public_url: publicUrl,
        uploaded_by_email: agent.email,
        is_visible_to_client: documentVisible,
      })
      .select(
        "id, name, document_type, storage_path, public_url, is_visible_to_client, uploaded_by_email, created_at, source_model_id",
      )
      .single();

    if (insertError) {
      setError(`Erreur enregistrement document : ${insertError.message}`);
      setUploading(false);
      return;
    }

    if (documentType === "rapport_audit_blanc") {
      const nextReportStatus = documentVisible ? "sent" : "ready";

      const { error: reportUpdateError } = await supabase
        .from("audit_blanc_cases")
        .update({
          report_status: nextReportStatus,
          report_storage_path: storagePath,
          status: documentVisible ? "report_ready" : auditCase.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", auditCase.id);

      if (reportUpdateError) {
        setError(
          `Document déposé, mais statut rapport non mis à jour : ${reportUpdateError.message}`,
        );
        setUploading(false);
        return;
      }

      setAuditCase((prev) =>
        prev
          ? {
              ...prev,
              report_status: nextReportStatus,
              report_storage_path: storagePath,
              status: documentVisible ? "report_ready" : prev.status,
            }
          : prev,
      );
    }

    setDocuments((prev) => [documentData as AuditBlancDocument, ...prev]);
    setDocumentName("");
    setSelectedFile(null);
    setDocumentVisible(true);
    setDocumentType("rapport_audit_blanc");
    setSuccess("Document déposé.");
    setUploading(false);
  }

  async function toggleDocumentVisibility(document: AuditBlancDocument) {
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("audit_blanc_documents")
      .update({
        is_visible_to_client: !document.is_visible_to_client,
      })
      .eq("id", document.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDocuments((prev) =>
      prev.map((item) =>
        item.id === document.id
          ? {
              ...item,
              is_visible_to_client: !item.is_visible_to_client,
            }
          : item,
      ),
    );

    setSuccess("Visibilité du document mise à jour.");
  }

  if (loading) {
    return (
      <main className="gazette-paper" style={{ minHeight: "100vh" }}>
        <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
          <p style={{ color: "var(--ink-faint)" }}>
            Chargement du dossier audit blanc…
          </p>
        </div>      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <p className="gazette-label">Espace agent</p>

            <h1
              className="gazette-hero-title"
              style={{ color: "var(--parchment)", marginBottom: "0.5rem" }}
            >
              Fiche audit blanc
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 760,
              }}
            >
              Gérez le rendez-vous, ajoutez des notes internes et publiez le
              rapport ou les documents correctifs dans l’espace client.
            </p>

            {agent && (
              <p
                style={{
                  color: "rgba(240,220,190,0.75)",
                  fontSize: "0.9rem",
                  marginTop: "0.8rem",
                }}
              >
                Connecté comme {agent.email} · rôle : {agent.role}
              </p>
            )}
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              background: "rgba(138,75,36,0.06)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              border: "1px solid #6a8a4a",
              borderLeft: "4px solid #6a8a4a",
              background: "rgba(106,138,74,0.08)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "#4f6f36",
            }}
          >
            {success}
          </div>
        )}

        {!agent || !auditCase ? (
          <section
            style={{
              background: "var(--paper)",
              border: "1px solid var(--sepia-mid)",
              padding: "1.4rem",
            }}
          >
            <p className="gazette-label">Accès impossible</p>

            <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
              Le dossier est introuvable ou votre accès agent n’est pas
              autorisé.
            </h2>

            <Link href="/agent/audits-blancs" className="btn-ink">
              <span>Retour aux dossiers</span>
            </Link>
          </section>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 340px",
              gap: "1.25rem",
              alignItems: "start",
            }}
            className="preaudit-grid"
          >
            <section style={{ display: "grid", gap: "1rem" }}>
              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-dark)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Client</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.5rem" }}>
                  {auditCase.client_email}
                </h2>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  {formatOffer(auditCase.offer)} ·{" "}
                  {formatPrice(auditCase.price_paid)}
                </p>

                <p
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    marginTop: "0.6rem",
                  }}
                >
                  Dossier créé le {formatDateTime(auditCase.created_at)}
                  <br />
                  Dernière mise à jour : {formatDateTime(auditCase.updated_at)}
                </p>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-gold)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Synthèse de l’audit blanc</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                  État d’avancement du dossier
                </h2>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "0.7rem",
                  }}
                >
                  <div
                    style={{
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(255,255,255,0.35)",
                      padding: "0.8rem",
                    }}
                  >
                    <p className="gazette-label">Marques</p>
                    <p
                      style={{
                        color: diagnosticColor(
                          auditCase.brand_usage_diagnostic,
                        ),
                        fontWeight: 700,
                        marginTop: "0.35rem",
                      }}
                    >
                      {diagnosticLabel(auditCase.brand_usage_diagnostic)}
                    </p>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(106,138,74,0.08)",
                      padding: "0.8rem",
                    }}
                  >
                    <p className="gazette-label">Conformes</p>
                    <p
                      style={{
                        color: "#4f6f36",
                        fontSize: "1.8rem",
                        fontWeight: 800,
                      }}
                    >
                      {auditSummary.conforme}
                    </p>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(201,160,85,0.1)",
                      padding: "0.8rem",
                    }}
                  >
                    <p className="gazette-label">Mineures</p>
                    <p
                      style={{
                        color: "var(--ocre-dark)",
                        fontSize: "1.8rem",
                        fontWeight: 800,
                      }}
                    >
                      {auditSummary.mineure}
                    </p>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(138,75,36,0.08)",
                      padding: "0.8rem",
                    }}
                  >
                    <p className="gazette-label">Majeures</p>
                    <p
                      style={{
                        color: "var(--rust)",
                        fontSize: "1.8rem",
                        fontWeight: 800,
                      }}
                    >
                      {auditSummary.majeure}
                    </p>
                  </div>

                  <div
                    style={{
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(90,64,49,0.05)",
                      padding: "0.8rem",
                    }}
                  >
                    <p className="gazette-label">À vérifier</p>
                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "1.8rem",
                        fontWeight: 800,
                      }}
                    >
                      {auditSummary.aVerifier}
                    </p>
                  </div>
                </div>

                <p
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    marginTop: "0.8rem",
                  }}
                >
                  Cette synthèse se met à jour à partir des diagnostics
                  enregistrés dans l’outil d’audit indicateur par indicateur.
                </p>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  borderLeft: "4px solid var(--ocre-dark)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Synthèse des constats</p>

                <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                  Notes prises pendant l’audit blanc
                </h2>

                <p
                  style={{
                    color: "var(--ink-faint)",
                    fontSize: "0.9rem",
                    lineHeight: 1.5,
                    marginBottom: "1rem",
                  }}
                >
                  Cette synthèse reprend les notes saisies dans l’outil d’audit.
                  Elle servira ensuite de base au rapport PDF transmis au
                  client.
                </p>

                <button
                  type="button"
                  className="btn-ink"
                  onClick={generateAuditReportPdf}
                  disabled={generatingPdf}
                  style={{
                    width: "100%",
                    marginBottom: "1rem",
                    opacity: generatingPdf ? 0.55 : 1,
                    cursor: generatingPdf ? "not-allowed" : "pointer",
                  }}
                >
                  <span>
                    {generatingPdf
                      ? "Génération du rapport PDF…"
                      : "Générer le rapport PDF client"}
                  </span>
                </button>

                <div style={{ display: "grid", gap: "0.8rem" }}>
                  <div
                    style={{
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(178,138,98,0.08)",
                      padding: "0.9rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.8rem",
                        flexWrap: "wrap",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <h3
                        style={{
                          color: "var(--ink)",
                          fontSize: "1rem",
                          margin: 0,
                        }}
                      >
                        Usage des marques
                      </h3>

                      <span
                        style={{
                          color: diagnosticColor(
                            auditCase.brand_usage_diagnostic,
                          ),
                          fontWeight: 800,
                          fontSize: "0.9rem",
                        }}
                      >
                        {diagnosticLabel(auditCase.brand_usage_diagnostic)}
                      </span>
                    </div>

                    <p
                      style={{
                        color: auditCase.brand_usage_notes
                          ? "var(--ink-soft)"
                          : "var(--ink-faint)",
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        fontSize: "0.92rem",
                      }}
                    >
                      {auditCase.brand_usage_notes?.trim() ||
                        "Aucune note renseignée."}
                    </p>
                  </div>

                  {indicatorConstats.length === 0 ? (
                    <div
                      style={{
                        border: "1px dashed var(--sepia-mid)",
                        background: "rgba(255,255,255,0.35)",
                        padding: "0.9rem",
                      }}
                    >
                      <p
                        style={{
                          color: "var(--ink-faint)",
                          fontSize: "0.92rem",
                          lineHeight: 1.5,
                        }}
                      >
                        Aucune note indicateur n’a encore été enregistrée. Les
                        constats apparaîtront ici au fur et à mesure de l’audit.
                      </p>
                    </div>
                  ) : (
                    indicatorConstats.map((note) => (
                      <details
                        key={note.indicator_number}
                        style={{
                          border: "1px solid var(--sepia-mid)",
                          background: "rgba(255,255,255,0.38)",
                          padding: "0.9rem",
                        }}
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            color: "var(--ink)",
                            fontWeight: 800,
                          }}
                        >
                          Indicateur {note.indicator_number} ·{" "}
                          <span
                            style={{
                              color: diagnosticColor(note.agent_diagnostic),
                            }}
                          >
                            {diagnosticLabel(note.agent_diagnostic)}
                          </span>
                        </summary>

                        <div
                          style={{
                            marginTop: "0.75rem",
                            display: "grid",
                            gap: "0.5rem",
                          }}
                        >
                          <p
                            style={{
                              color: note.user_notes
                                ? "var(--ink-soft)"
                                : "var(--ink-faint)",
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                              fontSize: "0.92rem",
                            }}
                          >
                            {note.user_notes?.trim() ||
                              "Aucune note renseignée."}
                          </p>

                          {note.updated_at && (
                            <p
                              style={{
                                color: "var(--ink-faint)",
                                fontSize: "0.78rem",
                              }}
                            >
                              Dernière mise à jour :{" "}
                              {formatDateTime(note.updated_at)}
                            </p>
                          )}
                        </div>
                      </details>
                    ))
                  )}
                </div>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Rendez-vous et statut</p>

                <div
                  style={{
                    marginTop: "0.8rem",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "0.8rem",
                  }}
                >
                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Statut dossier
                    <select
                      value={auditCase.status}
                      onChange={(event) =>
                        updateCaseField("status", event.target.value)
                      }
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                      }}
                    >
                      <option value="booking_pending">À planifier</option>
                      <option value="partially_booked">
                        Partiellement réservé
                      </option>
                      <option value="booked">Réservé</option>
                      <option value="in_progress">En cours</option>
                      <option value="report_ready">Rapport disponible</option>
                      <option value="completed">Terminé</option>
                      <option value="cancelled">Annulé</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Statut rapport
                    <select
                      value={auditCase.report_status}
                      onChange={(event) =>
                        updateCaseField("report_status", event.target.value)
                      }
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                      }}
                    >
                      <option value="not_started">Non commencé</option>
                      <option value="draft">Brouillon</option>
                      <option value="ready">Prêt</option>
                      <option value="sent">Envoyé au client</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Format
                    <select
                      value={auditCase.calendly_mode ?? ""}
                      onChange={(event) =>
                        updateCaseField(
                          "calendly_mode",
                          event.target.value || null,
                        )
                      }
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                      }}
                    >
                      <option value="">Non renseigné</option>
                      <option value="single_3h30">1 créneau de 3h30</option>
                      <option value="split_2x1h45">2 créneaux d’1h45</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Début créneau 1
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_1_start)}
                      onChange={(event) =>
                        updateCaseField(
                          "calendly_event_1_start",
                          localInputToIso(event.target.value),
                        )
                      }
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                      }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Fin créneau 1
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_1_end)}
                      onChange={(event) =>
                        updateCaseField(
                          "calendly_event_1_end",
                          localInputToIso(event.target.value),
                        )
                      }
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                      }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Début créneau 2
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_2_start)}
                      onChange={(event) =>
                        updateCaseField(
                          "calendly_event_2_start",
                          localInputToIso(event.target.value),
                        )
                      }
                      disabled={auditCase.calendly_mode !== "split_2x1h45"}
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                        opacity:
                          auditCase.calendly_mode === "split_2x1h45" ? 1 : 0.5,
                      }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Fin créneau 2
                    <input
                      type="datetime-local"
                      value={isoToLocalInput(auditCase.calendly_event_2_end)}
                      onChange={(event) =>
                        updateCaseField(
                          "calendly_event_2_end",
                          localInputToIso(event.target.value),
                        )
                      }
                      disabled={auditCase.calendly_mode !== "split_2x1h45"}
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                        opacity:
                          auditCase.calendly_mode === "split_2x1h45" ? 1 : 0.5,
                      }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "0.3rem" }}>
                    Lien visio
                    <input
                      type="url"
                      value={auditCase.meeting_url ?? ""}
                      onChange={(event) =>
                        updateCaseField(
                          "meeting_url",
                          event.target.value || null,
                        )
                      }
                      placeholder="https://..."
                      style={{
                        padding: "0.65rem",
                        border: "1px solid var(--sepia-mid)",
                        background: "rgba(255,255,255,0.55)",
                        color: "var(--ink)",
                      }}
                    />
                  </label>
                </div>

                <div style={{ marginTop: "1rem", textAlign: "right" }}>
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={saveCase}
                    disabled={savingCase}
                    style={{
                      opacity: savingCase ? 0.55 : 1,
                      cursor: savingCase ? "not-allowed" : "pointer",
                    }}
                  >
                    <span>
                      {savingCase ? "Sauvegarde…" : "Enregistrer le dossier"}
                    </span>
                  </button>
                </div>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Rapport et documents</p>

                <div
                  style={{
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(178,138,98,0.08)",
                    padding: "1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <p className="gazette-label">Documents existants</p>

                  <h2 style={{ color: "var(--ink)", marginBottom: "0.6rem" }}>
                    Rendre visibles des documents déjà disponibles
                  </h2>

                  <p
                    style={{
                      color: "var(--ink-faint)",
                      fontSize: "0.9rem",
                      lineHeight: 1.5,
                      marginBottom: "0.9rem",
                    }}
                  >
                    Sélectionnez un ou plusieurs modèles déjà présents dans
                    Supabase, puis rendez-les visibles dans l’espace client.
                  </p>

                  {documentModels.length === 0 ? (
                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.9rem",
                        lineHeight: 1.5,
                      }}
                    >
                      Aucun modèle de document actif n’a été trouvé dans
                      Supabase.
                    </p>
                  ) : (
                    <>
                      <details
                        style={{
                          border: "1px solid var(--sepia-mid)",
                          background: "rgba(255,255,255,0.45)",
                          padding: "0.8rem",
                        }}
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            color: "var(--ink)",
                            fontWeight: 700,
                          }}
                        >
                          Sélectionner les documents ({selectedModelIds.length}{" "}
                          sélectionné
                          {selectedModelIds.length > 1 ? "s" : ""})
                        </summary>

                        <div
                          style={{
                            marginTop: "0.8rem",
                            display: "grid",
                            gap: "0.55rem",
                            maxHeight: "280px",
                            overflowY: "auto",
                            paddingRight: "0.4rem",
                          }}
                        >
                          {documentModels.map((model) => {
                            const alreadyLinked = documents.some(
                              (document) =>
                                document.source_model_id === model.id,
                            );

                            return (
                              <label
                                key={model.id}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "auto minmax(0, 1fr)",
                                  gap: "0.65rem",
                                  alignItems: "start",
                                  border: "1px solid var(--sepia-mid)",
                                  background: alreadyLinked
                                    ? "rgba(106,138,74,0.08)"
                                    : "rgba(255,255,255,0.5)",
                                  padding: "0.7rem",
                                  opacity:
                                    alreadyLinked || !model.file_url ? 0.6 : 1,
                                  cursor:
                                    alreadyLinked || !model.file_url
                                      ? "not-allowed"
                                      : "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    selectedModelIds.includes(model.id) ||
                                    alreadyLinked
                                  }
                                  disabled={alreadyLinked || !model.file_url}
                                  onChange={() =>
                                    toggleSelectedModelId(model.id)
                                  }
                                  style={{ marginTop: "0.15rem" }}
                                />

                                <span>
                                  <span
                                    style={{
                                      display: "block",
                                      color: "var(--ink)",
                                      fontWeight: 700,
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    {model.name}
                                  </span>

                                  {model.description && (
                                    <span
                                      style={{
                                        display: "block",
                                        color: "var(--ink-faint)",
                                        fontSize: "0.82rem",
                                        lineHeight: 1.4,
                                        marginTop: "0.25rem",
                                      }}
                                    >
                                      {model.description}
                                    </span>
                                  )}

                                  {Array.isArray(model.related_indicators) &&
                                    model.related_indicators.length > 0 && (
                                      <span
                                        style={{
                                          display: "block",
                                          color: "var(--ocre-dark)",
                                          fontSize: "0.76rem",
                                          marginTop: "0.25rem",
                                        }}
                                      >
                                        Indicateurs :{" "}
                                        {model.related_indicators.join(", ")}
                                      </span>
                                    )}

                                  {alreadyLinked && (
                                    <span
                                      style={{
                                        display: "block",
                                        color: "#4f6f36",
                                        fontSize: "0.76rem",
                                        marginTop: "0.25rem",
                                        fontWeight: 700,
                                      }}
                                    >
                                      Déjà visible dans l’espace client
                                    </span>
                                  )}

                                  {!model.file_url && (
                                    <span
                                      style={{
                                        display: "block",
                                        color: "var(--rust)",
                                        fontSize: "0.76rem",
                                        marginTop: "0.25rem",
                                        fontWeight: 700,
                                      }}
                                    >
                                      Fichier manquant
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </details>

                      <div style={{ marginTop: "0.9rem" }}>
                        <button
                          type="button"
                          className="btn-ink"
                          onClick={linkSelectedExistingDocumentsToCase}
                          disabled={
                            linkingModel || selectedModelIds.length === 0
                          }
                          style={{
                            width: "100%",
                            opacity:
                              linkingModel || selectedModelIds.length === 0
                                ? 0.55
                                : 1,
                            cursor:
                              linkingModel || selectedModelIds.length === 0
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          <span>
                            {linkingModel
                              ? "Publication…"
                              : `Rendre visible${selectedModelIds.length > 1 ? "s" : ""} client`}
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div
                  style={{
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.25)",
                    padding: "1rem",
                  }}
                >
                  <p className="gazette-label">Nouveau document</p>

                  <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
                    Déposer un document spécifique
                  </h2>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr",
                      gap: "0.9rem",
                    }}
                  >
                    <label style={{ display: "grid", gap: "0.35rem" }}>
                      Type de document
                      <select
                        value={documentType}
                        onChange={(event) =>
                          setDocumentType(event.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "0.65rem",
                          border: "1px solid var(--sepia-mid)",
                          background: "rgba(255,255,255,0.55)",
                          color: "var(--ink)",
                        }}
                      >
                        <option value="rapport_audit_blanc">
                          Rapport d’audit blanc
                        </option>
                        <option value="document_correctif">
                          Document correctif
                        </option>
                        <option value="piece_client">Pièce client</option>
                        <option value="autre">Autre</option>
                      </select>
                    </label>

                    <label style={{ display: "grid", gap: "0.35rem" }}>
                      Nom affiché dans l’espace client
                      <input
                        type="text"
                        value={documentName}
                        onChange={(event) =>
                          setDocumentName(event.target.value)
                        }
                        placeholder="Ex : Rapport audit blanc"
                        style={{
                          width: "100%",
                          padding: "0.65rem",
                          border: "1px solid var(--sepia-mid)",
                          background: "rgba(255,255,255,0.55)",
                          color: "var(--ink)",
                        }}
                      />
                    </label>

                    <label style={{ display: "grid", gap: "0.45rem" }}>
                      Fichier à déposer
                      <div
                        style={{
                          border: "1px dashed var(--sepia-mid)",
                          background: "rgba(255,255,255,0.45)",
                          padding: "0.9rem",
                          overflow: "hidden",
                        }}
                      >
                        <input
                          type="file"
                          onChange={(event) =>
                            setSelectedFile(event.target.files?.[0] ?? null)
                          }
                          style={{
                            maxWidth: "100%",
                            color: "var(--ink-soft)",
                          }}
                        />

                        <p
                          style={{
                            color: selectedFile
                              ? "var(--ink-soft)"
                              : "var(--ink-faint)",
                            fontSize: "0.85rem",
                            marginTop: "0.5rem",
                            lineHeight: 1.4,
                            wordBreak: "break-word",
                          }}
                        >
                          {selectedFile
                            ? `Fichier sélectionné : ${selectedFile.name}`
                            : "Aucun fichier sélectionné pour le moment."}
                        </p>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        color: "var(--ink-soft)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={documentVisible}
                        onChange={(event) =>
                          setDocumentVisible(event.target.checked)
                        }
                      />
                      Visible dans l’espace client
                    </label>
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="btn-ink"
                      onClick={uploadDocument}
                      disabled={uploading || !selectedFile}
                      style={{
                        width: "100%",
                        opacity: uploading || !selectedFile ? 0.55 : 1,
                        cursor:
                          uploading || !selectedFile
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      <span>
                        {uploading ? "Dépôt en cours…" : "Déposer le document"}
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1.2rem",
                    paddingTop: "1rem",
                    borderTop: "1px solid var(--sepia-mid)",
                    display: "grid",
                    gap: "0.6rem",
                  }}
                >
                  {documents.length === 0 ? (
                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.92rem",
                      }}
                    >
                      Aucun document associé pour l’instant.
                    </p>
                  ) : (
                    documents.map((document) => (
                      <div
                        key={document.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          gap: "0.8rem",
                          alignItems: "center",
                          borderLeft: "2px solid var(--ocre-gold)",
                          paddingLeft: "0.6rem",
                        }}
                        className="preaudit-grid"
                      >
                        <div>
                          <a
                            href={getDocumentHref(document)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: "var(--ink)",
                              fontWeight: 700,
                              textDecoration: "none",
                            }}
                          >
                            {document.name}
                          </a>

                          <p
                            style={{
                              color: "var(--ink-faint)",
                              fontSize: "0.82rem",
                              marginTop: "0.2rem",
                            }}
                          >
                            {document.document_type} ·{" "}
                            {document.is_visible_to_client
                              ? "visible client"
                              : "interne uniquement"}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="btn-ink"
                          onClick={() => toggleDocumentVisibility(document)}
                        >
                          <span>
                            {document.is_visible_to_client
                              ? "Masquer"
                              : "Publier"}
                          </span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1.2rem",
                }}
              >
                <p className="gazette-label">Notes internes</p>

                <textarea
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  placeholder="Ajouter une note interne visible uniquement par les agents..."
                  style={{
                    width: "100%",
                    minHeight: "110px",
                    padding: "0.7rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.5)",
                    resize: "vertical",
                  }}
                />

                <div style={{ marginTop: "0.8rem", textAlign: "right" }}>
                  <button
                    type="button"
                    className="btn-ink"
                    onClick={addInternalNote}
                    disabled={savingNote || !newNote.trim()}
                    style={{
                      opacity: savingNote || !newNote.trim() ? 0.55 : 1,
                      cursor:
                        savingNote || !newNote.trim()
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    <span>{savingNote ? "Ajout…" : "Ajouter la note"}</span>
                  </button>
                </div>

                <div
                  style={{
                    marginTop: "1.2rem",
                    display: "grid",
                    gap: "0.7rem",
                  }}
                >
                  {notes.length === 0 ? (
                    <p
                      style={{
                        color: "var(--ink-faint)",
                        fontSize: "0.92rem",
                      }}
                    >
                      Aucune note interne.
                    </p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        style={{
                          borderLeft: "2px solid var(--ocre-gold)",
                          paddingLeft: "0.7rem",
                          color: "var(--ink-soft)",
                          lineHeight: 1.55,
                        }}
                      >
                        <p>{note.note}</p>
                        <p
                          style={{
                            color: "var(--ink-faint)",
                            fontSize: "0.78rem",
                            marginTop: "0.3rem",
                          }}
                        >
                          {note.agent_email ?? "Agent"} ·{" "}
                          {formatDateTime(note.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>

            <aside
              style={{
                position: "sticky",
                top: "1.5rem",
                display: "grid",
                gap: "0.8rem",
              }}
            >
              <article
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                }}
              >
                <p className="gazette-label">Résumé</p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Statut :</strong> {formatStatus(auditCase.status)}
                </p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Rapport :</strong>{" "}
                  {formatReportStatus(auditCase.report_status)}
                </p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Créneau 1 :</strong>{" "}
                  {formatDateTime(auditCase.calendly_event_1_start)}
                </p>

                <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
                  <strong>Créneau 2 :</strong>{" "}
                  {formatDateTime(auditCase.calendly_event_2_start)}
                </p>
              </article>

              <Link
                href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
                className="btn-ink"
              >
                <span>Reprendre l’outil d’audit →</span>
              </Link>

              <Link
                href={`/agent/audits-blancs/${auditCase.id}/audit/1`}
                className="btn-ink"
              >
                <span>Aller directement à l’indicateur 1</span>
              </Link>

              <Link href="/agent/audits-blancs" className="btn-ink">
                <span>← Retour aux dossiers</span>
              </Link>

              <Link href="/client/audit-blanc" className="btn-ink">
                <span>Voir rendu client</span>
              </Link>

              <button
                type="button"
                className="btn-ink"
                onClick={() => loadDetail()}
              >
                <span>Rafraîchir</span>
              </button>
            </aside>
          </div>
        )}
      </div>    </main>
  );
}
