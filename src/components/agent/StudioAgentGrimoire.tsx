"use client";

import Link from "next/link";
import { BookOpen, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Tab = "parcours" | "cas" | "faq";
type Entry = { phase: string; title: string; detail: string; href?: string; action?: string };

const journey: Entry[] = [
  { phase: "Avant", title: "Ouvrir et attribuer le bon organisme", detail: "Pars du dossier organisme. Vérifie l’identité, le contact et l’agent responsable avant d’agir. La délégation ne change jamais le périmètre de l’organisme.", href: "/agent/daily/organisations", action: "Organismes Daily" },
  { phase: "Avant", title: "Contrôler la formation", detail: "Vérifie le programme, le positionnement, les prérequis et leurs justificatifs. Une formation validée ne doit perdre ni son statut, ni ses sessions, ni ses inscriptions lors d’une correction.", href: "/agent/daily/formations", action: "Formations" },
  { phase: "Avant", title: "Traiter chaque candidature", detail: "Besoins, positionnement, pièces et décision appartiennent au dossier individuel. N’admets pas un candidat tant qu’une exigence obligatoire applicable à son dossier reste manquante ou refusée.", href: "/agent/daily/candidatures", action: "Candidatures" },
  { phase: "Avant", title: "Préparer la session", detail: "Contrôle inscrits, entreprise, formateur, accès, convocations, conventions et signatures. Une inscription collective produit toujours des dossiers individuels identifiables.", href: "/agent/daily/session-dossiers", action: "Dossiers de session" },
  { phase: "Pendant", title: "Suivre la session réelle", detail: "Utilise les horaires et créneaux réels. Consigne incidents, adaptations, absences et actions engagées sans signer ni répondre à la place d’un participant.", href: "/agent/daily/suivi-sessions", action: "Suivi des sessions" },
  { phase: "Pendant", title: "Contrôler les alertes utiles", detail: "Une tâche active doit correspondre à une action humaine restante. Si le parent est annulé, supprimé ou sans objet, la tâche quitte immédiatement les vues actives.", href: "/agent/daily", action: "Pilotage Daily" },
  { phase: "Après", title: "Vérifier évaluation et satisfaction", detail: "Contrôle le résultat final, les retours et les relances. Les relances s’arrêtent dès que l’action est réalisée ; seul « Acquis » compte comme réussite.", href: "/agent/daily/satisfaction", action: "Satisfaction" },
  { phase: "Après", title: "Publier les documents de fin", detail: "Attestations et documents de fin sont générés et publiés une seule fois, avec le bon périmètre et une trace exploitable.", href: "/agent/daily/posttraining-documents", action: "Documents après formation" },
  { phase: "Après", title: "Clôturer sans tâche zombie", detail: "Avant la clôture, vérifie présences, évaluation, satisfaction, documents et historique. Aucune tâche terminée, annulée ou devenue sans objet ne reste active.", href: "/agent/daily/session-dossiers", action: "Clôtures de session" },
];

const specialCases: Entry[] = [
  { phase: "Inscription collective", title: "Conserver une identité stable par salarié", detail: "La dirigeante peut porter le dossier collectif initial, mais chaque salarié conserve son email, son dossier, ses réponses, ses justificatifs et son historique. Répéter l’action ne doit créer aucun doublon.", href: "/agent/daily/session-dossiers", action: "Dossiers de session" },
  { phase: "Désinscription", title: "Annuler sans supprimer", detail: "Utilise la désinscription prévue : statut historisé, accès révoqués et effectifs recalculés. N’efface jamais l’inscription ni ses preuves. Une annulation n’est pas un abandon." },
  { phase: "Rétractation", title: "Distinguer droit de rétractation et abandon", detail: "Trace la demande et son contexte contractuel. Ne transforme pas automatiquement une rétractation en abandon pédagogique ; transmets le cas sensible si la règle applicable n’est pas certaine." },
  { phase: "Absence", title: "Tracer le créneau concerné", detail: "Vérifie le créneau réel, l’émargement et le motif disponible. Informe les acteurs autorisés et conserve la preuve de l’action ; ne fabrique jamais une signature." },
  { phase: "Document manquant", title: "Relancer seulement tant que nécessaire", detail: "Identifie l’exigence et le dossier concernés, puis utilise la relance prévue. La tâche disparaît dès que la pièce est reçue, validée ou devenue sans objet." },
  { phase: "Pièce rejetée", title: "Permettre un remplacement traçable", detail: "Le rejet doit être motivé et rattaché au bon dossier. Le remplacement conserve l’historique ; les autres pièces déjà vérifiées restent intactes." },
  { phase: "Réclamation", title: "Qualifier, agir ou transmettre", detail: "Passe de Reçue à En analyse, puis Action requise, Traitée et Clôturée. Conserve messages, pièces et personnes impliquées ; ne partage rien hors du périmètre autorisé.", href: "/agent/daily/reclamations", action: "Réclamations" },
  { phase: "Email", title: "Écrire depuis Studio et conserver la trace", detail: "Choisis l’organisme, le destinataire, l’objet et le contexte exact. Aucun envoi ne part avant le clic sur Envoyer ; vérifie ensuite le statut dans les communications.", href: "/agent/daily/communications", action: "Historique des communications" },
];

const faq: Entry[] = [
  { phase: "Responsabilité", title: "Quand l’agent doit-il intervenir ?", detail: "Quand une décision, un contrôle ou une action humaine reste réellement nécessaire. Selen automatise les rappels et la préparation ; l’agent garde les décisions sensibles et la vérification métier." },
  { phase: "Délégation", title: "Que permet « Agir pour cet OF » ?", detail: "Réaliser une action autorisée dans le contexte de cet organisme. Cela ne permet pas de voir ou modifier les données d’un autre OF, ni de contourner Auth ou RLS." },
  { phase: "Historique", title: "Pourquoi une tâche a-t-elle disparu ?", detail: "Elle est terminée, annulée ou devenue sans objet. Elle quitte les listes et compteurs actifs, mais sa trace peut rester dans le parcours ou l’historique." },
  { phase: "Conformité", title: "Puis-je corriger une donnée à la place du client ?", detail: "Seulement si l’action Studio existe, si ton rôle l’autorise et si la source métier est vérifiée. Ne crée jamais de preuve, signature, réponse ou consentement fictif." },
  { phase: "Confidentialité", title: "Quelles données puis-je consulter ?", detail: "Uniquement les organismes et dossiers autorisés par ton rôle et ton affectation. Le Grimoire ne charge aucune donnée client et ne contient aucune note propre à un OF." },
  { phase: "Incident", title: "Que faire si un écran ou une action échoue ?", detail: "Lis l’erreur visible, évite les doubles clics et vérifie si l’action a réellement été enregistrée avant de recommencer. Conserve le contexte et transmets le blocage technique sans modifier les données pour le masquer." },
];

function contextHelp(pathname: string) {
  if (pathname.includes("/daily/organisations")) return "Vérifie ici le périmètre OF, l’affectation et les actions déléguées avant toute intervention.";
  if (pathname.includes("/daily/formations")) return "Contrôle ici programme, positionnement, prérequis et statut sans casser les sessions existantes.";
  if (pathname.includes("/daily/candidatures")) return "Traite ici chaque dossier individuel et ses preuves, sans mélanger candidats ni organismes.";
  if (pathname.includes("/daily/session-dossiers") || pathname.includes("/daily/sessions")) return "Suis ici la session, chaque participant, les acteurs, documents, signatures et actions restantes.";
  if (pathname.includes("/daily/communications")) return "Retrouve ici les emails automatiques et manuels avec date, destinataire, objet, statut et contexte.";
  if (pathname.includes("/daily/reclamations")) return "Qualifie ici la réclamation, les actions, les pièces et la clôture traçable.";
  if (pathname.includes("/gestion/factures")) return "Vérifie ici l’état réel des factures ; ne renumérote ni ne réutilise jamais un numéro émis.";
  return "Le Grimoire te guide dans les procédures agents Avant, Pendant et Après formation.";
}

export default function StudioAgentGrimoire() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("parcours");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("fr"));
  const source = tab === "parcours" ? journey : tab === "cas" ? specialCases : faq;
  const visible = useMemo(() => deferredQuery ? source.filter((entry) => `${entry.phase} ${entry.title} ${entry.detail}`.toLocaleLowerCase("fr").includes(deferredQuery)) : source, [deferredQuery, source]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return <div className="studio-grimoire">
    {open ? <aside id="studio-agent-grimoire" role="dialog" aria-modal="false" aria-labelledby="studio-grimoire-title" className="studio-grimoire-panel">
      <header><div><small>Procédures internes agents</small><h2 id="studio-grimoire-title">Grimoire métier Studio</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Fermer le Grimoire"><X size={19} /></button></header>
      <p className="studio-grimoire-context"><strong>Sur cet écran :</strong> {contextHelp(pathname)}</p>
      <div className="studio-grimoire-tabs" role="tablist" aria-label="Rubriques du Grimoire">
        <button type="button" role="tab" aria-selected={tab === "parcours"} onClick={() => setTab("parcours")}>Parcours</button>
        <button type="button" role="tab" aria-selected={tab === "cas"} onClick={() => setTab("cas")}>Cas particuliers</button>
        <button type="button" role="tab" aria-selected={tab === "faq"} onClick={() => setTab("faq")}>FAQ agents</button>
      </div>
      <label className="studio-grimoire-search"><span>Rechercher dans l’aide interne</span><span className="studio-grimoire-field"><Search size={16} aria-hidden /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. absence, prérequis, clôture…" /></span></label>
      <p className="studio-grimoire-count" aria-live="polite">{visible.length} résultat{visible.length > 1 ? "s" : ""}</p>
      <div className="studio-grimoire-results" role="tabpanel">{visible.map((entry) => <details key={`${entry.phase}:${entry.title}`}><summary><span>{entry.phase}</span>{entry.title}</summary><p>{entry.detail}</p>{entry.href ? <Link href={entry.href}>{entry.action ?? "Ouvrir l’écran"} →</Link> : null}</details>)}{visible.length === 0 ? <p>Aucun résultat. Essaie un autre mot.</p> : null}</div>
    </aside> : null}
    <button type="button" className="studio-grimoire-trigger" aria-expanded={open} aria-controls="studio-agent-grimoire" onClick={() => setOpen((current) => !current)}><BookOpen size={18} aria-hidden /> Grimoire</button>
    <style jsx>{`
      .studio-grimoire{position:fixed;right:20px;bottom:82px;z-index:999}.studio-grimoire-trigger{min-height:44px;display:flex;align-items:center;gap:7px;border-radius:999px;border:1px solid rgba(245,208,138,.45);background:var(--selen-card);color:var(--selen-gold2);padding:10px 15px;font-weight:800;box-shadow:0 8px 28px rgba(0,0,0,.42);cursor:pointer}.studio-grimoire-trigger:focus-visible,.studio-grimoire button:focus-visible,.studio-grimoire a:focus-visible,.studio-grimoire input:focus-visible{outline:3px solid var(--selen-gold2);outline-offset:2px}.studio-grimoire-panel{position:absolute;right:0;bottom:56px;width:min(470px,calc(100vw - 28px));max-height:min(74vh,720px);display:grid;grid-template-rows:auto auto auto auto auto minmax(0,1fr);overflow:hidden;border:1px solid rgba(245,208,138,.34);border-radius:16px;background:var(--selen-card);color:var(--selen-text-oncard);box-shadow:0 20px 60px rgba(0,0,0,.58)}header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px;background:linear-gradient(135deg,rgba(201,148,58,.17),rgba(255,255,255,.025));border-bottom:1px solid rgba(245,208,138,.2)}header small{display:block;color:var(--selen-gold);font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}h2{margin:4px 0 0;font-family:Georgia,serif;font-size:22px}header button{border:1px solid rgba(245,208,138,.25);border-radius:50%;width:34px;height:34px;display:grid;place-items:center;background:rgba(255,255,255,.04);color:var(--selen-gold2);cursor:pointer}.studio-grimoire-context{margin:0;padding:12px 18px;background:rgba(201,148,58,.09);border-bottom:1px solid rgba(245,208,138,.17);color:var(--selen-text2-oncard);line-height:1.45}.studio-grimoire-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:12px 18px 4px}.studio-grimoire-tabs button{min-height:40px;border:1px solid rgba(245,208,138,.22);border-radius:8px;background:rgba(255,255,255,.03);color:var(--selen-text2-oncard);font-weight:800;cursor:pointer}.studio-grimoire-tabs button[aria-selected="true"]{background:rgba(201,148,58,.2);border-color:var(--selen-gold);color:var(--selen-gold2)}.studio-grimoire-search{display:grid;gap:5px;padding:10px 18px 3px;font-size:12px;font-weight:800}.studio-grimoire-field{display:flex;align-items:center;gap:8px;border:1px solid rgba(245,208,138,.25);border-radius:9px;background:rgba(0,0,0,.18);padding:0 10px}.studio-grimoire-field input{width:100%;min-height:42px;border:0;outline:0;background:transparent;color:var(--selen-text-oncard);font:inherit}.studio-grimoire-field input::placeholder{color:var(--selen-text3-oncard)}.studio-grimoire-count{margin:5px 18px;color:var(--selen-text3-oncard);font-size:11px}.studio-grimoire-results{overflow:auto;padding:2px 18px 18px;overscroll-behavior:contain}.studio-grimoire-results details{margin-top:8px;border:1px solid rgba(245,208,138,.18);border-radius:10px;background:rgba(255,255,255,.025)}.studio-grimoire-results summary{padding:12px;cursor:pointer;font-weight:800;line-height:1.4}.studio-grimoire-results summary span{display:block;margin-bottom:3px;color:var(--selen-gold);font-size:9px;letter-spacing:.1em;text-transform:uppercase}.studio-grimoire-results details[open] summary{background:rgba(201,148,58,.07);border-bottom:1px solid rgba(245,208,138,.16)}.studio-grimoire-results p{margin:0;padding:11px 12px;color:var(--selen-text2-oncard);line-height:1.5}.studio-grimoire-results a{display:inline-block;margin:0 12px 12px;color:var(--selen-gold2);font-weight:800}@media(max-width:700px){.studio-grimoire{right:12px;bottom:78px}.studio-grimoire-panel{position:fixed;right:12px;bottom:136px;max-height:calc(100dvh - 154px)}.studio-grimoire-tabs{grid-template-columns:1fr}.studio-grimoire-results{content-visibility:auto}}
    `}</style>
  </div>;
}
