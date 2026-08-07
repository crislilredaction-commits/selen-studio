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
  organismeRepresentant: string;
  organismeEmail: string;
  organismeTelephone: string;
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

const EMPTY: FormState = {
  organismeNom: "", organismeAdresse: "", organismeSiret: "", organismeNda: "",
  organismeRepresentant: "", organismeEmail: "", organismeTelephone: "",
  clientNom: "", clientAdresse: "", clientSiret: "", clientRepresentant: "",
  formationTitre: "", formationPublic: "", formationPrerequis: "", formationObjectifs: "",
  formationProgramme: "", formationMethodes: "", formationEvaluation: "",
  formationAccessibilite: "", formationDuree: "", formationModalite: "",
  dateDebut: "", dateFin: "", horaires: "", lieu: "", formateur: "", tarif: "",
  beneficiaires: "",
};

const M = 18;
const PAGE_H = 297;
const W = 174;

function fallback(value: string, alt = "À compléter") { return value.trim() || alt; }
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

function newDoc(title: string, subtitle?: string) {
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(130, 92, 35);
  doc.text(title, M, M);
  let y = M + 8;
  if (subtitle) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100); doc.text(subtitle, M, y); y += 5; }
  doc.setDrawColor(190, 160, 105); doc.line(M, y, 192, y);
  return { doc, y: y + 8 };
}
function ensure(doc: jsPDF, y: number, need = 10) { if (y + need > PAGE_H - M) { doc.addPage(); return M; } return y; }
function text(doc: jsPDF, value: string, y: number, bold = false, size = 10, gap = 4) {
  doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(40);
  const lines = doc.splitTextToSize(fallback(value), W) as string[];
  for (const line of lines) { y = ensure(doc, y, 6); doc.text(line, M, y); y += size * 0.5; }
  return y + gap;
}
function section(doc: jsPDF, value: string, y: number) {
  y = ensure(doc, y, 13); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(130, 92, 35); doc.text(value, M, y); return y + 7;
}
function field(doc: jsPDF, label: string, value: string, y: number) { y = text(doc, `${label} :`, y, true, 9, 1); return text(doc, value, y, false, 10, 3); }
function blanks(doc: jsPDF, y: number, count = 3) { doc.setDrawColor(180); for (let i = 0; i < count; i += 1) { y = ensure(doc, y, 8); doc.line(M, y, 192, y); y += 8; } return y; }
function signatures(doc: jsPDF, y: number, left: string, right: string) {
  y = ensure(doc, y, 45); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40);
  doc.text(left, M, y); doc.text(right, 110, y); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.text("Nom :", M, y + 7); doc.text("Nom :", 110, y + 7); doc.text("Date :", M, y + 14); doc.text("Date :", 110, y + 14);
  doc.text("Signature :", M, y + 21); doc.text("Signature :", 110, y + 21); doc.rect(M, y + 24, 74, 18); doc.rect(110, y + 24, 74, 18);
}

function programmePositionnement(f: FormState) {
  const { doc } = newDoc("Programme de formation", f.organismeNom); let y = 39;
  y = field(doc, "Intitulé", f.formationTitre, y); y = field(doc, "Public visé", f.formationPublic, y); y = field(doc, "Prérequis", f.formationPrerequis || "Aucun", y);
  y = field(doc, "Durée", f.formationDuree, y); y = field(doc, "Modalité", f.formationModalite, y); y = field(doc, "Dates", period(f), y); y = field(doc, "Horaires", f.horaires, y); y = field(doc, "Lieu", f.lieu, y); y = field(doc, "Formateur", f.formateur, y);
  y = section(doc, "Objectifs", y); y = text(doc, f.formationObjectifs, y); y = section(doc, "Programme détaillé", y); y = text(doc, f.formationProgramme, y);
  y = section(doc, "Méthodes et moyens pédagogiques", y); y = text(doc, f.formationMethodes, y); y = section(doc, "Modalités d’évaluation des acquis", y); y = text(doc, f.formationEvaluation, y);
  y = section(doc, "Accessibilité et besoins spécifiques", y); text(doc, f.formationAccessibilite, y);

  for (const person of people(f.beneficiaires)) {
    doc.addPage(); let p = 28; doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(130, 92, 35); doc.text("Inscription et positionnement", M, M);
    p = field(doc, "Bénéficiaire", person, p); p = field(doc, "Formation", f.formationTitre, p); p = field(doc, "Dates prévues", period(f), p);
    const qs = ["Fonction / poste occupé :", "Expérience ou connaissances déjà acquises en lien avec la formation :", "Qu’attendez-vous principalement de cette formation ?", "Dans quelles situations souhaitez-vous utiliser les compétences acquises ?", "Avez-vous des besoins particuliers ou des contraintes à signaler ?"];
    for (const q of qs) { p = text(doc, q, p, true, 9, 2); p = blanks(doc, p, q.length > 45 ? 3 : 2); }
    p = section(doc, "Positionnement", p); p = text(doc, "[ ] Débutant    [ ] Intermédiaire    [ ] Confirmé    [ ] À déterminer", p);
    p = text(doc, "Objectifs ou compétences déjà maîtrisés :", p, true, 9, 2); p = blanks(doc, p, 2); p = text(doc, "Adaptation pédagogique éventuellement nécessaire :", p, true, 9, 2); p = blanks(doc, p, 2);
    signatures(doc, p, "Bénéficiaire", "Organisme de formation");
  }
  return doc;
}

function convention(f: FormState) {
  const { doc } = newDoc("Convention de formation professionnelle", f.formationTitre); let y = 39;
  y = section(doc, "Entre les soussignés", y);
  y = text(doc, `${fallback(f.organismeNom)}\n${fallback(f.organismeAdresse)}\nSIRET : ${fallback(f.organismeSiret)}\nNDA : ${fallback(f.organismeNda)}\nReprésenté par : ${fallback(f.organismeRepresentant)}`, y);
  y = text(doc, "Et :", y, true); y = text(doc, `${fallback(f.clientNom)}\n${fallback(f.clientAdresse)}\nSIRET : ${fallback(f.clientSiret)}\nReprésenté par : ${fallback(f.clientRepresentant)}`, y);
  y = section(doc, "1. Objet", y); y = text(doc, `La présente convention a pour objet l’organisation de l’action de formation intitulée « ${fallback(f.formationTitre)} ».`, y);
  y = section(doc, "2. Caractéristiques de l’action", y); y = field(doc, "Objectifs", f.formationObjectifs, y); y = field(doc, "Public", f.formationPublic, y); y = field(doc, "Prérequis", f.formationPrerequis || "Aucun", y); y = field(doc, "Durée", f.formationDuree, y); y = field(doc, "Modalité", f.formationModalite, y); y = field(doc, "Dates", period(f), y); y = field(doc, "Horaires", f.horaires, y); y = field(doc, "Lieu", f.lieu, y); y = field(doc, "Formateur", f.formateur, y);
  y = section(doc, "3. Bénéficiaires", y); y = text(doc, people(f.beneficiaires).map((n) => `• ${n}`).join("\n"), y);
  y = section(doc, "4. Organisation et suivi", y); y = text(doc, `Méthodes et moyens pédagogiques : ${fallback(f.formationMethodes)}`, y); y = text(doc, `Modalités d’évaluation des acquis : ${fallback(f.formationEvaluation)}`, y); y = text(doc, "L’assiduité est tracée au moyen d’une feuille d’émargement. Les preuves de réalisation et d’évaluation sont conservées dans le dossier de la session.", y);
  y = section(doc, "5. Dispositions financières", y); y = text(doc, `Le prix de la formation est fixé à ${price(f.tarif)}.`, y);
  y = section(doc, "6. Conditions particulières", y); y = text(doc, "Les conditions d’annulation, de report, de règlement et les clauses propres à l’organisme de formation sont à compléter selon ses conditions habituelles.", y);
  signatures(doc, y, "Organisme de formation", "Client"); return doc;
}

function convocations(f: FormState) {
  const doc = new jsPDF(); people(f.beneficiaires).forEach((person, index) => {
    if (index > 0) doc.addPage(); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(130, 92, 35); doc.text("Convocation à la formation", M, M); let y = 30;
    y = text(doc, `Madame, Monsieur ${person},`, y); y = text(doc, `Nous vous confirmons votre inscription à la formation « ${fallback(f.formationTitre)} ».`, y); y = section(doc, "Informations pratiques", y);
    y = field(doc, "Dates", period(f), y); y = field(doc, "Horaires", f.horaires, y); y = field(doc, "Durée", f.formationDuree, y); y = field(doc, "Lieu / accès", f.lieu, y); y = field(doc, "Modalité", f.formationModalite, y); y = field(doc, "Formateur", f.formateur, y);
    y = text(doc, "Merci de prévenir l’organisme de formation en cas d’empêchement ou de besoin particulier nécessitant une adaptation.", y); y = section(doc, "Contact", y); text(doc, `${fallback(f.organismeNom)}\n${fallback(f.organismeEmail)}\n${fallback(f.organismeTelephone)}`, y);
  }); return doc;
}

function emargement(f: FormState) {
  const doc = new jsPDF(); const persons = people(f.beneficiaires); allDates(f.dateDebut, f.dateFin).forEach((date, day) => {
    if (day > 0) doc.addPage(); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(130, 92, 35); doc.text("Feuille d’émargement", M, M); let y = 30;
    y = field(doc, "Formation", f.formationTitre, y); y = field(doc, "Date", date, y); y = field(doc, "Horaires", f.horaires, y); y = field(doc, "Formateur", f.formateur, y);
    const widths = [62, 54, 58]; const heads = ["Bénéficiaire", "Signature matin", "Signature après-midi"]; let x = M; doc.setFontSize(8); doc.setTextColor(40);
    heads.forEach((h, i) => { doc.rect(x, y, widths[i], 10); doc.text(h, x + 2, y + 6); x += widths[i]; }); y += 10;
    persons.forEach((person) => { if (y + 20 > 279) { doc.addPage(); y = 25; } x = M; widths.forEach((w, i) => { doc.rect(x, y, w, 18); if (i === 0) doc.text((doc.splitTextToSize(person, w - 4) as string[]).slice(0, 2), x + 2, y + 7); x += w; }); y += 18; });
    y += 8; doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text("Signature du formateur :", M, y); doc.rect(M, y + 4, W, 22);
  }); return doc;
}

function satisfaction(f: FormState) {
  const doc = new jsPDF(); const qs = ["La formation a-t-elle répondu à vos attentes ?", "Les objectifs vous paraissent-ils atteints ?", "Le contenu était-il adapté à vos besoins ?", "Les méthodes pédagogiques étaient-elles adaptées ?", "Les explications du formateur étaient-elles claires ?", "Le rythme était-il adapté ?", "Les supports et moyens utilisés étaient-ils satisfaisants ?", "Pensez-vous pouvoir mettre en pratique les acquis ?"];
  people(f.beneficiaires).forEach((person, index) => { if (index > 0) doc.addPage(); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(130, 92, 35); doc.text("Questionnaire de satisfaction", M, M); let y = 30;
    y = field(doc, "Formation", f.formationTitre, y); y = field(doc, "Bénéficiaire", person, y); y = field(doc, "Dates", period(f), y); y = text(doc, "Cochez une note de 1 à 5, de très insatisfaisant à très satisfaisant.", y, false, 9);
    qs.forEach((q, i) => { y = ensure(doc, y, 18); y = text(doc, `${i + 1}. ${q}`, y, true, 9, 2); y = text(doc, "[ ] 1     [ ] 2     [ ] 3     [ ] 4     [ ] 5", y, false, 9, 4); });
    y = section(doc, "Ce que vous avez le plus apprécié", y); y = blanks(doc, y, 3); y = section(doc, "Points pouvant être améliorés", y); y = blanks(doc, y, 3); y = section(doc, "Commentaires ou suggestions", y); blanks(doc, y, 4);
  }); return doc;
}

function suivi(f: FormState) {
  const doc = new jsPDF(); people(f.beneficiaires).forEach((person, index) => { if (index > 0) doc.addPage(); doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(130, 92, 35); doc.text("Fiche de suivi pédagogique", M, M); let y = 30;
    y = field(doc, "Formation", f.formationTitre, y); y = field(doc, "Bénéficiaire", person, y); y = field(doc, "Formateur", f.formateur, y); y = field(doc, "Période", period(f), y);
    y = section(doc, "Objectifs travaillés", y); y = text(doc, f.formationObjectifs, y, false, 9); for (const h of ["Progression et observations", "Difficultés éventuellement rencontrées", "Adaptations pédagogiques mises en œuvre", "Acquis / compétences observés", "Actions ou recommandations complémentaires"]) { y = section(doc, h, y); y = blanks(doc, y, 4); } signatures(doc, y, "Formateur", "Bénéficiaire");
  }); return doc;
}

function procedure(f: FormState) {
  const { doc } = newDoc("Procédure d’utilisation du dossier de formation", f.formationTitre); let y = 39;
  y = text(doc, "Cette procédure indique quels documents envoyer, récupérer et conserver pour cette action de formation.", y);
  const steps = [
    ["1. Avant de confirmer l’inscription", "À envoyer :\n• Programme de formation + formulaire d’inscription / positionnement\n\nÀ récupérer :\n• Formulaire complété par chaque bénéficiaire\n\nÀ conserver :\n• Une copie du document complété\n• Les informations relatives aux éventuels besoins d’adaptation"],
    ["2. Après validation de l’inscription", "À envoyer :\n• Convention de formation\n\nÀ récupérer et conserver :\n• Convention signée par le client"],
    ["3. Avant le début de la formation", "À envoyer à chaque bénéficiaire :\n• Convocation\n• Programme si nécessaire\n\nÀ vérifier : dates, horaires, lieu ou connexion et coordonnées utiles."],
    ["4. Pendant la formation", "À utiliser :\n• Feuille d’émargement\n• Fiche de suivi pédagogique\n• Évaluation des acquis prévue par le formateur\n\nIMPORTANT — ÉVALUATION DES ACQUIS : le générateur ne produit volontairement pas l’évaluation. Utiliser l’évaluation prévue pour la formation (questionnaire, exercice, mise en situation, test pratique, observation, etc.). Une copie de l’évaluation réalisée et/ou de son résultat doit être conservée dans le dossier de la session."],
    ["5. À la fin de la formation", "À faire compléter :\n• Questionnaire de satisfaction\n\nÀ récupérer et conserver :\n• Questionnaire de satisfaction\n• Feuille d’émargement complète\n• Fiche de suivi\n• Copie ou résultat de l’évaluation des acquis"],
    ["6. Archivage", "Conserver ensemble : programme et positionnement, convention signée, convocation, émargement, fiche de suivi, évaluation des acquis ou preuve du résultat, questionnaire de satisfaction et tout échange utile permettant de retracer le déroulement de la formation."],
  ];
  for (const [h, body] of steps) { y = section(doc, h, y); y = text(doc, body, y); }
  y = section(doc, "Récapitulatif", y); y = field(doc, "Formation", f.formationTitre, y); y = field(doc, "Client", f.clientNom, y); y = field(doc, "Dates", period(f), y); y = field(doc, "Formateur", f.formateur, y); field(doc, "Bénéficiaires", people(f.beneficiaires).join(", "), y); return doc;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="block"><span className="text-sm text-stone-400">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-stone-700 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-amber-400/70" /></label>;
}
function Area({ label, value, onChange, rows = 5, placeholder }: { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  return <label className="block"><span className="text-sm text-stone-400">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="mt-2 w-full resize-y rounded-xl border border-stone-700 bg-stone-800 px-4 py-3 text-stone-100 outline-none focus:border-amber-400/70" /></label>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-3xl border border-stone-800 bg-stone-900/90 p-6"><h2 className="mb-5 text-lg font-semibold text-stone-100">{title}</h2>{children}</section>; }

export default function DossierGeneratorClient() {
  const [f, setF] = useState<FormState>(EMPTY); const [busy, setBusy] = useState(false);
  const set = (key: keyof FormState, value: string) => setF((current) => ({ ...current, [key]: value }));
  const generate = () => {
    if (!f.formationTitre.trim()) { window.alert("Renseigne au minimum l’intitulé de la formation."); return; }
    setBusy(true);
    try {
      const zip = new PizZip(); const docs: Array<[string, jsPDF]> = [
        ["01_Programme_Inscription_Positionnement.pdf", programmePositionnement(f)], ["02_Convention_Formation.pdf", convention(f)], ["03_Convocations.pdf", convocations(f)], ["04_Feuille_Emargement.pdf", emargement(f)], ["05_Questionnaire_Satisfaction.pdf", satisfaction(f)], ["06_Fiche_Suivi_Pedagogique.pdf", suivi(f)], ["07_Procedure_Utilisation_Dossier.pdf", procedure(f)],
      ];
      docs.forEach(([name, doc]) => zip.file(name, new Uint8Array(doc.output("arraybuffer"))));
      const blob = zip.generate({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `Dossier_${safe(f.clientNom || f.organismeNom || "Client")}_${safe(f.formationTitre)}.zip`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (error) { console.error(error); window.alert("Impossible de générer le dossier."); } finally { setBusy(false); }
  };

  return <div className="px-8 py-10"><div className="mx-auto max-w-5xl"><header className="mb-8"><div className="flex items-center gap-3"><div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-300"><FileArchive size={22} /></div><div><p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">Selen Studio</p><h1 className="mt-1 text-3xl font-semibold text-stone-100">Générateur de dossier de formation</h1></div></div><p className="mt-4 max-w-3xl text-sm leading-6 text-stone-400">Outil temporaire pour les premiers clients Selen. Les données ne sont pas enregistrées en base : elles servent uniquement à produire les documents préremplis à envoyer manuellement par email.</p></header>
    <div className="space-y-6">
      <Card title="1. Organisme de formation"><div className="grid gap-4 md:grid-cols-2"><Field label="Nom / raison sociale" value={f.organismeNom} onChange={(v) => set("organismeNom", v)} /><Field label="Représentant" value={f.organismeRepresentant} onChange={(v) => set("organismeRepresentant", v)} /><Field label="SIRET" value={f.organismeSiret} onChange={(v) => set("organismeSiret", v)} /><Field label="NDA" value={f.organismeNda} onChange={(v) => set("organismeNda", v)} /><Field label="Email" type="email" value={f.organismeEmail} onChange={(v) => set("organismeEmail", v)} /><Field label="Téléphone" value={f.organismeTelephone} onChange={(v) => set("organismeTelephone", v)} /></div><div className="mt-4"><Area label="Adresse complète" rows={3} value={f.organismeAdresse} onChange={(v) => set("organismeAdresse", v)} /></div></Card>
      <Card title="2. Client"><div className="grid gap-4 md:grid-cols-2"><Field label="Raison sociale" value={f.clientNom} onChange={(v) => set("clientNom", v)} /><Field label="Représentant" value={f.clientRepresentant} onChange={(v) => set("clientRepresentant", v)} /><Field label="SIRET" value={f.clientSiret} onChange={(v) => set("clientSiret", v)} /></div><div className="mt-4"><Area label="Adresse complète" rows={3} value={f.clientAdresse} onChange={(v) => set("clientAdresse", v)} /></div></Card>
      <Card title="3. Formation"><div className="space-y-4"><Field label="Intitulé de la formation *" value={f.formationTitre} onChange={(v) => set("formationTitre", v)} /><div className="grid gap-4 md:grid-cols-2"><Field label="Public visé" value={f.formationPublic} onChange={(v) => set("formationPublic", v)} /><Field label="Prérequis" value={f.formationPrerequis} onChange={(v) => set("formationPrerequis", v)} /><Field label="Durée" placeholder="Ex. 14 heures / 2 jours" value={f.formationDuree} onChange={(v) => set("formationDuree", v)} /><Field label="Modalité" placeholder="Présentiel, distanciel..." value={f.formationModalite} onChange={(v) => set("formationModalite", v)} /></div><Area label="Objectifs" value={f.formationObjectifs} onChange={(v) => set("formationObjectifs", v)} /><Area label="Programme complet" rows={16} placeholder="Colle ici le programme complet validé..." value={f.formationProgramme} onChange={(v) => set("formationProgramme", v)} /><Area label="Méthodes et moyens pédagogiques" value={f.formationMethodes} onChange={(v) => set("formationMethodes", v)} /><Area label="Modalités d’évaluation des acquis" value={f.formationEvaluation} onChange={(v) => set("formationEvaluation", v)} /><Area label="Accessibilité / besoins spécifiques" value={f.formationAccessibilite} onChange={(v) => set("formationAccessibilite", v)} /></div></Card>
      <Card title="4. Session"><div className="grid gap-4 md:grid-cols-2"><Field label="Date de début" type="date" value={f.dateDebut} onChange={(v) => set("dateDebut", v)} /><Field label="Date de fin" type="date" value={f.dateFin} onChange={(v) => set("dateFin", v)} /><Field label="Horaires" placeholder="9h00-12h30 / 13h30-17h00" value={f.horaires} onChange={(v) => set("horaires", v)} /><Field label="Formateur" value={f.formateur} onChange={(v) => set("formateur", v)} /><Field label="Lieu" value={f.lieu} onChange={(v) => set("lieu", v)} /><Field label="Tarif" value={f.tarif} onChange={(v) => set("tarif", v)} /></div></Card>
      <Card title="5. Bénéficiaires"><Area label="Un bénéficiaire par ligne" rows={7} placeholder={"Marie Dupont\nJean Martin"} value={f.beneficiaires} onChange={(v) => set("beneficiaires", v)} /></Card>
      <section className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.06] p-6"><h2 className="font-semibold text-stone-100">Documents générés</h2><p className="mt-2 text-sm leading-6 text-stone-400">Programme + inscription/positionnement, convention, convocations, feuille d’émargement, questionnaire de satisfaction, fiche de suivi pédagogique et procédure d’utilisation.</p><p className="mt-2 text-sm leading-6 text-stone-500">L’évaluation des acquis n’est pas générée. La procédure rappelle de conserver une copie de l’évaluation utilisée ou de son résultat.</p></section>
      <div className="flex flex-col gap-3 pb-12 sm:flex-row"><button type="button" onClick={generate} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-4 font-semibold text-black hover:bg-amber-300 disabled:opacity-60"><Download size={18} />{busy ? "Génération..." : "Générer et télécharger le dossier ZIP"}</button><button type="button" onClick={() => window.confirm("Effacer toutes les informations saisies ?") && setF(EMPTY)} className="flex items-center justify-center gap-2 rounded-2xl border border-stone-700 bg-stone-900 px-5 py-4 text-sm text-stone-300 hover:bg-stone-800"><RotateCcw size={17} />Réinitialiser</button></div>
    </div></div></div>;
}
