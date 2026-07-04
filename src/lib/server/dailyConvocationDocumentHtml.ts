export type DailyConvocationDocumentData = {
  generatedAt: Date;
  organisationName: string;
  organisationAddress: string;
  organisationEmail: string;
  organisationLogoUrl: string;
  formationTitle: string;
  durationHours: string;
  durationDays: string;
  modality: string;
  modalityDetails: string;
  schedule: string;
  location: string;
  trainerNames: string;
  recipientType: "beneficiary" | "company" | "trainer";
  recipientName: string;
  recipientEmail: string;
  companyName: string;
  beneficiaryName: string;
  practicalNotes: string;
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

function recipientLabel(type: DailyConvocationDocumentData["recipientType"]) {
  if (type === "company") return "Entreprise";
  if (type === "trainer") return "Formateur";
  return "Beneficiaire";
}

export function buildDailyConvocationDocumentHtml(data: DailyConvocationDocumentData) {
  const generatedDate = data.generatedAt.toLocaleDateString("fr-FR");
  const logo = clean(data.organisationLogoUrl)
    ? `<img src="${escapeHtml(data.organisationLogoUrl)}" alt="Logo" style="max-height:48pt; max-width:120pt; margin-bottom:12pt;" />`
    : "";

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>Convocation - ${display(data.formationTitle)}</title>
    <style>
      @page WordSection1 { size: 21cm 29.7cm; margin: 2cm; }
      body { font-family: Georgia, "Times New Roman", serif; color: #2a2a28; line-height: 1.45; font-size: 11pt; margin: 0; }
      div.WordSection1 { page: WordSection1; }
      h1, h2 { font-family: Arial, Helvetica, sans-serif; color: #27333a; }
      h1 { font-size: 22pt; margin: 0 0 10pt; }
      h2 { font-size: 13pt; border-bottom: 1pt solid #c8c1b8; padding-bottom: 5pt; margin-top: 22pt; }
      .header { border: 1.5pt solid #d5d0c8; background: #fbfaf7; padding: 22pt; margin-bottom: 22pt; }
      .small { font-size: 9.5pt; color: #5d5a55; }
      .box { border: 1pt solid #d5d0c8; padding: 12pt; margin: 10pt 0; }
      .footer { border-top: 1pt solid #c8c1b8; color: #5d5a55; font-size: 8.5pt; margin-top: 28pt; padding-top: 10pt; }
    </style>
  </head>
  <body>
    <div class="WordSection1">
      <div class="header">
        ${logo}
        <h1>Convocation a la formation</h1>
        <p class="small">Document genere par Selen Daily le ${escapeHtml(generatedDate)}</p>
        <p><strong>${display(data.organisationName)}</strong><br />${displayMultiline(data.organisationAddress)}<br />${display(data.organisationEmail)}</p>
      </div>

      <p>Bonjour,</p>
      <p>Nous vous adressons cette convocation a la demande de <strong>${display(data.organisationName)}</strong>.</p>
      <p>Vous etes convoque(e) a l'action de formation suivante :</p>

      <div class="box">
        <p><strong>Formation :</strong> ${display(data.formationTitle)}</p>
        <p><strong>${escapeHtml(recipientLabel(data.recipientType))} :</strong> ${display(data.recipientName)} ${data.recipientEmail ? `- ${display(data.recipientEmail)}` : ""}</p>
        ${data.companyName ? `<p><strong>Entreprise :</strong> ${display(data.companyName)}</p>` : ""}
        ${data.beneficiaryName ? `<p><strong>Beneficiaire :</strong> ${display(data.beneficiaryName)}</p>` : ""}
      </div>

      <h2>Informations pratiques</h2>
      <p><strong>Dates et horaires :</strong><br />${displayMultiline(data.schedule)}</p>
      <p><strong>Lieu ou acces distanciel :</strong><br />${displayMultiline(data.location)}</p>
      <p><strong>Modalite :</strong> ${display(data.modality)}<br />${displayMultiline(data.modalityDetails)}</p>
      <p><strong>Duree :</strong> ${display(data.durationHours)} heure(s), soit ${display(data.durationDays)} jour(s).</p>
      <p><strong>Formateur :</strong> ${display(data.trainerNames, "A confirmer")}</p>

      <h2>Preparation</h2>
      <p>${displayMultiline(data.practicalNotes, "Merci de vous presenter avec les elements utiles a votre participation. Les informations complementaires seront transmises par l'organisme de formation si necessaire.")}</p>

      <div class="footer">
        ${display(data.organisationName)} - ${display(data.organisationAddress)} - ${display(data.organisationEmail)}
      </div>
    </div>
  </body>
</html>`;
}
