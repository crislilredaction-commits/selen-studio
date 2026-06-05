"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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

function statusTone(status?: string | null) {
  if (status === "completed") return "#7ec97e";
  if (status === "report_ready") return "#6aadcc";
  if (status === "in_progress") return "#d4a843";
  if (status === "booked" || status === "partially_booked") return "#c4a96a";
  if (status === "cancelled") return "#c97a7a";
  return "rgba(255,255,255,0.35)";
}

function shortDocumentType(type?: string | null) {
  if (type === "rapport_audit_blanc") return "Rapport";
  if (type === "document_correctif") return "Correctif";
  if (type === "piece_client") return "Pièce client";
  return "Document";
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

  const visibleClientDocuments = documents.filter(
    (document) => document.is_visible_to_client,
  ).length;

  const internalDocuments = documents.length - visibleClientDocuments;

  const hasMeeting =
    Boolean(auditCase?.calendly_event_1_start) ||
    Boolean(auditCase?.calendly_event_2_start);

  const hasMajorIssues =
    auditSummary.majeure > 0 || auditCase?.brand_usage_diagnostic === "majeure";

  const hasMinorIssues =
    auditSummary.mineure > 0 || auditCase?.brand_usage_diagnostic === "mineure";

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
      router.replace("/login");
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
      <div style={s.page}>
        <style>{css}</style>

        <div style={s.loadingWrap}>
          <div className="sel-spinner" />
          <p style={s.loadingText}>Chargement du dossier audit blanc…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <style>{css}</style>

      <div style={s.container}>
        <header style={s.header}>
          <div style={s.breadcrumb}>
            <Link
              href="/agent/audits-blancs"
              style={s.breadcrumbLink}
              className="sel-breadcrumb"
            >
              Dossiers
            </Link>
            <span style={s.breadcrumbSep}>›</span>
            <span style={s.breadcrumbCurrent}>Fiche audit blanc</span>
          </div>

          <div style={s.headerBody}>
            <div>
              <p style={s.eyebrow}>Selen Studio · Audit blanc</p>

              <h1 style={s.title}>Fiche audit blanc</h1>

              <p style={s.subtitle}>
                Pilotez le dossier, le rendez-vous, les constats, les documents
                correctifs et le rapport final transmis au client.
              </p>

              {agent && (
                <p style={s.agentLine}>
                  <span style={s.onlineDot} />
                  Connecté comme {agent.email} · rôle : {agent.role}
                </p>
              )}
            </div>

            {auditCase && (
              <div style={s.headerStatusCard}>
                <p style={s.cardLabel}>Statut dossier</p>
                <p
                  style={{
                    ...s.headerStatus,
                    color: statusTone(auditCase.status),
                  }}
                >
                  {formatStatus(auditCase.status)}
                </p>
                <p style={s.headerStatusSub}>
                  Rapport : {formatReportStatus(auditCase.report_status)}
                </p>
              </div>
            )}
          </div>
        </header>

        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {!agent || !auditCase ? (
          <EmptyState
            label="Accès impossible"
            title="Le dossier est introuvable ou votre accès agent n’est pas autorisé."
            body="Revenez à la liste des audits blancs pour vérifier le dossier."
            href="/agent/audits-blancs"
            action="Retour aux dossiers"
          />
        ) : (
          <div style={s.layout} className="sel-layout">
            <section style={s.mainColumn}>
              <article style={s.clientCard}>
                <div>
                  <p style={s.cardLabel}>Client</p>
                  <h2 style={s.clientEmail}>{auditCase.client_email}</h2>

                  <p style={s.muted}>
                    {formatOffer(auditCase.offer)} ·{" "}
                    {formatPrice(auditCase.price_paid)}
                  </p>

                  <p style={s.mutedSmall}>
                    Dossier créé le {formatDateTime(auditCase.created_at)} ·
                    Dernière mise à jour :{" "}
                    {formatDateTime(auditCase.updated_at)}
                  </p>
                </div>

                <div style={s.clientBadges}>
                  <span style={s.badge}>
                    {documents.length} document{documents.length > 1 ? "s" : ""}
                  </span>

                  <span style={s.badge}>
                    {visibleClientDocuments} visible
                    {visibleClientDocuments > 1 ? "s" : ""} client
                  </span>

                  <span
                    style={{
                      ...s.badge,
                      color: hasMeeting ? "#7ec97e" : "#d4a843",
                      borderColor: hasMeeting
                        ? "rgba(126,201,126,0.32)"
                        : "rgba(212,168,67,0.32)",
                    }}
                  >
                    {hasMeeting ? "RDV renseigné" : "RDV à compléter"}
                  </span>
                </div>
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Parcours agent</p>

                <h2 style={s.sectionTitle}>Conduire l’audit blanc</h2>

                <p style={s.cardBody}>
                  Suivez le parcours dans l’ordre : profil, usage des marques,
                  indicateurs, puis génération du rapport final.
                </p>

                <div style={s.workflowGrid}>
                  <Link
                    href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
                    style={s.workflowStep}
                    className="sel-workflow-step"
                  >
                    <span style={s.workflowNumber}>1</span>
                    <span>
                      <strong>Profil audité</strong>
                    </span>
                  </Link>

                  <Link
                    href={`/agent/audits-blancs/${auditCase.id}/audit/marques`}
                    style={s.workflowStep}
                    className="sel-workflow-step"
                  >
                    <span style={s.workflowNumber}>2</span>
                    <span>
                      <strong>Usage des marques</strong>
                    </span>
                  </Link>

                  <Link
                    href={`/agent/audits-blancs/${auditCase.id}/audit/1`}
                    style={s.workflowStep}
                    className="sel-workflow-step"
                  >
                    <span style={s.workflowNumber}>3</span>
                    <span>
                      <strong>Indicateurs</strong>
                    </span>
                  </Link>

                  <a
                    href="#rapport-documents"
                    style={s.workflowStep}
                    className="sel-workflow-step"
                  >
                    <span style={s.workflowNumber}>4</span>
                    <span>
                      <strong>Rapport final</strong>
                    </span>
                  </a>
                </div>
              </article>

              <article style={s.card}>
                <div style={s.sectionHeader}>
                  <div>
                    <p style={s.cardLabel}>Synthèse de l’audit blanc</p>
                    <h2 style={s.sectionTitle}>État d’avancement</h2>
                  </div>

                  <button
                    type="button"
                    onClick={generateAuditReportPdf}
                    disabled={generatingPdf}
                    style={{
                      ...s.btnPrimaryCompact,
                      opacity: generatingPdf ? 0.55 : 1,
                      cursor: generatingPdf ? "not-allowed" : "pointer",
                    }}
                    className="sel-btn-primary"
                  >
                    {generatingPdf ? "Génération…" : "Générer le rapport"}
                  </button>
                </div>

                <div style={s.statsGrid}>
                  <SummaryTile
                    label="Marques"
                    value={diagnosticLabel(auditCase.brand_usage_diagnostic)}
                    color={diagnosticColor(auditCase.brand_usage_diagnostic)}
                  />
                  <SummaryTile
                    label="Conformes"
                    value={auditSummary.conforme}
                    color="#7ec97e"
                  />
                  <SummaryTile
                    label="Mineures"
                    value={auditSummary.mineure}
                    color="#d4a843"
                  />
                  <SummaryTile
                    label="Majeures"
                    value={auditSummary.majeure}
                    color="#c97a7a"
                  />
                  <SummaryTile
                    label="À vérifier"
                    value={auditSummary.aVerifier}
                    color="rgba(255,255,255,0.35)"
                  />
                </div>

                {(hasMajorIssues || hasMinorIssues) && (
                  <div
                    style={{
                      ...s.warningPanel,
                      borderColor: hasMajorIssues
                        ? "rgba(201,122,122,0.35)"
                        : "rgba(212,168,67,0.35)",
                    }}
                  >
                    <p style={s.warningTitle}>
                      {hasMajorIssues
                        ? "Des non-conformités majeures probables sont relevées."
                        : "Des points mineurs sont à suivre."}
                    </p>
                    <p style={s.warningText}>
                      Pensez à publier les documents correctifs utiles depuis
                      les pages indicateurs ou depuis la section documents
                      ci-dessous.
                    </p>
                  </div>
                )}
              </article>

              <article style={s.card}>
                <p style={s.cardLabel}>Synthèse des constats</p>

                <h2 style={s.sectionTitle}>
                  Notes prises pendant l’audit blanc
                </h2>

                <p style={s.cardBody}>
                  Cette synthèse reprend les notes saisies dans l’outil d’audit.
                  Elle servira ensuite de base au rapport PDF transmis au
                  client.
                </p>

                <div style={s.constatsList}>
                  <div style={s.constatItem}>
                    <div style={s.constatHeader}>
                      <h3 style={s.constatTitle}>Usage des marques</h3>

                      <span
                        style={{
                          ...s.diagnosticBadge,
                          color: diagnosticColor(
                            auditCase.brand_usage_diagnostic,
                          ),
                        }}
                      >
                        {diagnosticLabel(auditCase.brand_usage_diagnostic)}
                      </span>
                    </div>

                    <p
                      style={{
                        ...s.constatText,
                        color: auditCase.brand_usage_notes
                          ? C.textSoft
                          : C.textFaint,
                      }}
                    >
                      {auditCase.brand_usage_notes?.trim() ||
                        "Aucune note renseignée."}
                    </p>
                  </div>

                  {indicatorConstats.length === 0 ? (
                    <div style={s.emptyInline}>
                      Aucune note indicateur n’a encore été enregistrée. Les
                      constats apparaîtront ici au fur et à mesure de l’audit.
                    </div>
                  ) : (
                    indicatorConstats.map((note) => (
                      <details key={note.indicator_number} style={s.detailItem}>
                        <summary style={s.detailSummary}>
                          Indicateur {note.indicator_number} ·{" "}
                          <span
                            style={{
                              color: diagnosticColor(note.agent_diagnostic),
                            }}
                          >
                            {diagnosticLabel(note.agent_diagnostic)}
                          </span>
                        </summary>

                        <div style={s.detailBody}>
                          <p
                            style={{
                              ...s.constatText,
                              color: note.user_notes ? C.textSoft : C.textFaint,
                            }}
                          >
                            {note.user_notes?.trim() ||
                              "Aucune note renseignée."}
                          </p>

                          {note.updated_at && (
                            <p style={s.mutedSmall}>
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

              <article style={s.card}>
                <div style={s.sectionHeader}>
                  <div>
                    <p style={s.cardLabel}>Rendez-vous et statut</p>
                    <h2 style={s.sectionTitle}>Pilotage du dossier</h2>
                  </div>

                  <button
                    type="button"
                    onClick={saveCase}
                    disabled={savingCase}
                    style={{
                      ...s.btnPrimaryCompact,
                      opacity: savingCase ? 0.55 : 1,
                      cursor: savingCase ? "not-allowed" : "pointer",
                    }}
                    className="sel-btn-primary"
                  >
                    {savingCase ? "Sauvegarde…" : "Enregistrer"}
                  </button>
                </div>

                <div style={s.formGrid}>
                  <label style={s.fieldLabel}>
                    Statut dossier
                    <select
                      value={auditCase.status}
                      onChange={(event) =>
                        updateCaseField("status", event.target.value)
                      }
                      style={s.input}
                      className="sel-input"
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

                  <label style={s.fieldLabel}>
                    Statut rapport
                    <select
                      value={auditCase.report_status}
                      onChange={(event) =>
                        updateCaseField("report_status", event.target.value)
                      }
                      style={s.input}
                      className="sel-input"
                    >
                      <option value="not_started">Non commencé</option>
                      <option value="draft">Brouillon</option>
                      <option value="ready">Prêt</option>
                      <option value="sent">Envoyé au client</option>
                    </select>
                  </label>

                  <label style={s.fieldLabel}>
                    Format
                    <select
                      value={auditCase.calendly_mode ?? ""}
                      onChange={(event) =>
                        updateCaseField(
                          "calendly_mode",
                          event.target.value || null,
                        )
                      }
                      style={s.input}
                      className="sel-input"
                    >
                      <option value="">Non renseigné</option>
                      <option value="single_3h30">1 créneau de 3h30</option>
                      <option value="split_2x1h45">2 créneaux d’1h45</option>
                    </select>
                  </label>

                  <label style={s.fieldLabel}>
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
                      style={s.input}
                      className="sel-input"
                    />
                  </label>

                  <label style={s.fieldLabel}>
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
                      style={s.input}
                      className="sel-input"
                    />
                  </label>

                  <label style={s.fieldLabel}>
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
                        ...s.input,
                        opacity:
                          auditCase.calendly_mode === "split_2x1h45" ? 1 : 0.45,
                      }}
                      className="sel-input"
                    />
                  </label>

                  <label style={s.fieldLabel}>
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
                        ...s.input,
                        opacity:
                          auditCase.calendly_mode === "split_2x1h45" ? 1 : 0.45,
                      }}
                      className="sel-input"
                    />
                  </label>

                  <label style={s.fieldLabel}>
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
                      style={s.input}
                      className="sel-input"
                    />
                  </label>
                </div>
              </article>

              <article id="rapport-documents" style={s.card}>
                <div style={s.sectionHeader}>
                  <div>
                    <p style={s.cardLabel}>Rapport et documents</p>
                    <h2 style={s.sectionTitle}>Documents client</h2>
                  </div>

                  <span style={s.badge}>
                    {visibleClientDocuments} visible
                    {visibleClientDocuments > 1 ? "s" : ""} client ·{" "}
                    {internalDocuments} interne
                    {internalDocuments > 1 ? "s" : ""}
                  </span>
                </div>

                <div style={s.documentPanel}>
                  <p style={s.cardLabel}>Documents existants</p>

                  <h3 style={s.panelTitle}>
                    Rendre visibles des documents déjà disponibles
                  </h3>

                  <p style={s.cardBody}>
                    Sélectionnez un ou plusieurs modèles déjà présents dans
                    Supabase, puis rendez-les visibles dans l’espace client.
                  </p>

                  {documentModels.length === 0 ? (
                    <p style={s.emptyInline}>
                      Aucun modèle de document actif n’a été trouvé dans
                      Supabase.
                    </p>
                  ) : (
                    <>
                      <details style={s.selectorBox}>
                        <summary style={s.detailSummary}>
                          Sélectionner les documents ({selectedModelIds.length}{" "}
                          sélectionné{selectedModelIds.length > 1 ? "s" : ""})
                        </summary>

                        <div style={s.modelList}>
                          {documentModels.map((model) => {
                            const alreadyLinked = documents.some(
                              (document) =>
                                document.source_model_id === model.id,
                            );

                            return (
                              <label
                                key={model.id}
                                style={{
                                  ...s.modelItem,
                                  opacity:
                                    alreadyLinked || !model.file_url ? 0.58 : 1,
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
                                />

                                <span>
                                  <strong style={s.modelTitle}>
                                    {model.name}
                                  </strong>

                                  {model.description && (
                                    <span style={s.modelDescription}>
                                      {model.description}
                                    </span>
                                  )}

                                  {Array.isArray(model.related_indicators) &&
                                    model.related_indicators.length > 0 && (
                                      <span style={s.modelMeta}>
                                        Indicateurs :{" "}
                                        {model.related_indicators.join(", ")}
                                      </span>
                                    )}

                                  {alreadyLinked && (
                                    <span style={s.documentVisible}>
                                      Déjà visible dans l’espace client
                                    </span>
                                  )}

                                  {!model.file_url && (
                                    <span style={s.documentWarning}>
                                      Fichier manquant
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </details>

                      <button
                        type="button"
                        onClick={linkSelectedExistingDocumentsToCase}
                        disabled={linkingModel || selectedModelIds.length === 0}
                        style={{
                          ...s.btnPrimary,
                          marginTop: "0.8rem",
                          opacity:
                            linkingModel || selectedModelIds.length === 0
                              ? 0.55
                              : 1,
                          cursor:
                            linkingModel || selectedModelIds.length === 0
                              ? "not-allowed"
                              : "pointer",
                        }}
                        className="sel-btn-primary"
                      >
                        {linkingModel
                          ? "Publication…"
                          : `Rendre visible${selectedModelIds.length > 1 ? "s" : ""} client`}
                      </button>
                    </>
                  )}
                </div>

                <div style={s.documentPanel}>
                  <p style={s.cardLabel}>Nouveau document</p>

                  <h3 style={s.panelTitle}>Déposer un document spécifique</h3>

                  <div style={s.formGrid}>
                    <label style={s.fieldLabel}>
                      Type de document
                      <select
                        value={documentType}
                        onChange={(event) =>
                          setDocumentType(event.target.value)
                        }
                        style={s.input}
                        className="sel-input"
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

                    <label style={s.fieldLabel}>
                      Nom affiché dans l’espace client
                      <input
                        type="text"
                        value={documentName}
                        onChange={(event) =>
                          setDocumentName(event.target.value)
                        }
                        placeholder="Ex : Rapport audit blanc"
                        style={s.input}
                        className="sel-input"
                      />
                    </label>
                  </div>

                  <label style={{ ...s.fieldLabel, marginTop: "0.8rem" }}>
                    Fichier à déposer
                    <div style={s.fileBox}>
                      <input
                        type="file"
                        onChange={(event) =>
                          setSelectedFile(event.target.files?.[0] ?? null)
                        }
                        style={s.fileInput}
                      />

                      <p
                        style={{
                          ...s.mutedSmall,
                          color: selectedFile ? C.textSoft : C.textFaint,
                        }}
                      >
                        {selectedFile
                          ? `Fichier sélectionné : ${selectedFile.name}`
                          : "Aucun fichier sélectionné pour le moment."}
                      </p>
                    </div>
                  </label>

                  <label style={s.checkboxLine}>
                    <input
                      type="checkbox"
                      checked={documentVisible}
                      onChange={(event) =>
                        setDocumentVisible(event.target.checked)
                      }
                    />
                    Visible dans l’espace client
                  </label>

                  <button
                    type="button"
                    onClick={uploadDocument}
                    disabled={uploading || !selectedFile}
                    style={{
                      ...s.btnPrimary,
                      marginTop: "0.8rem",
                      opacity: uploading || !selectedFile ? 0.55 : 1,
                      cursor:
                        uploading || !selectedFile ? "not-allowed" : "pointer",
                    }}
                    className="sel-btn-primary"
                  >
                    {uploading ? "Dépôt en cours…" : "Déposer le document"}
                  </button>
                </div>

                <div style={s.documentsList}>
                  {documents.length === 0 ? (
                    <p style={s.emptyInline}>
                      Aucun document associé pour l’instant.
                    </p>
                  ) : (
                    documents.map((document) => (
                      <div key={document.id} style={s.documentRow}>
                        <div>
                          <a
                            href={getDocumentHref(document)}
                            target="_blank"
                            rel="noreferrer"
                            style={s.documentLink}
                          >
                            {document.name}
                          </a>

                          <p style={s.mutedSmall}>
                            {shortDocumentType(document.document_type)} ·{" "}
                            {document.is_visible_to_client
                              ? "visible client"
                              : "interne uniquement"}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleDocumentVisibility(document)}
                          style={s.btnGhostCompact}
                          className="sel-btn-ghost"
                        >
                          {document.is_visible_to_client
                            ? "Masquer"
                            : "Publier"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article style={s.card}>
                <div style={s.sectionHeader}>
                  <div>
                    <p style={s.cardLabel}>Notes internes</p>
                    <h2 style={s.sectionTitle}>Suivi agent</h2>
                  </div>
                </div>

                <textarea
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  placeholder="Ajouter une note interne visible uniquement par les agents..."
                  style={s.textarea}
                  className="sel-textarea"
                />

                <div style={{ marginTop: "0.8rem", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={addInternalNote}
                    disabled={savingNote || !newNote.trim()}
                    style={{
                      ...s.btnPrimaryCompact,
                      opacity: savingNote || !newNote.trim() ? 0.55 : 1,
                      cursor:
                        savingNote || !newNote.trim()
                          ? "not-allowed"
                          : "pointer",
                    }}
                    className="sel-btn-primary"
                  >
                    {savingNote ? "Ajout…" : "Ajouter la note"}
                  </button>
                </div>

                <div style={s.notesList}>
                  {notes.length === 0 ? (
                    <p style={s.emptyInline}>Aucune note interne.</p>
                  ) : (
                    notes.map((note) => (
                      <div key={note.id} style={s.noteItem}>
                        <p style={s.noteText}>{note.note}</p>
                        <p style={s.mutedSmall}>
                          {note.agent_email ?? "Agent"} ·{" "}
                          {formatDateTime(note.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>

            <aside style={s.sidebar}>
              <article style={s.sideCard}>
                <p style={s.cardLabel}>Résumé rapide</p>

                <InfoLine
                  label="Statut"
                  value={formatStatus(auditCase.status)}
                  color={statusTone(auditCase.status)}
                />

                <InfoLine
                  label="Rapport"
                  value={formatReportStatus(auditCase.report_status)}
                  color={statusTone(auditCase.status)}
                />

                <InfoLine
                  label="Créneau 1"
                  value={formatDateTime(auditCase.calendly_event_1_start)}
                />

                <InfoLine
                  label="Créneau 2"
                  value={formatDateTime(auditCase.calendly_event_2_start)}
                />

                {auditCase.meeting_url && (
                  <a
                    href={auditCase.meeting_url}
                    target="_blank"
                    rel="noreferrer"
                    style={s.btnGhost}
                    className="sel-btn-ghost"
                  >
                    Ouvrir la visio
                  </a>
                )}
              </article>

              <article style={s.sideCard}>
                <p style={s.cardLabel}>Actions rapides</p>

                <div style={s.sideActions}>
                  <Link
                    href={`/agent/audits-blancs/${auditCase.id}/audit/profil`}
                    style={s.btnPrimary}
                    className="sel-btn-primary"
                  >
                    Reprendre l’outil d’audit →
                  </Link>

                  <Link
                    href={`/agent/audits-blancs/${auditCase.id}/audit/1`}
                    style={s.btnGhost}
                    className="sel-btn-ghost"
                  >
                    Aller à l’indicateur 1
                  </Link>

                  <a
                    href="#rapport-documents"
                    style={s.btnGhost}
                    className="sel-btn-ghost"
                  >
                    Documents & rapport
                  </a>

                  <Link
                    href="/agent/audits-blancs"
                    style={s.navLink}
                    className="sel-nav-link"
                  >
                    ← Retour aux dossiers
                  </Link>

                  <Link
                    href="/client/audit-blanc"
                    style={s.navLink}
                    className="sel-nav-link"
                  >
                    Voir rendu client
                  </Link>

                  <button
                    type="button"
                    onClick={() => loadDetail()}
                    style={s.btnGhost}
                    className="sel-btn-ghost"
                  >
                    Rafraîchir
                  </button>
                </div>
              </article>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function Alert({
  type,
  message,
}: {
  type: "error" | "success";
  message: string;
}) {
  const isError = type === "error";

  return (
    <div
      style={{
        ...s.alert,
        borderLeftColor: isError ? "#c97a7a" : "#7ec97e",
        color: isError ? "#c97a7a" : "#7ec97e",
        background: isError
          ? "rgba(201,122,122,0.07)"
          : "rgba(126,201,126,0.07)",
      }}
    >
      {message}
    </div>
  );
}

function EmptyState({
  label,
  title,
  body,
  href,
  action,
}: {
  label: string;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div style={s.emptyState}>
      <div style={s.emptyOrnament}>✦</div>
      <p style={s.emptyLabel}>{label}</p>
      <h2 style={s.emptyTitle}>{title}</h2>
      <p style={s.emptyBody}>{body}</p>

      <Link href={href} style={s.btnPrimary} className="sel-btn-primary">
        {action}
      </Link>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div style={s.summaryTile}>
      <p style={s.summaryLabel}>{label}</p>
      <p style={{ ...s.summaryValue, color }}>{value}</p>
    </div>
  );
}

function InfoLine({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={s.infoLine}>
      <span style={s.infoLabel}>{label}</span>
      <span style={{ ...s.infoValue, color: color ?? C.textSoft }}>
        {value}
      </span>
    </div>
  );
}

const C = {
  bg: "#1a1510",
  surface: "#221c14",
  surfaceDeep: "#1d1810",
  border: "rgba(196,169,106,0.15)",
  borderStrong: "rgba(196,169,106,0.28)",
  gold: "#c4a96a",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.25)",
};

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "Georgia, 'Times New Roman', serif",
  },
  container: {
    maxWidth: 1320,
    margin: "0 auto",
    padding: "0 2rem 5rem",
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "70vh",
    gap: "1.2rem",
  },
  loadingText: {
    color: C.textFaint,
    fontSize: "0.88rem",
    letterSpacing: "0.06em",
  },
  header: {
    paddingTop: "2rem",
    marginBottom: "2rem",
  },
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.75rem",
    marginBottom: "1.4rem",
    fontFamily: "sans-serif",
  },
  breadcrumbLink: {
    color: C.gold,
    textDecoration: "none",
    opacity: 0.7,
  },
  breadcrumbSep: {
    color: C.textFaint,
  },
  breadcrumbCurrent: {
    color: C.textSoft,
  },
  headerBody: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 260px",
    gap: "1.5rem",
    alignItems: "start",
  },
  eyebrow: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: C.gold,
    marginBottom: "0.5rem",
    fontFamily: "sans-serif",
  },
  title: {
    fontSize: "clamp(1.8rem, 3.4vw, 2.7rem)",
    fontWeight: 700,
    color: C.text,
    lineHeight: 1.1,
    margin: "0 0 0.7rem",
    fontFamily: "Georgia, serif",
  },
  subtitle: {
    color: C.textSoft,
    lineHeight: 1.65,
    maxWidth: 720,
    fontSize: "0.92rem",
    margin: "0 0 0.8rem",
    fontFamily: "sans-serif",
  },
  agentLine: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.82rem",
    color: C.textSoft,
    fontFamily: "sans-serif",
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7ec97e",
    boxShadow: "0 0 0 2.5px rgba(126,201,126,0.2)",
  },
  headerStatusCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1rem",
  },
  headerStatus: {
    fontSize: "1.05rem",
    fontWeight: 800,
    fontFamily: "sans-serif",
    marginTop: "0.4rem",
  },
  headerStatusSub: {
    color: C.textFaint,
    fontSize: "0.78rem",
    fontFamily: "sans-serif",
    marginTop: "0.35rem",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: "1.25rem",
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: "1rem",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.2rem",
  },
  clientCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderLeft: `3px solid ${C.gold}`,
    borderRadius: 10,
    padding: "1.2rem",
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    flexWrap: "wrap",
  },
  cardLabel: {
    fontSize: "0.66rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: C.gold,
    marginBottom: "0.35rem",
    fontFamily: "sans-serif",
  },
  clientEmail: {
    color: C.text,
    fontSize: "1.2rem",
    margin: "0 0 0.4rem",
    fontFamily: "Georgia, serif",
  },
  muted: {
    color: C.textSoft,
    lineHeight: 1.55,
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
  },
  mutedSmall: {
    color: C.textFaint,
    fontSize: "0.76rem",
    lineHeight: 1.45,
    marginTop: "0.3rem",
    fontFamily: "sans-serif",
  },
  clientBadges: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap",
    alignContent: "flex-start",
    justifyContent: "flex-end",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${C.border}`,
    borderRadius: 999,
    color: C.gold,
    background: "rgba(196,169,106,0.06)",
    padding: "0.25rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "0.9rem",
    flexWrap: "wrap",
  },
  sectionTitle: {
    color: C.text,
    fontSize: "1.08rem",
    margin: "0 0 0.4rem",
    fontFamily: "Georgia, serif",
  },
  cardBody: {
    color: C.textFaint,
    fontSize: "0.84rem",
    lineHeight: 1.6,
    fontFamily: "sans-serif",
  },
  workflowGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "0.7rem",
    marginTop: "1rem",
  },
  workflowStep: {
    display: "flex",
    gap: "0.7rem",
    alignItems: "center",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.75rem",
    textDecoration: "none",
    color: C.text,
    fontFamily: "sans-serif",
  },
  workflowNumber: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: C.gold,
    color: "#1a1510",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    flexShrink: 0,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "0.7rem",
  },
  summaryTile: {
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.8rem",
  },
  summaryLabel: {
    color: C.textFaint,
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontFamily: "sans-serif",
    marginBottom: "0.35rem",
  },
  summaryValue: {
    fontSize: "1.1rem",
    fontWeight: 800,
    lineHeight: 1.2,
    fontFamily: "sans-serif",
  },
  warningPanel: {
    border: "1px solid",
    background: "rgba(255,255,255,0.035)",
    borderRadius: 8,
    padding: "0.85rem",
    marginTop: "0.9rem",
  },
  warningTitle: {
    color: C.text,
    fontWeight: 800,
    fontSize: "0.86rem",
    fontFamily: "sans-serif",
  },
  warningText: {
    color: C.textFaint,
    fontSize: "0.8rem",
    lineHeight: 1.5,
    marginTop: "0.3rem",
    fontFamily: "sans-serif",
  },
  constatsList: {
    display: "grid",
    gap: "0.65rem",
    marginTop: "1rem",
  },
  constatItem: {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "0.85rem",
    background: "rgba(255,255,255,0.025)",
  },
  constatHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.7rem",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  constatTitle: {
    color: C.text,
    fontSize: "0.95rem",
    margin: 0,
    fontFamily: "Georgia, serif",
  },
  diagnosticBadge: {
    fontSize: "0.76rem",
    fontWeight: 800,
    fontFamily: "sans-serif",
  },
  constatText: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    fontSize: "0.84rem",
    fontFamily: "sans-serif",
  },
  emptyInline: {
    border: `1px dashed ${C.border}`,
    borderRadius: 8,
    color: C.textFaint,
    padding: "0.85rem",
    fontSize: "0.84rem",
    lineHeight: 1.5,
    fontFamily: "sans-serif",
  },
  detailItem: {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: "rgba(255,255,255,0.025)",
    padding: "0.85rem",
  },
  detailSummary: {
    cursor: "pointer",
    color: C.text,
    fontWeight: 800,
    fontFamily: "sans-serif",
    fontSize: "0.85rem",
  },
  detailBody: {
    marginTop: "0.75rem",
    display: "grid",
    gap: "0.45rem",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0.8rem",
  },
  fieldLabel: {
    display: "grid",
    gap: "0.35rem",
    color: C.textSoft,
    fontSize: "0.8rem",
    fontFamily: "sans-serif",
  },
  input: {
    width: "100%",
    padding: "0.65rem",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.text,
    borderRadius: 6,
    outline: "none",
    fontFamily: "sans-serif",
    boxSizing: "border-box",
  },
  documentPanel: {
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.025)",
    borderRadius: 8,
    padding: "1rem",
    marginTop: "0.9rem",
  },
  panelTitle: {
    color: C.text,
    fontSize: "0.98rem",
    margin: "0 0 0.5rem",
    fontFamily: "Georgia, serif",
  },
  selectorBox: {
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.8rem",
    marginTop: "0.8rem",
  },
  modelList: {
    marginTop: "0.8rem",
    display: "grid",
    gap: "0.55rem",
    maxHeight: 280,
    overflowY: "auto",
    paddingRight: "0.4rem",
  },
  modelItem: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    gap: "0.65rem",
    alignItems: "start",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.7rem",
  },
  modelTitle: {
    display: "block",
    color: C.text,
    lineHeight: 1.35,
    fontFamily: "sans-serif",
  },
  modelDescription: {
    display: "block",
    color: C.textFaint,
    fontSize: "0.78rem",
    lineHeight: 1.4,
    marginTop: "0.25rem",
    fontFamily: "sans-serif",
  },
  modelMeta: {
    display: "block",
    color: C.gold,
    fontSize: "0.72rem",
    marginTop: "0.25rem",
    fontFamily: "sans-serif",
  },
  documentVisible: {
    display: "block",
    color: "#7ec97e",
    fontSize: "0.72rem",
    marginTop: "0.25rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
  },
  documentWarning: {
    display: "block",
    color: "#c97a7a",
    fontSize: "0.72rem",
    marginTop: "0.25rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
  },
  btnPrimary: {
    display: "block",
    width: "100%",
    padding: "0.65rem 1rem",
    background: C.gold,
    color: "#1a1510",
    border: "none",
    borderRadius: 6,
    fontSize: "0.82rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  btnPrimaryCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.55rem 0.85rem",
    background: C.gold,
    color: "#1a1510",
    border: "none",
    borderRadius: 6,
    fontSize: "0.78rem",
    fontWeight: 700,
    fontFamily: "sans-serif",
    cursor: "pointer",
  },
  btnGhost: {
    display: "block",
    width: "100%",
    padding: "0.65rem 1rem",
    background: "transparent",
    color: C.gold,
    border: `1px solid rgba(196,169,106,0.3)`,
    borderRadius: 6,
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  btnGhostCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.45rem 0.7rem",
    background: "transparent",
    color: C.gold,
    border: `1px solid rgba(196,169,106,0.3)`,
    borderRadius: 6,
    fontSize: "0.75rem",
    fontFamily: "sans-serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  fileBox: {
    border: `1px dashed ${C.borderStrong}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.9rem",
    overflow: "hidden",
  },
  fileInput: {
    maxWidth: "100%",
    color: C.textSoft,
    fontFamily: "sans-serif",
  },
  checkboxLine: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    color: C.textSoft,
    fontSize: "0.82rem",
    fontFamily: "sans-serif",
    marginTop: "0.8rem",
  },
  documentsList: {
    marginTop: "1rem",
    paddingTop: "1rem",
    borderTop: `1px solid ${C.border}`,
    display: "grid",
    gap: "0.65rem",
  },
  documentRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "0.8rem",
    alignItems: "center",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "0.75rem",
    background: "rgba(255,255,255,0.025)",
  },
  documentLink: {
    color: C.text,
    fontWeight: 800,
    textDecoration: "none",
    fontFamily: "sans-serif",
    fontSize: "0.84rem",
  },
  textarea: {
    width: "100%",
    minHeight: 115,
    padding: "0.75rem",
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    fontSize: "0.83rem",
    lineHeight: 1.55,
    resize: "vertical",
    fontFamily: "sans-serif",
    outline: "none",
    boxSizing: "border-box",
  },
  notesList: {
    marginTop: "1rem",
    display: "grid",
    gap: "0.7rem",
  },
  noteItem: {
    borderLeft: `2px solid ${C.gold}`,
    paddingLeft: "0.75rem",
  },
  noteText: {
    color: C.textSoft,
    lineHeight: 1.55,
    fontSize: "0.84rem",
    fontFamily: "sans-serif",
    whiteSpace: "pre-wrap",
  },
  sidebar: {
    position: "sticky",
    top: "1.5rem",
    display: "grid",
    gap: "0.85rem",
  },
  sideCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "1.1rem",
  },
  sideActions: {
    display: "grid",
    gap: "0.55rem",
  },
  infoLine: {
    display: "grid",
    gap: "0.2rem",
    paddingBottom: "0.75rem",
    marginBottom: "0.75rem",
    borderBottom: `1px solid ${C.border}`,
  },
  infoLabel: {
    color: C.textFaint,
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "sans-serif",
  },
  infoValue: {
    fontSize: "0.84rem",
    lineHeight: 1.35,
    fontWeight: 700,
    fontFamily: "sans-serif",
  },
  navLink: {
    fontSize: "0.78rem",
    color: C.textFaint,
    textDecoration: "none",
    fontFamily: "sans-serif",
    padding: "0.25rem 0",
    textAlign: "center",
  },
  alert: {
    borderLeft: "3px solid",
    padding: "0.85rem 1rem",
    marginBottom: "1rem",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    borderRadius: "0 6px 6px 0",
    fontFamily: "sans-serif",
  },
  emptyState: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "4rem 2rem",
    textAlign: "center",
  },
  emptyOrnament: {
    fontSize: "1.5rem",
    color: "rgba(196,169,106,0.25)",
    marginBottom: "1.2rem",
  },
  emptyLabel: {
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.14em",
    color: C.gold,
    marginBottom: "0.6rem",
    fontFamily: "sans-serif",
  },
  emptyTitle: {
    color: C.text,
    marginBottom: "0.5rem",
    fontSize: "1.1rem",
    fontFamily: "Georgia, serif",
  },
  emptyBody: {
    color: C.textFaint,
    lineHeight: 1.65,
    maxWidth: 420,
    margin: "0 auto 1rem",
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
  },
};

const css = `
  @keyframes selSpin {
    to { transform: rotate(360deg); }
  }

  .sel-spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(196,169,106,0.15);
    border-top-color: #c4a96a;
    animation: selSpin 0.75s linear infinite;
  }

  .sel-input:focus,
  .sel-textarea:focus {
    border-color: rgba(196,169,106,0.45) !important;
    background: rgba(255,255,255,0.05) !important;
    box-shadow: 0 0 0 3px rgba(196,169,106,0.07);
  }

  .sel-btn-primary:hover {
    background: #d4a843 !important;
  }

  .sel-btn-ghost:hover,
  .sel-workflow-step:hover {
    background: rgba(196,169,106,0.09) !important;
    border-color: rgba(196,169,106,0.5) !important;
  }

  .sel-breadcrumb:hover,
  .sel-nav-link:hover {
    opacity: 1 !important;
    color: rgba(196,169,106,0.75) !important;
  }

  @media (max-width: 920px) {
    .sel-layout {
      grid-template-columns: 1fr !important;
    }
  }
`;
