"use client";

import { useState } from "react";
import { Download, FileArchive, RotateCcw } from "lucide-react";
import { jsPDF } from "jspdf";
import PizZip from "pizzip";

type FormState = {
  organismeNom: string;
  organismeAdresse: string;
  organismeSiret: string;
  organismeNda: string;
  organismeNdaRegion: string;
  organismeRepresentant: string;
  organismeEmail: string;
  organismeTelephone: string;
  dateActualisation: string;
  clientNom: string;
  clientAdresse: string;
  clientSiret: string;
  clientRepresentant: string;
  formationTitre: string;
  formationPublic: string;
  formationPrerequis: string;
  formationObjectifs: string;
  formationProgramme: string;
  formationMethodes: string;
  formationEvaluation: string;
  formationAccessibilite: string;
  formationDuree: string;
  formationModalite: string;
  dateDebut: string;
  dateFin: string;
  horaires: string;
  lieu: string;
  formateur: string;
  tarif: string;
  beneficiaires: string;
};

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return {
    organismeNom: "",
    organismeAdresse: "",
    organismeSiret: "",
    organismeNda: "",
    organismeNdaRegion: "",
    organismeRepresentant: "",
    organismeEmail: "",
    organismeTelephone: "",
    dateActualisation: todayInputValue(),
    clientNom: "",
    clientAdresse: "",
    clientSiret: "",
    clientRepresentant: "",
    formationTitre: "",
    formationPublic: "",
    formationPrerequis: "",
    formationObjectifs: "",
    formationProgramme: "",
    formationMethodes: "",
    formationEvaluation: "",
    formationAccessibilite: "",
    formationDuree: "",
    formationModalite: "",
    dateDebut: "",
    dateFin: "",
    horaires: "",
    lieu: "",
    formateur: "",
    tarif: "",
    beneficiaires: "",
  };
}

const M = 18;
const PAGE_H = 297;
const W = 174;
const CONTENT_BOTTOM = 260;
const FOOTER_TOP = 266;

function fallback(value: string, alt = "À compléter") {
  return value.trim() || alt;
}

function inline(value: string, alt = "À compléter") {
  return fallback(value, alt).replace(/\s+/g, " ").trim();
}

function dateFr(value: string) {
  if (!value) return "À compléter";
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("fr-FR");
}

function period(f: FormState) {
  const a = dateFr(f.dateDebut);
  const b = dateFr(f.dateFin || f.dateDebut);
  return a === b ? a : `${a} au ${b}`;
}

function people(value: string) {
  const list = value.split("\n").map((v) => v.trim()).filter(Boolean);
  return list.length ? list : ["Nom et prénom à compléter"];
}

function safe(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70) || "dossier";
}

function price(value: string) {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return value.trim() && !Number.isNaN(n)
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n)
    : fallback(value);
}

function allDates(start: string, end: string) {
  if (!start) return ["Date à compléter"];
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end || start}T12:00:00`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || first > last) return [dateFr(start)];
  const result: string[] = [];
  const d = new Date(first);
  let guard = 0;
  while (d <= last && guard < 60) {
    result.push(d.toLocaleDateString("fr-FR"));
    d.setDate(d.getDate() + 1);
    guard += 1;
  }
  return result;
}

function title(doc: jsPDF, value: string, subtitle?: string) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(130, 92, 35);
  const lines = doc.splitTextToSize(value, W) as string[];
  doc.text(lines, M, M);
  let y = M + Math.max(8, lines.length * 7);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    const sub = doc.splitTextToSize(subtitle, W) as string[];
    doc.text(sub, M, y);
    y += sub.length * 4 + 2;
  }
  doc.setDrawColor(190, 160, 105);
  doc.line(M, y, 192, y);
  return y + 8;
}

function newDoc(value: string, subtitle?: string) {
  const doc = new jsPDF();
  return { doc, y: title(doc, value, subtitle) };
}

function ensure(doc: jsPDF, y: number, need = 10) {
  if (y + need > CONTENT_BOTTOM) {
    doc.addPage();
    return M;
  }
  return y;
}

function text(doc: jsPDF, value: string, y: number, bold = false, size = 10, gap = 4) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(40);
  const lines = doc.splitTextToSize(fallback(value), W) as string[];
  for (const line of lines) {
    y = ensure(doc, y, 6);
    doc.text(line, M, y);
    y += size * 0.5;
  }
  return y + gap;
}

function section(doc: jsPDF, value: string, y: number) {
  y = ensure(doc, y, 13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(130, 92, 35);
  doc.text(value, M, y);
  return y + 7;
}

function field(doc: jsPDF, label: string, value: string, y: number) {
  y = text(doc, `${label} :`, y, true, 9, 1);
  return text(doc, value, y, false, 10, 3);
}

function blanks(doc: jsPDF, y: number, count = 3) {
  doc.setDrawColor(180);
  for (let i = 0; i < count; i += 1) {
    y = ensure(doc, y, 8);
    doc.line(M, y, 192, y);
    y += 8;
  }
  return y;
}

function signatures(doc: jsPDF, y: number, left: string, right: string) {
  y = ensure(doc, y, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40);
  doc.text(left, M, y);
  doc.text(right, 110, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Nom :", M, y + 7);
  doc.text("Nom :", 110, y + 7);
  doc.text("Date :", M, y + 14);
  doc.text("Date :", 110, y + 14);
  doc.text("Signature :", M, y + 21);
  doc.text("Signature :", 110, y + 21);
  doc.rect(M, y + 24, 74, 18);
  doc.rect(110, y + 24, 74, 18);
}

function addFooters(doc: jsPDF, f: FormState) {
  const lines = [
    `${inline(f.organismeNom)} · ${inline(f.organismeAdresse)}`,
    `SIRET : ${inline(f.organismeSiret)} · NDA : ${inline(f.organismeNda)} · Région d’enregistrement : ${inline(f.organismeNdaRegion)}`,
    `${inline(f.organismeEmail)} · ${inline(f.organismeTelephone)} · Document actualisé le ${dateFr(f.dateActualisation)}`,
  ];
  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    doc.setDrawColor(190, 160, 105);
    doc.setLineWidth(0.25);
    doc.line(M, FOOTER_TOP, 192, FOOTER_TOP);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(95, 95, 95);
    let y = FOOTER_TOP + 4;
    for (const logicalLine of lines) {
      const wrapped = doc.splitTextToSize(logicalLine, W) as string[];
      for (const footerLine of wrapped.slice(0, 2)) {
        doc.text(footerLine, M, y);
        y += 3.2;
      }
    }
  }
}

function appendReglementInterieur(doc: jsPDF, f: FormState, annexLabel = "Annexe — Règlement intérieur") {
  doc.addPage();
  let y = title(doc, annexLabel, `Applicable aux stagiaires accueillis par ${fallback(f.organismeNom)}`);
  y = text(doc, `Le présent règlement intérieur est établi pour les actions de formation organisées par ${fallback(f.organismeNom)}. Il s’applique à l’ensemble des stagiaires pendant toute la durée de leur formation. Il complète les règles propres au lieu d’accueil lorsqu’elles existent.`, y, false, 9);

  const blocks: Array<[string, string]> = [
    ["1. Objet et champ d’application", "Le règlement précise les règles générales relatives à la santé et à la sécurité, à la discipline et, lorsque la durée de l’action le justifie, à la représentation des stagiaires. Chaque stagiaire s’engage à le respecter dès son entrée en formation."],
    ["2. Règles du lieu d’accueil", "Lorsque la formation se déroule dans une entreprise, un établissement ou des locaux disposant de leurs propres consignes ou règlement intérieur, les règles de santé et de sécurité de ce lieu s’appliquent en priorité sur ces matières. Les stagiaires respectent les consignes affichées ou communiquées sur place."],
    ["3. Santé, sécurité et prévention", "Chaque stagiaire doit prendre soin de sa sécurité et de celle des autres, respecter les consignes de prévention, utiliser correctement les équipements mis à disposition et signaler sans délai au formateur ou à l’organisme toute situation présentant un risque, tout incident ou tout accident survenu pendant la formation ou à l’occasion de celle-ci."],
    ["4. Consignes d’urgence", "En cas d’alerte, d’incendie ou de situation nécessitant une évacuation, les stagiaires suivent immédiatement les instructions du responsable du lieu, du formateur ou des personnes chargées de la sécurité. Les accès, issues de secours et équipements de sécurité ne doivent jamais être encombrés ou détournés de leur usage."],
    ["5. Produits, alcool, tabac et comportement à risque", "Il est interdit de se présenter ou de demeurer en formation dans un état incompatible avec la sécurité ou le bon déroulement de la session. La consommation d’alcool ou de substances illicites pendant la formation est interdite. Les règles applicables au tabac et au vapotage sont celles du lieu d’accueil et de la réglementation en vigueur."],
    ["6. Utilisation des locaux, matériels et outils numériques", "Les locaux, équipements, supports, matériels pédagogiques et accès numériques sont utilisés uniquement dans le cadre de la formation et conformément aux instructions données. Toute dégradation volontaire, utilisation dangereuse, accès non autorisé ou détournement d’usage peut donner lieu à une mesure disciplinaire."],
    ["7. Assiduité, horaires et absences", `Les stagiaires respectent les horaires communiqués pour la session, soit ${fallback(f.horaires)}. Toute absence, retard ou départ anticipé doit être signalé au formateur ou à l’organisme dans les meilleurs délais et peut devoir être justifié. L’assiduité peut être constatée au moyen de feuilles d’émargement ou de tout autre dispositif prévu pour la modalité de formation.`],
    ["8. Comportement et respect des personnes", "Un comportement respectueux est attendu à l’égard des autres stagiaires, du formateur, des intervenants et de toute personne présente sur le lieu de formation. Les violences, menaces, insultes, comportements discriminatoires, faits de harcèlement, perturbations répétées ou atteintes aux biens sont incompatibles avec le déroulement de la formation."],
    ["9. Égalité de traitement, liberté de conscience et neutralité", "L’organisme veille à l’égalité de traitement des stagiaires. Il respecte leur liberté d’expression et de conscience dans les limites nécessaires au bon déroulement de la formation, au respect d’autrui et des règles applicables. Lorsque les obligations légales liées au financement de l’action l’exigent, les enseignements sont dispensés dans le respect du principe de neutralité."],
    ["10. Confidentialité et propriété des supports", "Les informations confidentielles obtenues à l’occasion de la formation ne doivent pas être diffusées sans autorisation. Les supports pédagogiques remis ou accessibles restent soumis aux droits de leurs auteurs et ne peuvent être reproduits ou diffusés au-delà des usages autorisés."],
    ["11. Sanctions disciplinaires", "Tout comportement considéré comme fautif peut donner lieu, selon sa nature et sa gravité, à un rappel écrit des règles, un avertissement, une exclusion temporaire ou une exclusion définitive de la formation. Aucune sanction pécuniaire n’est appliquée. La mesure retenue doit être proportionnée aux faits reprochés."],
    ["12. Procédure disciplinaire", "Aucune sanction n’est prononcée sans que le stagiaire ait été préalablement informé des griefs retenus contre lui. Lorsqu’une sanction est susceptible d’avoir une incidence sur sa présence en formation, le stagiaire est convoqué à un entretien par écrit avec indication de l’objet, de la date, de l’heure et du lieu. Il peut se faire assister par la personne de son choix. Le responsable expose le motif envisagé et recueille ses explications. La décision intervient dans les délais légaux, est écrite, motivée et notifiée au stagiaire. Lorsque la réglementation l’exige, l’employeur et l’organisme financeur sont informés de la sanction. Une mesure conservatoire d’exclusion temporaire peut être prise en cas de nécessité immédiate, sans préjuger de la sanction définitive."],
    ["13. Représentation des stagiaires", "Pour les actions organisées en sessions d’une durée totale supérieure à 500 heures, un délégué titulaire et un délégué suppléant sont élus dans les conditions prévues par le Code du travail. Ils peuvent formuler des suggestions sur le déroulement de la formation et présenter les réclamations individuelles ou collectives relatives notamment aux conditions de formation, de santé, de sécurité et à l’application du présent règlement."],
    ["14. Réclamations et difficultés", `Toute difficulté relative au déroulement de la formation peut être signalée à ${fallback(f.organismeNom)} par email à ${fallback(f.organismeEmail)} ou par téléphone au ${fallback(f.organismeTelephone)}. Les besoins particuliers ou demandes d’adaptation sont examinés afin de rechercher une solution compatible avec les objectifs et conditions de la formation.`],
    ["15. Entrée en vigueur et mise à disposition", `Le présent règlement est actualisé au ${dateFr(f.dateActualisation)}. Il est mis à disposition des stagiaires dans le cadre des informations relatives à la formation et demeure applicable pendant toute la durée de leur participation.`],
  ];
  for (const [heading, body] of blocks) {
    y = section(doc, heading, y);
    y = text(doc, body, y, false, 9, 4);
  }
}

function appendLivretAccueil(doc: jsPDF, f: FormState, person: string) {
  doc.addPage();
  let y = title(doc, "Annexe — Livret d’accueil", `${fallback(f.formationTitre)} · ${person}`);
  y = text(doc, `Bienvenue dans cette action de formation organisée par ${fallback(f.organismeNom)}. Ce livret rassemble les informations pratiques communiquées pour préparer votre accueil et le bon déroulement de la session.`, y, false, 9);
  y = section(doc, "Votre formation", y);
  y = field(doc, "Intitulé", f.formationTitre, y);
  y = field(doc, "Public", f.formationPublic, y);
  y = field(doc, "Prérequis", f.formationPrerequis || "Aucun", y);
  y = field(doc, "Durée", f.formationDuree, y);
  y = field(doc, "Dates", period(f), y);
  y = field(doc, "Horaires", f.horaires, y);
  y = field(doc, "Modalité", f.formationModalite, y);
  y = field(doc, "Lieu / accès", f.lieu, y);
  y = field(doc, "Formateur", f.formateur, y);
  y = section(doc, "Objectifs et déroulement", y);
  y = text(doc, f.formationObjectifs, y, false, 9);
  y = text(doc, `Les méthodes et moyens pédagogiques prévus sont les suivants : ${fallback(f.formationMethodes)}. Le formateur peut adapter le rythme, les exemples ou les activités dans le respect des objectifs annoncés et des besoins identifiés.`, y, false, 9);
  y = section(doc, "Évaluation des acquis", y);
  y = text(doc, `Les acquis sont évalués selon les modalités suivantes : ${fallback(f.formationEvaluation)}. Le bénéficiaire participe aux activités et évaluations prévues afin de permettre le suivi de sa progression.`, y, false, 9);
  y = section(doc, "Accueil et conditions de participation", y);
  y = text(doc, `Le bénéficiaire se présente ou se connecte aux horaires indiqués, respecte les consignes transmises et signale dès que possible tout retard, absence ou difficulté. Pour une formation en présentiel, les consignes du lieu d’accueil s’appliquent. Pour une formation à distance, le bénéficiaire veille à disposer des moyens techniques nécessaires à sa participation et à rejoindre les espaces de formation communiqués par l’organisme.`, y, false, 9);
  y = section(doc, "Accessibilité et besoins particuliers", y);
  y = text(doc, `${fallback(f.formationAccessibilite)}\n\nTout besoin d’adaptation non encore signalé peut être communiqué à l’organisme afin qu’une solution adaptée soit recherchée lorsque cela est possible.`, y, false, 9);
  y = section(doc, "Communication et réclamations", y);
  y = text(doc, `Pour toute question avant ou pendant la formation, contactez ${fallback(f.organismeNom)} : ${fallback(f.organismeEmail)} · ${fallback(f.organismeTelephone)}. Toute difficulté concernant l’accueil, l’organisation ou le déroulement peut être signalée à ces mêmes coordonnées.`, y, false, 9);
  y = section(doc, "Sécurité et règlement intérieur", y);
  y = text(doc, "Le bénéficiaire respecte les consignes de santé et de sécurité du lieu d’accueil ainsi que le règlement intérieur applicable à la formation. Le règlement intérieur complet figure à la suite du présent livret.", y, false, 9);
  y = section(doc, "À prévoir", y);
  text(doc, "• Être présent ou connecté à l’heure prévue.\n• Prévoir le matériel personnel éventuellement nécessaire à la prise de notes.\n• Participer aux exercices, activités et évaluations prévues.\n• Signaler immédiatement toute difficulté pouvant empêcher le bon déroulement de la formation.", y, false, 9);
}

function programmePositionnement(f: FormState) {
  const { doc } = newDoc("Programme de formation", f.organismeNom);
  let y = 39;
  y = field(doc, "Intitulé", f.formationTitre, y);
  y = field(doc, "Public visé", f.formationPublic, y);
  y = field(doc, "Prérequis", f.formationPrerequis || "Aucun", y);
  y = field(doc, "Durée", f.formationDuree, y);
  y = field(doc, "Modalité", f.formationModalite, y);
  y = field(doc, "Dates", period(f), y);
  y = field(doc, "Horaires", f.horaires, y);
  y = field(doc, "Lieu", f.lieu, y);
  y = field(doc, "Formateur", f.formateur, y);
  y = section(doc, "Objectifs", y);
  y = text(doc, f.formationObjectifs, y);
  y = section(doc, "Programme détaillé", y);
  y = text(doc, f.formationProgramme, y);
  y = section(doc, "Méthodes et moyens pédagogiques", y);
  y = text(doc, f.formationMethodes, y);
  y = section(doc, "Modalités d’évaluation des acquis", y);
  y = text(doc, f.formationEvaluation, y);
  y = section(doc, "Accessibilité et besoins spécifiques", y);
  text(doc, f.formationAccessibilite, y);

  for (const person of people(f.beneficiaires)) {
    doc.addPage();
    let p = title(doc, "Inscription et positionnement", `${f.formationTitre} · ${person}`);
    p = field(doc, "Bénéficiaire", person, p);
    p = field(doc, "Formation", f.formationTitre, p);
    p = field(doc, "Dates prévues", period(f), p);
    const qs = [
      "Fonction / poste occupé :",
      "Expérience ou connaissances déjà acquises en lien avec la formation :",
      "Qu’attendez-vous principalement de cette formation ?",
      "Dans quelles situations souhaitez-vous utiliser les compétences acquises ?",
      "Avez-vous des besoins particuliers ou des contraintes à signaler ?",
    ];
    for (const q of qs) {
      p = text(doc, q, p, true, 9, 2);
      p = blanks(doc, p, q.length > 45 ? 3 : 2);
    }
    p = section(doc, "Positionnement", p);
    p = text(doc, "[ ] Débutant    [ ] Intermédiaire    [ ] Confirmé    [ ] À déterminer", p);
    p = text(doc, "Objectifs ou compétences déjà maîtrisés :", p, true, 9, 2);
    p = blanks(doc, p, 2);
    p = text(doc, "Adaptation pédagogique éventuellement nécessaire :", p, true, 9, 2);
    p = blanks(doc, p, 2);
    signatures(doc, p, "Bénéficiaire", "Organisme de formation");
  }
  return doc;
}

function convention(f: FormState) {
  const { doc } = newDoc("Convention de formation professionnelle", f.formationTitre);
  let y = 39;
  y = section(doc, "Entre les soussignés", y);
  y = text(doc, `${fallback(f.organismeNom)}\n${fallback(f.organismeAdresse)}\nSIRET : ${fallback(f.organismeSiret)}\nNDA : ${fallback(f.organismeNda)}\nReprésenté par : ${fallback(f.organismeRepresentant)}`, y);
  y = text(doc, "Et :", y, true);
  y = text(doc, `${fallback(f.clientNom)}\n${fallback(f.clientAdresse)}\nSIRET : ${fallback(f.clientSiret)}\nReprésenté par : ${fallback(f.clientRepresentant)}`, y);
  y = section(doc, "1. Objet", y);
  y = text(doc, `La présente convention a pour objet l’organisation de l’action de formation intitulée « ${fallback(f.formationTitre)} ».`, y);
  y = section(doc, "2. Caractéristiques de l’action", y);
  y = field(doc, "Objectifs", f.formationObjectifs, y);
  y = field(doc, "Public", f.formationPublic, y);
  y = field(doc, "Prérequis", f.formationPrerequis || "Aucun", y);
  y = field(doc, "Durée", f.formationDuree, y);
  y = field(doc, "Modalité", f.formationModalite, y);
  y = field(doc, "Dates", period(f), y);
  y = field(doc, "Horaires", f.horaires, y);
  y = field(doc, "Lieu", f.lieu, y);
  y = field(doc, "Formateur", f.formateur, y);
  y = section(doc, "3. Bénéficiaires", y);
  y = text(doc, people(f.beneficiaires).map((n) => `• ${n}`).join("\n"), y);
  y = section(doc, "4. Organisation et suivi", y);
  y = text(doc, `Méthodes et moyens pédagogiques : ${fallback(f.formationMethodes)}`, y);
  y = text(doc, `Modalités d’évaluation des acquis : ${fallback(f.formationEvaluation)}`, y);
  y = text(doc, "L’assiduité est tracée au moyen d’une feuille d’émargement ou d’un dispositif adapté à la modalité de formation. Les preuves de réalisation et d’évaluation sont conservées dans le dossier de la session.", y);
  y = section(doc, "5. Dispositions financières", y);
  y = text(doc, `Le prix de la formation est fixé à ${price(f.tarif)}.`, y);
  y = section(doc, "6. Conditions particulières", y);
  y = text(doc, "Les conditions d’annulation, de report, de règlement et les clauses propres à l’organisme de formation sont à compléter ou appliquer selon ses conditions contractuelles habituelles.", y);
  y = section(doc, "7. Documents annexés", y);
  y = text(doc, "Le règlement intérieur de l’organisme de formation est annexé à la présente convention et en fait partie intégrante pour l’information sur les règles applicables aux stagiaires.", y);
  signatures(doc, y, "Organisme de formation", "Client");
  appendReglementInterieur(doc, f, "Annexe 1 — Règlement intérieur");
  return doc;
}

function convocations(f: FormState) {
  const doc = new jsPDF();
  for (const [index, person] of people(f.beneficiaires).entries()) {
    if (index > 0) doc.addPage();
    let y = title(doc, "Convocation à la formation", f.organismeNom);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(`À l’attention de : ${person}`, 110, y);
    y += 5;
    if (f.clientNom.trim()) {
      doc.text(doc.splitTextToSize(f.clientNom, 82) as string[], 110, y);
      y += 5;
    }
    if (f.clientAdresse.trim()) {
      const address = doc.splitTextToSize(f.clientAdresse, 82) as string[];
      doc.text(address, 110, y);
      y += address.length * 4 + 4;
    } else y += 4;
    y = text(doc, `Le ${dateFr(f.dateActualisation)}`, y, false, 9, 5);
    y = text(doc, `Objet : Convocation à la formation « ${fallback(f.formationTitre)} »`, y, true, 10, 7);
    y = text(doc, `Madame, Monsieur ${person},`, y, false, 10, 5);
    y = text(doc, `Nous avons le plaisir de vous confirmer votre participation à la formation « ${fallback(f.formationTitre)} », organisée par ${fallback(f.organismeNom)}.`, y, false, 10, 5);
    y = text(doc, `La session se déroulera ${period(f)}, selon les horaires suivants : ${fallback(f.horaires)}. La durée annoncée est de ${fallback(f.formationDuree)}.`, y, false, 10, 5);
    y = text(doc, `Modalité : ${fallback(f.formationModalite)}. Lieu ou modalités d’accès : ${fallback(f.lieu)}. Votre formateur sera ${fallback(f.formateur)}.`, y, false, 10, 5);
    y = text(doc, "Nous vous remercions de vous présenter ou de vous connecter à l’heure prévue et de nous informer au plus tôt de tout empêchement, retard ou besoin particulier nécessitant une adaptation.", y, false, 10, 5);
    y = text(doc, `Pour toute question, vous pouvez contacter ${fallback(f.organismeNom)} à l’adresse ${fallback(f.organismeEmail)} ou au ${fallback(f.organismeTelephone)}.`, y, false, 10, 7);
    y = text(doc, "Nous vous souhaitons une excellente formation.", y, false, 10, 7);
    y = text(doc, fallback(f.organismeRepresentant, fallback(f.organismeNom)), y, true, 10, 3);
    y = text(doc, fallback(f.organismeNom), y, false, 9, 8);
    y = section(doc, "Pièces jointes à cette convocation", y);
    text(doc, "• Annexe 1 : livret d’accueil\n• Annexe 2 : règlement intérieur applicable à la formation", y, false, 9);
    appendLivretAccueil(doc, f, person);
    appendReglementInterieur(doc, f, "Annexe 2 — Règlement intérieur");
  }
  return doc;
}

function appendSupportReceipt(doc: jsPDF, f: FormState, persons: string[]) {
  doc.addPage();
  let y = title(doc, "Attestation de remise des supports de formation", f.formationTitre);
  y = text(doc, "Chaque bénéficiaire coche, date et signe la ligne qui le concerne afin d’attester qu’il a reçu les supports de formation en main propre.", y, false, 9, 7);

  const widths = [43, 77, 25, 29];
  const headers = ["Bénéficiaire", "Attestation", "Date", "Signature"];
  const drawHeader = () => {
    let x = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(40);
    headers.forEach((header, i) => {
      doc.rect(x, y, widths[i], 11);
      const lines = doc.splitTextToSize(header, widths[i] - 4) as string[];
      doc.text(lines.slice(0, 2), x + 2, y + 5);
      x += widths[i];
    });
    y += 11;
  };

  drawHeader();
  for (const person of persons) {
    const rowHeight = 30;
    if (y + rowHeight > CONTENT_BOTTOM) {
      doc.addPage();
      y = title(doc, "Attestation de remise des supports de formation", f.formationTitre);
      drawHeader();
    }
    let x = M;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40);
    widths.forEach((width, i) => {
      doc.rect(x, y, width, rowHeight);
      if (i === 0) {
        const lines = doc.splitTextToSize(person, width - 4) as string[];
        doc.text(lines.slice(0, 3), x + 2, y + 7);
      }
      if (i === 1) {
        const lines = doc.splitTextToSize("[ ] Je certifie avoir reçu en main propre les supports de formation remis dans le cadre de cette action.", width - 4) as string[];
        doc.text(lines.slice(0, 5), x + 2, y + 6);
      }
      if (i === 2) doc.text("___/___/____", x + 2, y + 9);
      x += width;
    });
    y += rowHeight;
  }
}

function emargement(f: FormState) {
  const doc = new jsPDF();
  const persons = people(f.beneficiaires);
  allDates(f.dateDebut, f.dateFin).forEach((date, day) => {
    if (day > 0) doc.addPage();
    let y = title(doc, "Feuille d’émargement", f.formationTitre);
    y = field(doc, "Date", date, y);
    y = field(doc, "Horaires", f.horaires, y);
    y = field(doc, "Formateur", f.formateur, y);
    const widths = [62, 54, 58];
    const heads = ["Bénéficiaire", "Signature matin", "Signature après-midi"];
    let x = M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(40);
    heads.forEach((h, i) => {
      doc.rect(x, y, widths[i], 10);
      doc.text(h, x + 2, y + 6);
      x += widths[i];
    });
    y += 10;
    persons.forEach((person) => {
      if (y + 20 > CONTENT_BOTTOM) {
        doc.addPage();
        y = M;
      }
      x = M;
      widths.forEach((w, i) => {
        doc.rect(x, y, w, 18);
        if (i === 0) doc.text((doc.splitTextToSize(person, w - 4) as string[]).slice(0, 2), x + 2, y + 7);
        x += w;
      });
      y += 18;
    });
    y += 8;
    y = ensure(doc, y, 34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Signature du formateur :", M, y);
    doc.rect(M, y + 4, W, 22);
  });
  appendSupportReceipt(doc, f, persons);
  return doc;
}

function satisfaction(f: FormState) {
  const doc = new jsPDF();
  const qs = [
    "La formation a-t-elle répondu à vos attentes ?",
    "Les objectifs vous paraissent-ils atteints ?",
    "Le contenu était-il adapté à vos besoins ?",
    "Les méthodes pédagogiques étaient-elles adaptées ?",
    "Les explications du formateur étaient-elles claires ?",
    "Le rythme était-il adapté ?",
    "Les supports et moyens utilisés étaient-ils satisfaisants ?",
    "Pensez-vous pouvoir mettre en pratique les acquis ?",
  ];
  people(f.beneficiaires).forEach((person, index) => {
    if (index > 0) doc.addPage();
    let y = title(doc, "Questionnaire de satisfaction", `${f.formationTitre} · ${person}`);
    y = field(doc, "Bénéficiaire", person, y);
    y = field(doc, "Dates", period(f), y);
    y = text(doc, "Cochez une note de 1 à 5, de très insatisfaisant à très satisfaisant.", y, false, 9);
    qs.forEach((q, i) => {
      y = ensure(doc, y, 18);
      y = text(doc, `${i + 1}. ${q}`, y, true, 9, 2);
      y = text(doc, "[ ] 1     [ ] 2     [ ] 3     [ ] 4     [ ] 5", y, false, 9, 4);
    });
    y = section(doc, "Ce que vous avez le plus apprécié", y);
    y = blanks(doc, y, 3);
    y = section(doc, "Points pouvant être améliorés", y);
    y = blanks(doc, y, 3);
    y = section(doc, "Commentaires ou suggestions", y);
    blanks(doc, y, 4);
  });
  return doc;
}

function suivi(f: FormState) {
  const doc = new jsPDF();
  people(f.beneficiaires).forEach((person, index) => {
    if (index > 0) doc.addPage();
    let y = title(doc, "Fiche de suivi pédagogique", `${f.formationTitre} · ${person}`);
    y = field(doc, "Bénéficiaire", person, y);
    y = field(doc, "Formateur", f.formateur, y);
    y = field(doc, "Période", period(f), y);
    y = section(doc, "Objectifs travaillés", y);
    y = text(doc, f.formationObjectifs, y, false, 9);
    for (const heading of ["Progression et observations", "Difficultés éventuellement rencontrées", "Adaptations pédagogiques mises en œuvre", "Acquis / compétences observés", "Actions ou recommandations complémentaires"]) {
      y = section(doc, heading, y);
      y = blanks(doc, y, 4);
    }
    signatures(doc, y, "Formateur", "Bénéficiaire");
  });
  return doc;
}

function procedure(f: FormState) {
  const { doc } = newDoc("Procédure d’utilisation du dossier de formation", f.formationTitre);
  let y = 39;
  y = text(doc, "Cette procédure indique quels documents envoyer, récupérer et conserver pour cette action de formation.", y);
  y = text(doc, "RÈGLE DE TRAÇABILITÉ : pour chaque envoi de documents effectué par email, conserver une capture d’écran de l’email envoyé avec la date d’envoi clairement visible. Classer ces captures dans le dossier de la session.", y, true, 9, 7);

  const steps: Array<[string, string]> = [
    ["1. Avant l’inscription définitive", "À envoyer ou mettre à disposition du bénéficiaire :\n• Programme de formation + formulaire d’inscription / positionnement\n• Informations sur le formateur, les horaires et les modalités d’évaluation\n• Règlement intérieur applicable à la formation\n\nÀ récupérer :\n• Formulaire d’inscription / positionnement complété\n\nÀ conserver :\n• Une copie du document complété\n• Les informations relatives aux éventuels besoins d’adaptation\n• Une capture de l’email d’envoi avec la date bien visible"],
    ["2. Après validation de l’inscription", "À envoyer au client :\n• Convention de formation avec son règlement intérieur en annexe\n\nÀ récupérer et conserver :\n• Convention signée par le client\n• Une capture de l’email d’envoi avec la date bien visible"],
    ["3. Avant le début de la formation", "À envoyer à chaque bénéficiaire :\n• Convocation\n• Livret d’accueil annexé à la convocation\n• Règlement intérieur annexé à la convocation\n\nÀ vérifier : dates, horaires, lieu ou connexion, modalités pratiques et coordonnées de contact.\n\nÀ conserver :\n• Une capture de chaque email d’envoi avec la date bien visible"],
    ["4. Pendant la formation", "À utiliser et conserver :\n• Feuille d’émargement\n• Attestation de remise des supports de formation, cochée, datée et signée par chaque bénéficiaire\n• Fiche de suivi pédagogique\n• Évaluation des acquis prévue pour la formation\n\nÉVALUATION DES ACQUIS : utiliser l’évaluation prévue pour la formation (questionnaire, exercice, mise en situation, test pratique, observation, etc.) et conserver une copie de l’évaluation réalisée et/ou une preuve de son résultat dans le dossier de la session."],
    ["5. À la fin de la formation", "À faire compléter :\n• Questionnaire de satisfaction\n\nÀ récupérer et conserver :\n• Questionnaire de satisfaction\n• Feuille d’émargement complète\n• Attestation de remise des supports de formation complétée\n• Fiche de suivi\n• Copie ou résultat de l’évaluation des acquis"],
    ["6. Archivage", "Conserver ensemble : programme et positionnement, convention signée, règlement intérieur, convocation et livret d’accueil, feuilles d’émargement, attestation de remise des supports, fiche de suivi, évaluation des acquis ou preuve du résultat, questionnaire de satisfaction, captures d’écran des emails d’envoi avec la date bien visible et tout échange utile permettant de retracer le déroulement de la formation."],
    ["7. Transmission pour contrôle, suivi et archivage", "Après clôture de l’action, transmettre à Selen Editions une copie numérique complète du dossier de formation, avec les documents complétés et signés, les preuves d’évaluation et les captures des emails d’envoi. Cette copie est nécessaire pour le contrôle du dossier, le suivi et l’archivage."],
  ];

  for (const [heading, body] of steps) {
    y = section(doc, heading, y);
    y = text(doc, body, y);
  }
  y = section(doc, "Récapitulatif", y);
  y = field(doc, "Formation", f.formationTitre, y);
  y = field(doc, "Client", f.clientNom, y);
  y = field(doc, "Dates", period(f), y);
  y = field(doc, "Formateur", f.formateur, y);
  field(doc, "Bénéficiaires", people(f.beneficiaires).join(", "), y);
  return doc;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block"><span className="text-sm text-stone-400">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-amber-400/70" /></label>;
}

function Area({ label, value, onChange, rows = 5, placeholder }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  return <label className="block"><span className="text-sm text-stone-400">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="mt-2 w-full resize-y rounded-xl border border-stone-700 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-amber-400/70" /></label>;
}

function Card({ title: cardTitle, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-stone-800 bg-stone-900/90 p-6"><h2 className="mb-5 text-lg font-semibold text-stone-100">{cardTitle}</h2>{children}</section>;
}

export default function DossierGeneratorClientV3() {
  const [f, setF] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof FormState, value: string) => setF((current) => ({ ...current, [key]: value }));

  const generate = () => {
    if (!f.formationTitre.trim()) {
      window.alert("Renseigne au minimum l’intitulé de la formation.");
      return;
    }
    setBusy(true);
    try {
      const zip = new PizZip();
      const docs: Array<[string, jsPDF]> = [
        ["01_Programme_Inscription_Positionnement.pdf", programmePositionnement(f)],
        ["02_Convention_Formation_et_Reglement_Interieur.pdf", convention(f)],
        ["03_Convocations_Livret_Accueil_Reglement_Interieur.pdf", convocations(f)],
        ["04_Feuille_Emargement_et_Remise_Supports.pdf", emargement(f)],
        ["05_Questionnaire_Satisfaction.pdf", satisfaction(f)],
        ["06_Fiche_Suivi_Pedagogique.pdf", suivi(f)],
        ["07_Procedure_Utilisation_Dossier.pdf", procedure(f)],
      ];
      docs.forEach(([name, doc]) => {
        addFooters(doc, f);
        zip.file(name, new Uint8Array(doc.output("arraybuffer")));
      });
      const blob = zip.generate({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Dossier_${safe(f.clientNom || f.organismeNom || "Client")}_${safe(f.formationTitre)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      window.alert("Impossible de générer le dossier.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="px-8 py-10"><div className="mx-auto max-w-5xl"><header className="mb-8"><div className="flex items-center gap-3"><div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-300"><FileArchive size={22} /></div><div><p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Selen Studio</p><h1 className="mt-1 text-3xl font-semibold text-stone-100">Générateur de dossier de formation</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-stone-400">Outil temporaire pour les premiers clients Selen. Les données ne sont pas enregistrées en base : elles servent uniquement à produire les documents préremplis à envoyer manuellement par email.</p></header>
    <div className="space-y-6">
      <Card title="1. Organisme de formation"><div className="grid gap-4 md:grid-cols-2"><Field label="Nom / raison sociale" value={f.organismeNom} onChange={(v) => set("organismeNom", v)} /><Field label="Représentant" value={f.organismeRepresentant} onChange={(v) => set("organismeRepresentant", v)} /><Field label="SIRET" value={f.organismeSiret} onChange={(v) => set("organismeSiret", v)} /><Field label="NDA" value={f.organismeNda} onChange={(v) => set("organismeNda", v)} /><Field label="Région d’enregistrement du NDA" placeholder="Ex. Grand Est" value={f.organismeNdaRegion} onChange={(v) => set("organismeNdaRegion", v)} /><Field label="Date d’actualisation des documents" type="date" value={f.dateActualisation} onChange={(v) => set("dateActualisation", v)} /><Field label="Email" type="email" value={f.organismeEmail} onChange={(v) => set("organismeEmail", v)} /><Field label="Téléphone" value={f.organismeTelephone} onChange={(v) => set("organismeTelephone", v)} /></div><div className="mt-4"><Area label="Adresse complète" rows={3} value={f.organismeAdresse} onChange={(v) => set("organismeAdresse", v)} /></div></Card>
      <Card title="2. Client"><div className="grid gap-4 md:grid-cols-2"><Field label="Raison sociale" value={f.clientNom} onChange={(v) => set("clientNom", v)} /><Field label="Représentant" value={f.clientRepresentant} onChange={(v) => set("clientRepresentant", v)} /><Field label="SIRET" value={f.clientSiret} onChange={(v) => set("clientSiret", v)} /></div><div className="mt-4"><Area label="Adresse complète" rows={3} value={f.clientAdresse} onChange={(v) => set("clientAdresse", v)} /></div></Card>
      <Card title="3. Formation"><div className="space-y-4"><Field label="Intitulé de la formation *" value={f.formationTitre} onChange={(v) => set("formationTitre", v)} /><div className="grid gap-4 md:grid-cols-2"><Field label="Public visé" value={f.formationPublic} onChange={(v) => set("formationPublic", v)} /><Field label="Prérequis" value={f.formationPrerequis} onChange={(v) => set("formationPrerequis", v)} /><Field label="Durée" placeholder="Ex. 14 heures / 2 jours" value={f.formationDuree} onChange={(v) => set("formationDuree", v)} /><Field label="Modalité" placeholder="Présentiel, distanciel..." value={f.formationModalite} onChange={(v) => set("formationModalite", v)} /></div><Area label="Objectifs" value={f.formationObjectifs} onChange={(v) => set("formationObjectifs", v)} /><Area label="Programme complet" rows={16} placeholder="Colle ici le programme complet validé..." value={f.formationProgramme} onChange={(v) => set("formationProgramme", v)} /><Area label="Méthodes et moyens pédagogiques" value={f.formationMethodes} onChange={(v) => set("formationMethodes", v)} /><Area label="Modalités d’évaluation des acquis" value={f.formationEvaluation} onChange={(v) => set("formationEvaluation", v)} /><Area label="Accessibilité / besoins spécifiques" value={f.formationAccessibilite} onChange={(v) => set("formationAccessibilite", v)} /></div></Card>
      <Card title="4. Session"><div className="grid gap-4 md:grid-cols-2"><Field label="Date de début" type="date" value={f.dateDebut} onChange={(v) => set("dateDebut", v)} /><Field label="Date de fin" type="date" value={f.dateFin} onChange={(v) => set("dateFin", v)} /><Field label="Horaires" placeholder="9h00-12h30 / 13h30-17h00" value={f.horaires} onChange={(v) => set("horaires", v)} /><Field label="Formateur" value={f.formateur} onChange={(v) => set("formateur", v)} /><Field label="Lieu" value={f.lieu} onChange={(v) => set("lieu", v)} /><Field label="Tarif" value={f.tarif} onChange={(v) => set("tarif", v)} /></div></Card>
      <Card title="5. Bénéficiaires"><Area label="Un bénéficiaire par ligne" rows={7} placeholder={"Marie Dupont\nJean Martin"} value={f.beneficiaires} onChange={(v) => set("beneficiaires", v)} /></Card>
      <section className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-6"><h2 className="font-semibold text-stone-100">Documents générés</h2><p className="mt-2 text-sm leading-6 text-stone-400">Programme + inscription/positionnement, convention avec règlement intérieur, convocation avec livret d’accueil et règlement intérieur, feuille d’émargement avec attestation de remise des supports, questionnaire de satisfaction, fiche de suivi pédagogique et procédure d’utilisation.</p><p className="mt-2 text-sm leading-6 text-stone-500">Chaque page comporte le pied de page de l’organisme avec ses coordonnées, son SIRET, son NDA, sa région d’enregistrement et la date d’actualisation. L’évaluation des acquis reste à réaliser avec l’outil prévu pour la formation et à conserver dans le dossier.</p></section>
      <div className="flex flex-col gap-3 pb-12 sm:flex-row"><button type="button" onClick={generate} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-4 font-semibold text-black hover:bg-amber-300 disabled:opacity-60"><Download size={18} />{busy ? "Génération..." : "Générer et télécharger le dossier ZIP"}</button><button type="button" onClick={() => window.confirm("Effacer toutes les informations saisies ?") && setF(emptyForm())} className="flex items-center justify-center gap-2 rounded-2xl border border-stone-700 bg-stone-900 px-5 py-4 text-sm text-stone-300 hover:bg-stone-800"><RotateCcw size={17} />Réinitialiser</button></div>
    </div></div></div>;
}
