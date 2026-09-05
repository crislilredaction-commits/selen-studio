import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type RouteContext = { params: Promise<{ id: string }> };

function safeText(value: unknown, fallback = "Non renseigné") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "Non renseignée";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 5) {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  doc.text(lines, x, y);
  return y + Math.max(lines.length, 1) * lineHeight;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [sessionResult, entriesResult, enrolmentsResult] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("id,organisation_id,internal_reference,start_date,end_date,daily_formations(title),organisations(name,legal_name)")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("daily_session_followup_entries")
      .select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name")
      .eq("session_id", id)
      .order("occurred_at", { ascending: true }),
    admin
      .from("daily_session_enrolments")
      .select("id,daily_learners(first_name,last_name,email)")
      .eq("session_id", id),
  ]);

  if (sessionResult.error || entriesResult.error || enrolmentsResult.error) {
    return NextResponse.json({ error: "Impossible de générer la fiche de suivi." }, { status: 500 });
  }
  const session = sessionResult.data;
  if (!session) return NextResponse.json({ error: "Session introuvable." }, { status: 404 });

  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  const organisation = Array.isArray(session.organisations) ? session.organisations[0] : session.organisations;
  const learnerByEnrolment = new Map(
    (enrolmentsResult.data ?? []).map((enrolment) => {
      const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
      const fullName = `${learner?.first_name ?? ""} ${learner?.last_name ?? ""}`.trim();
      return [enrolment.id, fullName || learner?.email || "Apprenant"];
    }),
  );

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  const right = 194;
  const width = right - left;
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Fiche de suivi de session", left, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Organisme : ${safeText(organisation?.legal_name || organisation?.name, "Organisme Daily")}`, left, y);
  y += 5;
  doc.text(`Formation : ${safeText(formation?.title, "Formation Daily")}`, left, y);
  y += 5;
  doc.text(`Session : ${safeText(session.internal_reference, "Sans référence")}`, left, y);
  y += 5;
  doc.text(`Période : ${safeText(session.start_date)} au ${safeText(session.end_date)}`, left, y);
  y += 8;
  doc.setDrawColor(190);
  doc.line(left, y, right, y);
  y += 8;

  const entries = entriesResult.data ?? [];
  if (entries.length === 0) {
    doc.setFontSize(10);
    doc.text("Aucun incident, adaptation ou note de suivi enregistré pour cette session.", left, y);
  } else {
    for (const [index, entry] of entries.entries()) {
      if (y > 260) {
        doc.addPage();
        y = 18;
      }
      const typeLabel = entry.entry_type === "incident" ? "Incident" : entry.entry_type === "adaptation" ? "Adaptation" : "Note de suivi";
      const levelLabel = entry.level === "critical" ? "Critique" : entry.level === "attention" ? "À suivre" : "Information";
      const statusLabel = entry.status === "resolved" ? "Traité" : "Ouvert";
      const learner = entry.enrolment_id ? learnerByEnrolment.get(entry.enrolment_id) ?? "Apprenant lié" : "Toute la session";

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      y = addWrappedText(doc, `${index + 1}. ${safeText(entry.summary, "Suivi")}`, left, y, width);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      y = addWrappedText(doc, `${typeLabel} · ${levelLabel} · ${statusLabel} · ${formatDate(entry.occurred_at)}`, left, y + 1, width);
      y = addWrappedText(doc, `Périmètre : ${learner}`, left, y, width);
      if (entry.description) y = addWrappedText(doc, `Constat : ${entry.description}`, left, y, width);
      y = addWrappedText(doc, `Action : ${safeText(entry.action_taken, "À renseigner")}`, left, y, width);
      if (entry.status === "resolved") y = addWrappedText(doc, `Résolution : ${formatDate(entry.resolved_at)}`, left, y, width);
      y = addWrappedText(doc, `Auteur : ${safeText(entry.author_name || entry.author_role)}`, left, y, width);
      y += 4;
      doc.setDrawColor(220);
      doc.line(left, y, right, y);
      y += 6;
    }
  }

  const generatedAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Généré depuis Selen Studio le ${generatedAt}. Source : daily_session_followup_entries.`, left, 287);

  const output = doc.output("arraybuffer");
  const ref = safeText(session.internal_reference, "session").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "session";
  return new NextResponse(output, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fiche-suivi-${ref}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
