import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  renderSelenEmailFromText,
} from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import {
  INVOICE_TYPES,
  centsToEuros,
  eurosToCents,
  invoiceTypeLabel,
  type LilInvoiceLine,
  type LilInvoiceStatus,
  type LilInvoiceType,
} from "@/lib/lilInvoiceShared";

export { INVOICE_TYPES, centsToEuros, eurosToCents, invoiceTypeLabel };
export type { LilInvoiceLine, LilInvoiceStatus, LilInvoiceType };

export type LilInvoiceSettings = {
  id: boolean;
  business_name: string;
  legal_form: string | null;
  activity: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  siren_siret: string | null;
  rcs_rm_exemption: string | null;
  phone: string | null;
  email: string;
  paypal_email: string | null;
  iban: string | null;
  bic: string | null;
  vat_status: string;
  late_penalty_rate: string;
  recovery_fee_cents: number;
  payment_terms: string;
  legal_mentions: string | null;
  metadata: Record<string, unknown>;
};

export type LilBillingProfile = {
  id: string;
  normalized_name: string;
  name: string;
  legal_form: string | null;
  email: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  siren_siret: string | null;
  vat_number: string | null;
  phone: string | null;
  default_payment_terms: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LilInvoiceRow = {
  id: string;
  invoice_number: string | null;
  sequence_number: number | null;
  invoice_date: string;
  recipient_name: string;
  recipient_address: string | null;
  recipient_email: string | null;
  invoice_type: LilInvoiceType;
  status: LilInvoiceStatus;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  pdf_bucket: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  issued_at: string | null;
  sent_at: string | null;
  deposited_at: string | null;
  paid_at: string | null;
  email_sent_at: string | null;
  cancelled_at: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
  lines: LilInvoiceLine[];
  linked_audit_ids: string[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export const INVOICE_STORAGE_BUCKET = "selen-documents";
export const GOOGLE_DRIVE_INVOICE_FOLDER =
  "https://drive.google.com/drive/folders/1DawT2mz4m6pwRR3yvgWQVpJA5iU7R9Zi?usp=sharing";

const DEFAULT_LEGAL_MENTIONS =
  "Dispensé d'immatriculation au Registre du Commerce et des Sociétés (RCS) ainsi qu'au Registre National des Entreprises (RNE), conformément à l'article L.123-1-1 du Code de commerce.";

function settingText(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function formatInvoiceNumber(sequenceNumber: number) {
  return `F${String(sequenceNumber).padStart(6, "0")}`;
}

export function normalizeInvoiceLines(lines: LilInvoiceLine[]) {
  return lines
    .map((line) => {
      const quantity = Number.isFinite(Number(line.quantity))
        ? Math.max(1, Number(line.quantity))
        : 1;
      const unitAmountCents = Math.max(0, Math.round(Number(line.unitAmountCents) || 0));
      return {
        label: String(line.label ?? "").trim(),
        details: String(line.details ?? "").trim(),
        quantity,
        unitAmountCents,
        totalAmountCents: Math.round(quantity * unitAmountCents),
      };
    })
    .filter((line) => line.label && line.totalAmountCents >= 0);
}

export function invoiceTotals(lines: LilInvoiceLine[]) {
  const normalized = normalizeInvoiceLines(lines);
  const subtotalCents = normalized.reduce(
    (sum, line) => sum + line.totalAmountCents,
    0,
  );
  return { lines: normalized, subtotalCents, taxCents: 0, totalCents: subtotalCents };
}

export async function getLilInvoiceSettings() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lil_invoice_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return normalizeLilInvoiceSettings(data as LilInvoiceSettings);

  const { data: inserted, error: insertError } = await admin
    .from("lil_invoice_settings")
    .insert({ id: true })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);
  return normalizeLilInvoiceSettings(inserted as LilInvoiceSettings);
}

function normalizeLilInvoiceSettings(settings: LilInvoiceSettings): LilInvoiceSettings {
  return {
    ...settings,
    business_name: settingText(settings.business_name, "Pascale Barthaux"),
    legal_form: settingText(settings.legal_form, "Entreprise Individuelle (EI)"),
    activity: settingText(settings.activity, "Auditrice Qualiopi"),
    address: settingText(settings.address, "2 Voie de Troyes"),
    postal_code: settingText(settings.postal_code, "10700"),
    city: settingText(settings.city, "Torcy-le-Petit"),
    siren_siret: settingText(settings.siren_siret, "81772377800038"),
    iban: settingText(settings.iban, "FR76 4061 8805 1100 0405 1327 975"),
    vat_status: settingText(settings.vat_status, "TVA non applicable, art. 293 B du CGI."),
    payment_terms: settingText(settings.payment_terms, "Paiement a reception de facture"),
    late_penalty_rate: settingText(settings.late_penalty_rate, "Taux legal en vigueur"),
    recovery_fee_cents: Number.isFinite(Number(settings.recovery_fee_cents))
      ? settings.recovery_fee_cents
      : 4000,
    legal_mentions: settingText(settings.legal_mentions, DEFAULT_LEGAL_MENTIONS),
  };
}

export async function reserveNextInvoiceNumber() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("next_lil_invoice_number");
  if (error) throw new Error(error.message);
  const first = Array.isArray(data) ? data[0] : data;
  const sequenceNumber = Number(first?.sequence_number);
  if (!Number.isFinite(sequenceNumber)) {
    throw new Error("Numero de facture indisponible.");
  }
  return {
    sequenceNumber,
    invoiceNumber: String(first?.invoice_number || formatInvoiceNumber(sequenceNumber)),
  };
}

function pdfText(value?: string | null) {
  return value?.trim() || "-";
}

function formatDateFr(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function metadataText(invoice: LilInvoiceRow, key: string) {
  const value = invoice.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function addressLines(address: string | null | undefined, postalCode?: string, city?: string) {
  const base = address?.trim() ?? "";
  const locality = [postalCode?.trim(), city?.trim()].filter(Boolean).join(" ");
  if (!base) return locality ? [locality] : [];
  if (!locality || base.toLowerCase().includes(locality.toLowerCase())) return [base];
  return [base, locality];
}

export function generateLilInvoicePdfBuffer({
  invoice,
  settings,
}: {
  invoice: LilInvoiceRow;
  settings: LilInvoiceSettings;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const gold: [number, number, number] = [181, 126, 45];
  const sepia: [number, number, number] = [64, 43, 29];
  const soft: [number, number, number] = [252, 246, 235];

  doc.setFillColor(...soft);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), "F");
  doc.setFillColor(255, 251, 243);
  doc.roundedRect(margin / 2, margin / 2, pageWidth - margin, 760, 8, 8, "F");
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.line(margin, 88, pageWidth - margin, 88);

  doc.setTextColor(...sepia);
  doc.setFont("times", "bold");
  doc.setFontSize(28);
  doc.text("Facture", margin, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(invoice.invoice_number || "Brouillon", pageWidth - margin, 54, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Date : ${formatDateFr(invoice.invoice_date)}`, pageWidth - margin, 72, {
    align: "right",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Emetteur", margin, 120);
  doc.text("Destinataire", pageWidth / 2 + 16, 120);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    [
      settings.business_name,
      settings.legal_form || "",
      settings.activity,
      ...addressLines(settings.address, settings.postal_code ?? undefined, settings.city ?? undefined),
      settings.siren_siret ? `SIREN/SIRET : ${settings.siren_siret}` : "",
      settings.phone ? `Tel. : ${settings.phone}` : "",
      `Email : ${settings.email}`,
    ].filter(Boolean),
    margin,
    140,
    { maxWidth: 220, lineHeightFactor: 1.35 },
  );
  doc.text(
    [
      invoice.recipient_name,
      metadataText(invoice, "client_legal_form"),
      ...addressLines(
        invoice.recipient_address,
        metadataText(invoice, "client_postal_code"),
        metadataText(invoice, "client_city"),
      ),
      metadataText(invoice, "client_siren_siret")
        ? `SIREN/SIRET : ${metadataText(invoice, "client_siren_siret")}`
        : "",
      metadataText(invoice, "client_vat_number")
        ? `TVA intracom. : ${metadataText(invoice, "client_vat_number")}`
        : "",
      metadataText(invoice, "client_phone")
        ? `Tel. : ${metadataText(invoice, "client_phone")}`
        : "",
      invoice.recipient_email ? `Email : ${invoice.recipient_email}` : "",
    ].filter(Boolean),
    pageWidth / 2 + 16,
    140,
    { maxWidth: 220, lineHeightFactor: 1.35 },
  );

  autoTable(doc, {
    startY: 245,
    margin: { left: margin, right: margin },
    head: [["Designation", "Qte", "PU HT", "Total HT"]],
    body: invoice.lines.map((line) => [
      [line.label, line.details || ""].filter(Boolean).join("\n"),
      String(line.quantity),
      centsToEuros(line.unitAmountCents),
      centsToEuros(line.totalAmountCents),
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: 8,
      textColor: sepia,
      lineColor: [225, 204, 172],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [73, 48, 32],
      textColor: [255, 248, 232],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [253, 248, 239] },
    columnStyles: {
      1: { halign: "center", cellWidth: 42 },
      2: { halign: "right", cellWidth: 86 },
      3: { halign: "right", cellWidth: 92 },
    },
  });

  const tableEnd = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
    ?.finalY ?? 330;
  const totalsX = pageWidth - margin - 210;
  let y = tableEnd + 24;
  doc.setFillColor(255, 250, 240);
  doc.roundedRect(totalsX, y - 10, 210, 104, 6, 6, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Total HT", totalsX + 14, y + 10);
  doc.text(centsToEuros(invoice.subtotal_cents), totalsX + 196, y + 10, { align: "right" });
  doc.text("Total TVA", totalsX + 14, y + 32);
  doc.text(centsToEuros(invoice.tax_cents), totalsX + 196, y + 32, { align: "right" });
  doc.text("Total TTC", totalsX + 14, y + 54);
  doc.text(centsToEuros(invoice.total_cents), totalsX + 196, y + 54, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Net a payer", totalsX + 14, y + 82);
  doc.text(centsToEuros(invoice.total_cents), totalsX + 196, y + 82, { align: "right" });

  y += 122;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Modalites de paiement", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(
    [
      metadataText(invoice, "payment_terms") || settings.payment_terms,
      `Date d'echeance : ${metadataText(invoice, "due_date") || "A reception"}`,
      settings.iban ? `IBAN : ${settings.iban}` : "",
      settings.bic ? `BIC : ${settings.bic}` : "",
      settings.vat_status,
      `Penalites de retard : ${settings.late_penalty_rate}`,
      `Indemnite forfaitaire de recouvrement : ${centsToEuros(settings.recovery_fee_cents)}`,
      settings.legal_mentions || DEFAULT_LEGAL_MENTIONS,
    ].filter(Boolean),
    margin,
    y + 18,
    { maxWidth: pageWidth - margin * 2, lineHeightFactor: 1.35 },
  );

  return Buffer.from(doc.output("arraybuffer"));
}

export type InvoiceStorageResult = {
  provider: "supabase";
  bucket: string;
  path: string;
  publicUrl: string | null;
};

export const invoiceStorageProvider = {
  async storePdf({
    invoice,
    pdfBuffer,
  }: {
    invoice: LilInvoiceRow;
    pdfBuffer: Buffer;
  }): Promise<InvoiceStorageResult> {
    const admin = createSupabaseAdminClient();
    const number = invoice.invoice_number || `draft-${invoice.id}`;
    const path = `lil-invoices/${number}.pdf`;

    // TODO Google Drive: replace this Supabase implementation with an uploader
    // targeting GOOGLE_DRIVE_INVOICE_FOLDER when the Drive connector is wired.
    const { error } = await admin.storage
      .from(INVOICE_STORAGE_BUCKET)
      .upload(path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (error) throw new Error(`Stockage PDF facture impossible : ${error.message}`);

    const { data } = admin.storage.from(INVOICE_STORAGE_BUCKET).getPublicUrl(path);
    return {
      provider: "supabase",
      bucket: INVOICE_STORAGE_BUCKET,
      path,
      publicUrl: data.publicUrl || null,
    };
  },
};

export function buildLilInvoiceEmail({
  invoice,
  settings,
}: {
  invoice: LilInvoiceRow;
  settings: LilInvoiceSettings;
}) {
  const subject = `Facture ${invoice.invoice_number || ""} - ${settings.business_name}`.trim();
  const bodyText = [
    `Bonjour ${invoice.recipient_name},`,
    "Veuillez trouver ci-dessous votre facture.",
    `Numero : ${invoice.invoice_number || "-"}`,
    `Date : ${formatDateFr(invoice.invoice_date)}`,
    `Montant total : ${centsToEuros(invoice.total_cents)}`,
    invoice.pdf_url ? `Lien PDF : ${invoice.pdf_url}` : "",
    settings.payment_terms,
    settings.paypal_email ? `PayPal : ${settings.paypal_email}` : "",
    settings.iban ? `IBAN : ${settings.iban}` : "",
    settings.bic ? `BIC : ${settings.bic}` : "",
    settings.vat_status,
    "Bien cordialement,",
    settings.business_name,
  ]
    .filter(Boolean)
    .join("\n\n");
  const rendered = renderSelenEmailFromText({
    title: subject,
    bodyText,
    ctaLabel: invoice.pdf_url ? "Ouvrir la facture PDF" : undefined,
    ctaUrl: invoice.pdf_url || undefined,
  });

  return {
    to: invoice.recipient_email || "",
    subject,
    bodyText,
    html: rendered.html,
    text: rendered.text,
  };
}

export async function sendLilInvoiceEmail({
  invoice,
  settings,
}: {
  invoice: LilInvoiceRow;
  settings: LilInvoiceSettings;
}) {
  const email = buildLilInvoiceEmail({ invoice, settings });
  if (!email.to) {
    return { sent: false, error: "Email destinataire absent.", to: email.to };
  }

  const result = await sendClientEmailWithSilence({
    email: email.to,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  return { ...result, to: email.to };
}
