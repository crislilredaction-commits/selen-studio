import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { attendanceReviewStateLabel, getAttendanceReviewHistory } from "@/lib/daily/attendanceReviewHistory";
import { detectAttendanceSignatureFormat } from "@/lib/daily/attendanceSignatureImage.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type Learner = { first_name?: string | null; last_name?: string | null; email?: string | null };
type AttendanceRecord = {
  enrolment_id: string;
  status: string | null;
  signed_at: string | null;
  validated_at: string | null;
  signature_storage_path: string | null;
  proof_sha256: string | null;
  evidence_metadata: unknown;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function safeText(value: unknown, fallback = "Non renseigné") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return safeText(value);
  return new Intl.DateTimeFormat("fr-FR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

function statusLabel(status?: string | null) {
  if (status === "present") return "Présent — signé";
  if (status === "excused") return "Absence justifiée";
  if (status === "absent") return "Absent";
  return "En attente";
}

function storageObjectPath(path: string) {
  return path.startsWith("documents/") ? path.slice("documents/".length) : path;
}

function safeFilename(value: unknown) {
  return safeText(value, "session").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "session";
}

function addSignaturePreview(doc: jsPDF, bytes: Buffer, x: number, y: number): boolean {
  const format = detectAttendanceSignatureFormat(bytes);
  if (!format) return false;
  try {
    doc.addImage(bytes.toString("base64"), format, x, y, 48, 20, undefined, "FAST");
    return true;
  } catch {
    // Une preuve illisible ne doit pas bloquer le téléchargement du relevé.
    return false;
  }
}

function isAfterSession(endDate: unknown) {
  const date = typeof endDate === "string" ? endDate.trim() : "";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await params;
  const requestedEnrolmentId = new URL(request.url).searchParams.get("enrolment")?.trim() ?? "";
  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin.from("daily_sessions")
    .select("id,organisation_id,internal_reference,start_date,end_date,daily_formations(title),organisations(name,legal_name)")
    .eq("id", id).maybeSingle();
  if (sessionError) return NextResponse.json({ error: "Lecture de la session indisponible." }, { status: 500 });
  if (!session?.organisation_id) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  if (!(await isDailyOrganisationInAgentScope(auth.email, session.organisation_id))) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const [slotsResult, enrolmentsResult, publicationResult, trainerSignatureResult] = await Promise.all([
    admin.from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at,label,daily_attendance_records(enrolment_id,status,signed_at,validated_at,signature_storage_path,proof_sha256,evidence_metadata)")
      .eq("organisation_id", session.organisation_id).eq("session_id", id)
      .neq("status", "cancelled").order("slot_date").order("starts_at"),
    admin.from("daily_session_enrolments")
      .select("id,status,daily_learners(first_name,last_name,email)")
      .eq("organisation_id", session.organisation_id).eq("session_id", id),
    requestedEnrolmentId ? admin.from("daily_documents")
      .select("id").eq("organisation_id", session.organisation_id).eq("session_id", id)
      .eq("document_type", "attendance_summary").in("status", ["published", "signed"])
      .eq("is_current", true).is("archived_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
    requestedEnrolmentId ? admin.from("daily_documents")
      .select("id,signed_at,storage_path,mime_type,metadata")
      .eq("organisation_id", session.organisation_id).eq("session_id", id)
      .eq("document_type", "trainer_signature_evidence").eq("status", "signed").eq("is_current", true) : Promise.resolve({ data: [], error: null }),
  ]);
  if (slotsResult.error || enrolmentsResult.error || publicationResult.error || trainerSignatureResult.error) {
    return NextResponse.json({ error: "Impossible de préparer le relevé d’émargement." }, { status: 500 });
  }

  const slots = slotsResult.data ?? [];
  const allEnrolments = enrolmentsResult.data ?? [];
  const enrolments = requestedEnrolmentId ? allEnrolments.filter((item) => item.id === requestedEnrolmentId && !["declined", "cancelled", "abandoned"].includes(item.status)) : allEnrolments;
  if (!slots.length) return NextResponse.json({ error: "Aucun créneau d’émargement n’est configuré." }, { status: 409 });
  if (requestedEnrolmentId && !enrolments.length) return NextResponse.json({ error: "Inscription introuvable ou inactive." }, { status: 404 });
  if (requestedEnrolmentId && !isAfterSession(session.end_date)) return NextResponse.json({ error: "La feuille individuelle sera disponible après la fin de la session." }, { status: 409 });
  if (requestedEnrolmentId && !publicationResult.data) return NextResponse.json({ error: "La feuille individuelle sera disponible après validation et publication du relevé d’émargement." }, { status: 409 });
  if (requestedEnrolmentId && slots.some((slot) => {
    const records = (slot.daily_attendance_records ?? []) as AttendanceRecord[];
    const status = records.find((item) => item.enrolment_id === requestedEnrolmentId)?.status;
    return !status || status === "pending";
  })) return NextResponse.json({ error: "Toutes les présences de cet apprenant doivent être traitées avant le téléchargement." }, { status: 409 });

  const formation = relation(session.daily_formations);
  const organisation = relation(session.organisations);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 14;
  const right = 196;
  let y = 16;
  const ensure = (height: number) => { if (y + height > 282) { doc.addPage(); y = 16; } };
  const line = (text: string, size = 9, bold = false) => {
    ensure(6);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const parts = doc.splitTextToSize(text, right - left) as string[];
    for (const part of parts) { ensure(5); doc.text(part, left, y); y += 5; }
  };

  line(requestedEnrolmentId ? "Feuille d’émargement individuelle" : "Relevé d’émargement de la session", 16, true);
  line(`Organisme : ${safeText(organisation?.legal_name || organisation?.name, "Organisme Daily")}`, 10);
  line(`Formation : ${safeText(formation?.title, "Formation Daily")}`, 10);
  line(`Session : ${safeText(session.internal_reference, "Sans référence")}`, 10);
  line(`Période : ${formatDate(session.start_date)} au ${formatDate(session.end_date)}`, 10);
  y += 3;

  for (const enrolment of enrolments) {
    ensure(18);
    const learner = relation(enrolment.daily_learners) as Learner | null;
    const learnerName = `${learner?.first_name ?? ""} ${learner?.last_name ?? ""}`.trim() || learner?.email || "Apprenant";
    doc.setDrawColor(185);
    doc.line(left, y, right, y);
    y += 6;
    line(learnerName, 12, true);
    line(`État de l’inscription : ${safeText(enrolment.status)}`, 8);

    for (const slot of slots) {
      ensure(34);
      const records = (slot.daily_attendance_records ?? []) as AttendanceRecord[];
      const record = records.find((item) => item.enrolment_id === enrolment.id);
      line(`${formatDate(slot.slot_date)} · ${String(slot.starts_at).slice(0, 5)}–${String(slot.ends_at).slice(0, 5)}${slot.label ? ` · ${slot.label}` : ""}`, 9, true);
      line(`Statut : ${statusLabel(record?.status)}${record?.signed_at ? ` · signé le ${formatDate(record.signed_at, true)}` : ""}${record?.validated_at ? ` · validé le ${formatDate(record.validated_at, true)}` : ""}`, 8);
      if (!requestedEnrolmentId && record?.proof_sha256) line(`Empreinte de preuve : ${record.proof_sha256}`, 7);
      if (!requestedEnrolmentId) for (const review of getAttendanceReviewHistory(record ?? {})) {
        line(`Revue v${review.version} : ${attendanceReviewStateLabel(review.state)}${review.submittedAt ? ` · transmise le ${formatDate(review.submittedAt, true)}` : ""}${review.decidedAt ? ` · décision le ${formatDate(review.decidedAt, true)}` : ""}`, 7);
        if (review.reason) line(`Motif de la revue v${review.version} : ${review.reason}`, 7);
      }

      if (record?.status === "present" && record.signature_storage_path) {
        const { data: signature, error: signatureError } = await admin.storage.from("documents").download(storageObjectPath(record.signature_storage_path));
        if (!signatureError && signature) {
          const bytes = Buffer.from(await signature.arrayBuffer());
          ensure(25);
          if (addSignaturePreview(doc, bytes, left, y)) y += 23;
          else line("Signature conservée dans le stockage sécurisé — aperçu illisible ou format non pris en charge.", 7);
        } else {
          line("Signature conservée dans le stockage sécurisé — aperçu indisponible lors de la génération.", 7);
        }
      }
      if (requestedEnrolmentId && record?.status === "present" && !record.signature_storage_path) {
        line("Signature de l’apprenant : non enregistrée.", 7);
      }
      if (requestedEnrolmentId) {
        const trainerSignatures = (trainerSignatureResult.data ?? []).filter((signature) => {
          const metadata = signature.metadata && typeof signature.metadata === "object" ? signature.metadata as Record<string, unknown> : {};
          return String(metadata.slot_id ?? "") === String(slot.id);
        });
        if (!trainerSignatures.length) line("Signature du formateur : non enregistrée.", 7);
        for (const trainerSignature of trainerSignatures) {
          const metadata = trainerSignature.metadata && typeof trainerSignature.metadata === "object" ? trainerSignature.metadata as Record<string, unknown> : {};
          line(`Signature du formateur${metadata.trainer_name ? ` — ${String(metadata.trainer_name)}` : ""}${trainerSignature.signed_at ? ` · ${formatDate(trainerSignature.signed_at, true)}` : ""}`, 7, true);
          if (!trainerSignature.storage_path) { line("Signature non enregistrée.", 7); continue; }
          const { data: trainerImage, error: trainerImageError } = await admin.storage.from("documents").download(storageObjectPath(trainerSignature.storage_path));
          if (trainerImageError || !trainerImage) { line("Signature conservée — aperçu temporairement indisponible.", 7); continue; }
          const trainerBytes = Buffer.from(await trainerImage.arrayBuffer());
          ensure(25);
          if (addSignaturePreview(doc, trainerBytes, left, y)) y += 23;
          else line("Signature du formateur conservée — aperçu illisible ou format non pris en charge.", 7);
        }
      }
      y += 2;
    }
  }

  ensure(12);
  doc.setDrawColor(185);
  doc.line(left, y, right, y);
  y += 5;
  line(requestedEnrolmentId
    ? `Document personnel généré depuis Selen Studio le ${formatDate(new Date().toISOString(), true)}, après validation et publication. Il ne contient que cet apprenant et les signatures formateur des mêmes créneaux ; aucune métadonnée privée de revue n’est exposée.`
    : `Document généré depuis Selen Studio le ${formatDate(new Date().toISOString(), true)}. Les lignes « En attente » ne constituent pas une présence signée. L’historique de revue exclut les jetons, chemins de stockage et identités privées des décideurs.`, 7);

  const output = doc.output("arraybuffer");
  return new NextResponse(output, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${requestedEnrolmentId ? "emargement-individuel" : "emargements"}-${safeFilename(session.internal_reference)}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
