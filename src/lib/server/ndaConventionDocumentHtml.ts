import type { NdaDocumentContext } from "@/lib/server/ndaDocumentContext";

const VAT_RATE = 0.2;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function display(value: unknown, fallback = "Non renseigné") {
  const normalized = cleanText(value);
  return escapeHtml(normalized || fallback);
}

function displayMultiline(value: unknown, fallback = "Non renseigné") {
  return display(value, fallback).replaceAll("\n", "<br />");
}

function displayDate(value: unknown) {
  const normalized = cleanText(value);

  if (!normalized) return "Non renseigné";

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(normalized);
  }

  return escapeHtml(date.toLocaleDateString("fr-FR"));
}

function displayDateRange(start: unknown, end: unknown) {
  return `du ${displayDate(start)} au ${displayDate(end)}`;
}

function fullName(firstName?: unknown, lastName?: unknown) {
  return [firstName, lastName].map(cleanText).filter(Boolean).join(" ");
}

function parseAmount(value: unknown) {
  const normalized = cleanText(value).replace(/\s/g, "").replace(",", ".");

  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function formatEuro(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Non renseigné";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function buildAmounts(tarifTtc: unknown) {
  const totalTtc = parseAmount(tarifTtc);

  if (totalTtc === null) {
    return {
      ht: null,
      tva: null,
      ttc: null,
    };
  }

  const ht = totalTtc / (1 + VAT_RATE);
  const tva = totalTtc - ht;

  return {
    ht,
    tva,
    ttc: totalTtc,
  };
}

export function buildNdaConventionDocumentHtml({
  context,
  generatedAt = new Date(),
}: {
  context: NdaDocumentContext;
  generatedAt?: Date;
}) {
  const { organisation, variables, latestProgramVersion } = context;

  const generatedDate = generatedAt.toLocaleDateString("fr-FR");

  const organismeNom = cleanText(organisation?.name);
  const organismeAdresse =
    cleanText(organisation?.address) || cleanText(variables?.organisme_adresse);
  const organismeTelephone = cleanText(organisation?.phone);
  const organismeEmail = cleanText(organisation?.email);
  const organismeSiret =
    cleanText(organisation?.siret) || cleanText(variables?.siret);
  const numeroNda =
    cleanText(organisation?.nda_number) || "en cours d’enregistrement";

  const representantNomComplet = fullName(
    variables?.representant_prenom,
    variables?.representant_nom,
  );

  const clientRepresentantNomComplet = fullName(
    variables?.client_representant_prenom,
    variables?.client_representant_nom,
  );

  const stagiaireNomComplet = fullName(
    variables?.stagiaire_prenom,
    variables?.stagiaire_nom,
  );

  const formateurNomComplet = fullName(
    variables?.formateur_prenom,
    variables?.formateur_nom,
  );

  const formationDatePrevue = displayDateRange(
    variables?.date_formation_prevue,
    variables?.date_fin_formation,
  );

  const amounts = buildAmounts(variables?.tarif_formation);

  const replacements: Record<string, string> = {
    formation_intitule: display(
      variables?.intitule_formation || latestProgramVersion?.title,
    ),

    organisme_nom: display(organismeNom),
    organisme_adresse: displayMultiline(organismeAdresse),
    organisme_telephone: display(organismeTelephone),
    organisme_email: display(organismeEmail),
    organisme_siret: display(organismeSiret),
    numero_nda: display(numeroNda),
    representant_nom_complet: display(representantNomComplet),

    client_nom: display(variables?.client_nom),
    client_adresse: displayMultiline(variables?.client_adresse),
    client_siret: display(variables?.client_siret),
    client_representant_nom_complet: display(clientRepresentantNomComplet),

    stagiaire_nom_complet: display(stagiaireNomComplet),
    stagiaire_fonction: display(variables?.stagiaire_fonction),
    stagiaire_email: display(variables?.stagiaire_email),

    programme_public_vise: displayMultiline(
      latestProgramVersion?.target_audience,
    ),
    programme_objectif_global: displayMultiline(
      latestProgramVersion?.overall_objective,
    ),
    programme_modalites_pedagogiques: "Alternance de théorie et de pratique.",
    programme_modalites_evaluation:
      "Questionnaire, exercices pratiques, mises en situation ou évaluation des acquis permettant de vérifier l’atteinte des objectifs de formation.",

    formation_modalite: display(variables?.modalite),
    formation_date_prevue: escapeHtml(formationDatePrevue),
    formation_duree: display(variables?.duree_formation),
    formation_lieu: displayMultiline(variables?.lieu_formation),

    formateur_nom_complet: display(formateurNomComplet),
    formateur_email: display(variables?.formateur_email),

    formation_tarif: escapeHtml(`${formatEuro(amounts.ht)} HT`),
    tva: escapeHtml(formatEuro(amounts.tva)),
    formation_total: escapeHtml(`${formatEuro(amounts.ttc)} TTC`),

    lieu_signature_convention: display(variables?.lieu_signature_convention),
    date_signature_convention: displayDate(
      variables?.date_signature_convention,
    ),
  };

  function variable(name: string) {
    return replacements[name] ?? `<span style="color:red;">{{${name}}}</span>`;
  }

  const footerParts = [
    variable("organisme_nom"),
    variable("organisme_adresse"),
    `NDA ${variable("numero_nda")}`,
    "cet enregistrement ne vaut pas agrément de l’État",
    variable("organisme_email"),
    variable("organisme_telephone"),
    `Document actualisé le ${escapeHtml(generatedDate)}`,
  ];

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>Convention de formation professionnelle - ${variable(
      "formation_intitule",
    )}</title>
    <style>
      @page WordSection1 {
        size: 21cm 29.7cm;
        margin: 2.1cm 1.9cm 2cm 1.9cm;
      }

      body {
        font-family: "Georgia", "Times New Roman", serif;
        color: #2a2a28;
        background: #ffffff;
        line-height: 1.45;
        font-size: 11pt;
        margin: 0;
      }

      div.WordSection1 {
        page: WordSection1;
      }

      h1, h2, h3 {
        font-family: "Arial", "Helvetica", sans-serif;
        color: #27333a;
      }

      h1 {
        font-size: 22pt;
        text-align: center;
        margin: 0 0 12pt;
      }

      h2 {
        font-size: 14pt;
        border-bottom: 1pt solid #b8afa3;
        padding-bottom: 5pt;
        margin-top: 22pt;
        margin-bottom: 10pt;
      }

      h3 {
        font-size: 12pt;
        margin-top: 14pt;
        margin-bottom: 8pt;
      }

      p {
        margin: 6pt 0;
      }

      .cover {
        border: 1.5pt solid #b8afa3;
        background: #fbfaf7;
        padding: 28pt;
        margin-bottom: 24pt;
        text-align: center;
      }

      .cover-subtitle {
        font-size: 13pt;
        color: #574837;
        margin-top: 14pt;
      }

      .small {
        font-size: 9.5pt;
        color: #5d5a55;
      }

      .signature-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 28pt;
  page-break-inside: avoid;
}

.signature-table td {
  width: 50%;
  vertical-align: top;
  border: 1pt solid #d5d0c8;
  padding: 14pt;
}

.signature-content {
  min-height: 95pt;
}

.signature-space-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 22pt;
}

.signature-space-table td {
  height: 230pt;
  mso-height-rule: exactly;
  border: none;
  border-top: 1pt solid #d5d0c8;
  padding: 0;
}

      .annexe {
        margin-top: 22pt;
        padding-top: 8pt;
        border-top: 1pt solid #d5d0c8;
      }

      .footer {
        border-top: 1pt solid #c8c1b8;
        color: #5d5a55;
        font-size: 8.5pt;
        margin-top: 28pt;
        padding-top: 10pt;
        line-height: 1.35;
      }
    </style>
  </head>

  <body>
    <div class="WordSection1">
      <div class="cover">
        <h1>Convention de formation professionnelle</h1>
        <p class="small">
          Article L.6353-1 du code du travail<br />
          Décret n° 2018-1341 du 28 décembre 2018
        </p>

        <p class="cover-subtitle">Proposition de formation :</p>
        <p><strong>${variable("formation_intitule")}</strong></p>

        <p style="margin-top: 24pt;">
          Pour toute question, modification de la formation ou précision relative
          aux éléments de son contenu, le bénéficiaire peut contacter l’organisme
          de formation aux coordonnées suivantes :
        </p>

        <p>
          ${variable("organisme_nom")}<br />
          ${variable("organisme_adresse")}<br />
          ${variable("organisme_telephone")}<br />
          ${variable("organisme_email")}
        </p>

        <p style="margin-top: 24pt;">Nous nous tenons à votre disposition pour tout élément complémentaire.</p>
      </div>

      <h1>Convention de formation professionnelle continue</h1>

      <h2>Entre les soussignés</h2>

      <p>
        <strong>${variable("organisme_nom")}</strong>, organisme de formation
        dont le siège social est situé à : ${variable("organisme_adresse")},
        immatriculé sous le n° de SIRET : ${variable("organisme_siret")}.
      </p>

      <p>
        Organisme de formation enregistré sous le numéro ${variable("numero_nda")}.
      </p>

      <p>
        Représenté aux fins des présentes par ${variable(
          "representant_nom_complet",
        )}, gérant dûment habilité.
      </p>

      <p>Ci-après désigné « l’Organisme de Formation », de première part,</p>

      <p>
        Et <strong>${variable("client_nom")}</strong>, dont le siège social ou
        l’adresse professionnelle est situé(e) à : ${variable("client_adresse")},
        immatriculé(e) sous le numéro SIRET : ${variable("client_siret")}.
      </p>

      <p>
        Représenté(e) par : ${variable(
          "client_representant_nom_complet",
        )}, dûment habilité(e).
      </p>

      <p>
        Ci-après désignée « l’Entreprise Bénéficiaire », de seconde part.
      </p>

      <p>
        Les soussignés étant ci-après désignés ensemble « les Parties ».
      </p>

      <h2>Préambule</h2>

      <p>
        L’Entreprise Bénéficiaire, après avoir procédé à une étude des besoins de
        son personnel en matière de formation professionnelle continue, a décidé
        de financer, au profit de partie de son personnel et en accord avec ce
        dernier, des actions de formation prévues aux articles L.6313-1 et
        suivants du Code du travail, organisées par l’Organisme de Formation.
      </p>

      <p>
        Pour toutes les questions qui ne seraient pas réglées par la présente
        convention, les Parties déclarent expressément se référer aux Conditions
        Générales de Formation. En cas de contradiction entre une disposition des
        Conditions Générales et la présente Convention, cette dernière prévaudra.
      </p>

      <h2>Article 1 — Objet de la convention</h2>

      <p>
        En exécution de la présente convention, l’Organisme de Formation s’engage
        à dispenser, sous sa responsabilité, l’action de formation intitulée :
      </p>

      <p><strong>${variable("formation_intitule")}</strong></p>

      <p>
        Cette action de formation est réalisée au bénéfice du stagiaire suivant :
        ${variable("stagiaire_nom_complet")}.
      </p>

      <h2>Article 2 — Nature de l’action de formation</h2>

      <p>
        La formation s’inscrit dans le cadre des actions de formation prévues par
        les articles L.6313-1 et suivants du Code du travail. Elle constitue une
        action concourant au développement des compétences.
      </p>

      <p>
        Nature de l’action : action de formation — acquisition, entretien ou
        perfectionnement des connaissances.
      </p>

      <h2>Article 3 — Public concerné et effectif</h2>

      <p>
        La formation est réalisée à destination du public suivant :
      </p>

      <p>${variable("programme_public_vise")}</p>

      <p>
        Elle est organisée pour un effectif de 1 stagiaire :
        ${variable("stagiaire_nom_complet")}.
      </p>

      <p>Cf. liste des personnes jointe en annexe 1.</p>

      <h2>Article 4 — Objectifs de la formation</h2>

      <p>La formation a pour objectif :</p>

      <p>${variable("programme_objectif_global")}</p>

      <p>
        À l’issue de la formation, le bénéficiaire devra être capable de mobiliser
        les compétences décrites dans le programme de formation joint à la présente
        convention.
      </p>

      <h2>Article 5 — Programme, méthodes et moyens pédagogiques</h2>

      <p>
        Le programme détaillé de la formation intitulée
        <strong>${variable("formation_intitule")}</strong> est joint à la présente
        convention en annexe 2.
      </p>

      <p>
        Les méthodes et moyens pédagogiques mobilisés sont les suivants :
        ${variable("programme_modalites_pedagogiques")}
      </p>

      <p>
        La formation se déroule selon la modalité suivante :
        ${variable("formation_modalite")}
      </p>

      <h2>Article 6 — Modalités pratiques de réalisation de la formation</h2>

      <h3>6.1 Date et durée de la formation</h3>

      <p>
        La formation se déroulera à la date ou sur la période suivante :
        ${variable("formation_date_prevue")}
      </p>

      <p>
        Durée totale de la formation : ${variable("formation_duree")}
      </p>

      <h3>6.2 Lieu ou lien de formation</h3>

      <p>
        La formation se déroulera : ${variable("formation_lieu")}
      </p>

      <p>
        Lorsque la formation se déroule à distance, le lien de connexion devra
        être communiqué au stagiaire avant le début de la formation.
      </p>

      <h3>6.3 Formateur</h3>

      <p>
        La formation sera animée par : ${variable("formateur_nom_complet")}
      </p>

      <p>
        Email du formateur : ${variable("formateur_email")}
      </p>

      <p>Le CV du formateur est joint au dossier.</p>

      <h2>Article 7 — Modalités d’évaluation et de suivi</h2>

      <p>
        Le contrôle des connaissances permettant de vérifier le niveau acquis par
        le stagiaire est effectué selon les modalités suivantes :
      </p>

      <p>${variable("programme_modalites_evaluation")}</p>

      <p>
        À l’issue de la formation, l’Organisme de Formation délivrera au stagiaire
        une attestation mentionnant les objectifs, la nature et la durée de
        l’action, ainsi que les résultats de l’évaluation des acquis.
      </p>

      <p>
        Les moyens permettant de suivre l’exécution de l’action sont les suivants :
      </p>

      <ul>
        <li>Feuilles d’émargement signées par le stagiaire et le formateur ;</li>
        <li>Éléments de suivi de l’assiduité ;</li>
        <li>Évaluations réalisées pendant ou à l’issue de la formation ;</li>
        <li>Attestation de fin de formation.</li>
      </ul>

      <h2>Article 8 — Dispositions financières</h2>

      <p>
        Au titre de l’action de formation dispensée, l’Entreprise Bénéficiaire
        s’engage à régler à l’Organisme de Formation les frais suivants :
      </p>

      <ul>
        <li>Frais pédagogiques : ${variable("formation_tarif")}</li>
        <li>Nombre de stagiaires : 1</li>
        <li>TVA : ${variable("tva")}</li>
        <li>Total : ${variable("formation_total")}</li>
      </ul>

      <p>
        Cette somme couvre l’intégralité des frais engagés par l’Organisme de
        Formation pour cette session.
      </p>

      <p>À défaut de précision contraire, le paiement est dû à réception de la facture.</p>

      <h2>Article 9 — Délai de rétractation</h2>

      <p>
        Cette convention s’appuie sur les principes de liberté contractuelle et de
        force obligatoire de la convention, tels qu’énoncés dans les articles 1101
        et suivants du Code civil, adaptés au contexte professionnel et aux
        spécificités des services de formation professionnelle.
      </p>

      <p>
        Conventions non conclues à distance ou hors établissement : délai de
        rétractation applicable de 10 jours, à compter du jour de la conclusion de
        la convention.
      </p>

      <p>
        Conventions conclues à distance ou hors établissement : délai de
        rétractation applicable de 14 jours, à compter du jour de la conclusion de
        la convention.
      </p>

      <h2>Article 10 — Conditions de facturation</h2>

      <p>
        L’Organisme de Formation adressera à l’Entreprise Bénéficiaire les factures
        ainsi que les pièces justificatives correspondantes.
      </p>

      <p>
        L’Organisme de Formation s’engage à conserver les éléments permettant de
        démontrer la réalisation, le suivi et, le cas échéant, l’évaluation de
        l’action de formation.
      </p>

      <h2>Article 11 — Pénalités de retard</h2>

      <p>
        Pour toute somme non payée à l’échéance prévue, l’Entreprise Bénéficiaire
        sera de plein droit redevable de pénalités de retard calculées
        conformément aux dispositions légales applicables, ainsi que d’une
        indemnité forfaitaire pour frais de recouvrement d’un montant de 40 €.
      </p>

      <h2>Article 12 — Réalisation et résiliation de la formation</h2>

      <h3>12.1 Réalisation de l’action de formation</h3>

      <p>
        En contrepartie des sommes reçues, l’Organisme de Formation s’engage à
        réaliser l’action de formation prévue dans la présente convention et à
        fournir les documents permettant de justifier sa réalisation.
      </p>

      <h3>12.2 Inexécution totale ou partielle</h3>

      <p>
        En cas d’inexécution totale ou partielle de la prestation, seules les
        prestations effectivement réalisées pourront donner lieu à facturation.
      </p>

      <h3>12.3 Annulation du fait de l’Entreprise Bénéficiaire</h3>

      <p>
        En cas d’annulation par l’Entreprise Bénéficiaire, les conditions suivantes
        s’appliquent :
      </p>

      <ul>
        <li>Moins de 2 semaines mais plus d’une semaine avant la formation : 50 % du coût de la formation ;</li>
        <li>Moins d’une semaine mais plus de 48 heures avant la formation : 75 % du coût de la formation ;</li>
        <li>Moins de 48 heures avant la formation : 100 % du coût de la formation.</li>
      </ul>

      <h3>12.4 Annulation du fait de l’Organisme de Formation</h3>

      <p>
        Si l’Organisme de Formation était exceptionnellement contraint d’annuler
        ou d’interrompre l’action, l’Entreprise Bénéficiaire en serait informée
        dans les meilleurs délais afin de convenir d’un report ou d’une solution
        adaptée.
      </p>

      <h2>Article 13 — Documentation pédagogique</h2>

      <p>
        L’ensemble des programmes de formation et de la documentation pédagogique
        de l’Organisme de Formation constitue une œuvre protégée par le Code de la
        propriété intellectuelle.
      </p>

      <p>
        L’Entreprise Bénéficiaire et le stagiaire s’engagent à ne pas reproduire,
        communiquer, diffuser ou modifier ces supports, en tout ou partie, sans
        accord préalable écrit de l’Organisme de Formation.
      </p>

      <h2>Article 14 — Accessibilité et handicap</h2>

      <p>
        Les formations dispensées par ${variable("organisme_nom")} sont accessibles
        aux personnes en situation de handicap.
      </p>

      <p>
        Lors de l’inscription à la formation, l’Organisme de Formation étudie avec
        le bénéficiaire les adaptations pouvant être mises en place afin de
        favoriser le bon déroulement de la formation.
      </p>

      <p>
        Lorsque cela est nécessaire, l’Organisme de Formation peut s’appuyer sur un
        réseau de partenaires spécialisés.
      </p>

      <h2>Article 15 — Médiation et règlement des litiges</h2>

      <p>
        En cas de différend relatif à l’interprétation ou à l’exécution de la
        présente convention, les Parties s’efforceront de rechercher une solution
        amiable.
      </p>

      <p>
        À défaut d’accord amiable, le litige sera porté devant la juridiction
        compétente.
      </p>

      <p>
        Lorsque les dispositions relatives à la médiation de la consommation sont
        applicables, le bénéficiaire peut recourir gratuitement à un médiateur de
        la consommation, dans les conditions prévues par la réglementation en
        vigueur.
      </p>

      <h2>Signatures</h2>

      <p>
        Fait en deux exemplaires originaux, dont un remis à chacune des Parties.
      </p>

      <p>
        Fait à : ${variable("lieu_signature_convention")}<br />
        Le : ${variable("date_signature_convention")}
      </p>

      <table class="signature-table">
  <tr>
    <td>
      <div class="signature-content">
        <p><strong>Pour l’Organisme de Formation</strong></p>
        <p>${variable("organisme_nom")}</p>
        <p>Représenté par : ${variable("representant_nom_complet")}</p>
        <p>Signature précédée de la mention « Lu et approuvé » :</p>
      </div>

      <table class="signature-space-table">
        <tr>
          <td>&nbsp;</td>
        </tr>
      </table>
    </td>

    <td>
      <div class="signature-content">
        <p><strong>Pour l’Entreprise Bénéficiaire</strong></p>
        <p>${variable("client_nom")}</p>
        <p>Représenté par : ${variable("client_representant_nom_complet")}</p>
        <p>Signature précédée de la mention « Lu et approuvé » :</p>
      </div>

      <table class="signature-space-table">
        <tr>
          <td>&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

      <div class="annexe">
        <h2>Annexe 1 — Liste des stagiaires</h2>

        <p>Stagiaire concerné par la formation : ${variable("stagiaire_nom_complet")}</p>
        <p>Fonction : ${variable("stagiaire_fonction")}</p>
        <p>Email : ${variable("stagiaire_email")}</p>
      </div>

      <div class="annexe">
        <h2>Annexe 2 — Programme de formation</h2>

        <p>
          Le programme détaillé de la formation ${variable(
            "formation_intitule",
          )} est joint à la présente convention dans un document séparé.
        </p>
      </div>

      <div class="annexe">
        <h2>Annexe 3 — Règlement intérieur</h2>

        <p>
          Le règlement intérieur applicable aux stagiaires est remis au stagiaire
          avant le début de la formation.
        </p>
      </div>

      <div class="footer">
        ${footerParts.join(" — ")}
      </div>
    </div>
  </body>
</html>`;
}
