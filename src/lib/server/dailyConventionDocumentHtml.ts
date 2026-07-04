const VAT_RATE = 0.2;

export type DailyConventionDocumentData = {
  generatedAt: Date;
  conventionType: "beneficiary" | "company";
  organisationName: string;
  organisationAddress: string;
  organisationEmail: string;
  organisationPhone: string;
  organisationSiret: string;
  organisationNda: string;
  clientName: string;
  clientAddress: string;
  clientSiret: string;
  clientRepresentative: string;
  beneficiaryName: string;
  beneficiaryEmail: string;
  formationTitle: string;
  formationObjective: string;
  targetAudience: string;
  prerequisites: string;
  durationHours: string;
  durationDays: string;
  modality: string;
  modalityDetails: string;
  schedule: string;
  location: string;
  price: string;
  pedagogicalResources: string;
  evaluationMethods: string;
  accessibility: string;
  usefulRegistrationInfo: string;
  signaturePlace: string;
  signatureDate: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function escapeHtml(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function display(value: unknown, fallback = "Non renseigne") {
  return escapeHtml(clean(value) || fallback);
}

function displayMultiline(value: unknown, fallback = "Non renseigne") {
  return display(value, fallback).replaceAll("\n", "<br />");
}

function parseAmount(value: unknown) {
  const amount = Number(clean(value).replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function formatEuro(value: number | null) {
  if (value === null) return "Non renseigne";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function amountParts(price: unknown) {
  const ttc = parseAmount(price);
  if (ttc === null) return { ht: null, tva: null, ttc: null };
  const ht = ttc / (1 + VAT_RATE);
  return { ht, tva: ttc - ht, ttc };
}

export function buildDailyConventionDocumentHtml(data: DailyConventionDocumentData) {
  const generatedDate = data.generatedAt.toLocaleDateString("fr-FR");
  const amounts = amountParts(data.price);
  const clientLabel = data.conventionType === "company" ? "Entreprise beneficiaire" : "Beneficiaire individuel";

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>Convention de formation - ${display(data.formationTitle)}</title>
    <style>
      @page WordSection1 { size: 21cm 29.7cm; margin: 2.1cm 1.9cm 2cm 1.9cm; }
      body { font-family: Georgia, "Times New Roman", serif; color: #2a2a28; line-height: 1.45; font-size: 11pt; margin: 0; }
      div.WordSection1 { page: WordSection1; }
      h1, h2, h3 { font-family: Arial, Helvetica, sans-serif; color: #27333a; }
      h1 { font-size: 22pt; text-align: center; margin: 0 0 12pt; }
      h2 { font-size: 14pt; border-bottom: 1pt solid #b8afa3; padding-bottom: 5pt; margin-top: 22pt; margin-bottom: 10pt; }
      p { margin: 6pt 0; }
      .cover { border: 1.5pt solid #b8afa3; background: #fbfaf7; padding: 28pt; margin-bottom: 24pt; text-align: center; }
      .small { font-size: 9.5pt; color: #5d5a55; }
      .signature-table { width: 100%; border-collapse: collapse; margin-top: 28pt; page-break-inside: avoid; }
      .signature-table td { width: 50%; vertical-align: top; border: 1pt solid #d5d0c8; padding: 14pt; }
      .signature-space { height: 150pt; border-top: 1pt solid #d5d0c8; margin-top: 22pt; }
      .footer { border-top: 1pt solid #c8c1b8; color: #5d5a55; font-size: 8.5pt; margin-top: 28pt; padding-top: 10pt; line-height: 1.35; }
    </style>
  </head>
  <body>
    <div class="WordSection1">
      <div class="cover">
        <h1>Convention de formation professionnelle</h1>
        <p class="small">Article L.6353-1 du code du travail</p>
        <p>Formation : <strong>${display(data.formationTitle)}</strong></p>
        <p>${display(data.organisationName)}<br />${displayMultiline(data.organisationAddress)}<br />${display(data.organisationEmail)} - ${display(data.organisationPhone)}</p>
      </div>

      <h2>Entre les soussignes</h2>
      <p><strong>${display(data.organisationName)}</strong>, organisme de formation situe : ${displayMultiline(data.organisationAddress)}, SIRET : ${display(data.organisationSiret)}, NDA : ${display(data.organisationNda, "en cours d'enregistrement")}.</p>
      <p>Et <strong>${display(data.clientName)}</strong>, ${clientLabel}, adresse : ${displayMultiline(data.clientAddress)}, SIRET : ${display(data.clientSiret)}.</p>
      <p>Representant : ${display(data.clientRepresentative)}.</p>

      <h2>Objet</h2>
      <p>L'organisme de formation s'engage a dispenser l'action de formation intitulee : <strong>${display(data.formationTitle)}</strong>.</p>
      <p>Beneficiaire concerne : ${display(data.beneficiaryName)} - ${display(data.beneficiaryEmail)}.</p>

      <h2>Programme et objectifs</h2>
      <p><strong>Objectif global :</strong> ${displayMultiline(data.formationObjective)}</p>
      <p><strong>Public vise :</strong> ${displayMultiline(data.targetAudience)}</p>
      <p><strong>Prerequis :</strong> ${displayMultiline(data.prerequisites)}</p>
      <p><strong>Moyens pedagogiques :</strong> ${displayMultiline(data.pedagogicalResources)}</p>
      <p><strong>Evaluation :</strong> ${displayMultiline(data.evaluationMethods)}</p>

      <h2>Modalites pratiques</h2>
      <p>Modalite : ${display(data.modality)} - ${displayMultiline(data.modalityDetails)}</p>
      <p>Duree : ${display(data.durationHours)} heure(s), soit ${display(data.durationDays)} jour(s).</p>
      <p>Dates et horaires : ${displayMultiline(data.schedule)}</p>
      <p>Lieu ou lien : ${displayMultiline(data.location)}</p>

      <h2>Analyse du besoin et accessibilite</h2>
      <p>${displayMultiline(data.usefulRegistrationInfo)}</p>
      <p>Accessibilite : ${displayMultiline(data.accessibility)}</p>

      <h2>Dispositions financieres</h2>
      <ul>
        <li>Frais pedagogiques : ${escapeHtml(formatEuro(amounts.ht))} HT</li>
        <li>TVA : ${escapeHtml(formatEuro(amounts.tva))}</li>
        <li>Total : ${escapeHtml(formatEuro(amounts.ttc))} TTC</li>
      </ul>

      <h2>Signatures</h2>
      <p>Fait a : ${display(data.signaturePlace)}<br />Le : ${display(data.signatureDate)}</p>
      <table class="signature-table">
        <tr>
          <td><p><strong>Pour l'organisme de formation</strong></p><p>${display(data.organisationName)}</p><p>Signature precedee de la mention Lu et approuve :</p><div class="signature-space">&nbsp;</div></td>
          <td><p><strong>Pour ${display(data.clientName)}</strong></p><p>Signature precedee de la mention Lu et approuve :</p><div class="signature-space">&nbsp;</div></td>
        </tr>
      </table>

      <div class="footer">
        ${display(data.organisationName)} - ${display(data.organisationAddress)} - ${display(data.organisationEmail)} - Document genere le ${escapeHtml(generatedDate)}
      </div>
    </div>
  </body>
</html>`;
}
