"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { indicatorAdvice } from "@/content/review/indicatorAdvice";
import { qualiopiGuide } from "@/content/review/qualiopiGuide";
import { reviewProcedure } from "@/content/review/reviewProcedure";
import { downloadReviewResourcePdf } from "@/lib/review/reviewResourcePdf";

export default function AuditGrimoire() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={s.floatingButton}
        className="audit-grimoire-button"
        aria-label="Ouvrir le grimoire auditeur"
      >
        <span style={s.buttonIcon}>📖</span>
        <span>Grimoire auditeur</span>
      </button>

      {open && (
        <div style={s.overlay}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={s.backdrop}
            aria-label="Fermer le grimoire auditeur"
          />

          <aside style={s.drawer}>
            <div style={s.header}>
              <div>
                <p style={s.eyebrow}>Kit agent</p>
                <h2 style={s.title}>Grimoire auditeur</h2>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={s.closeButton}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <p style={s.intro}>
              Aide rapide pour conduire l’audit blanc, vérifier les points
              sensibles et prendre des notes exploitables pendant l’entretien.
            </p>

            <div style={s.content}>
              <Section title="Ressources auditeur">
                <ResourceCard
                  title={reviewProcedure.title}
                  description={reviewProcedure.description}
                  meta={`${reviewProcedure.sections.length} étapes`}
                  actionLabel="Télécharger la procédure Review"
                  onAction={() =>
                    downloadReviewResourcePdf(
                      reviewProcedure,
                      "procedure-utilisation-review.pdf",
                    )
                  }
                />
                <ResourceCard
                  title={qualiopiGuide.title}
                  description={qualiopiGuide.description}
                  meta={`${qualiopiGuide.sections.length} repères`}
                  actionLabel="Télécharger le guide express Qualiopi"
                  onAction={() =>
                    downloadReviewResourcePdf(
                      qualiopiGuide,
                      "guide-express-qualiopi.pdf",
                    )
                  }
                />
                <ResourceCard
                  title="Conseils terrain par indicateur"
                  description="Disponibles par indicateur dans l'outil directement."
                  meta={`${Object.keys(indicatorAdvice).length} indicateurs préparés`}
                />
              </Section>

              <Section title="Liens utiles">
                <LinkItem
                  label="Référentiel national qualité — guide de lecture Qualiopi"
                  href="https://travail-emploi.gouv.fr/referentiel-national-qualite-guide-de-lecture-qualiopi"
                />
                <LinkItem
                  label="Indicateurs — audit initial / renouvellement"
                  href="https://www.canva.com/design/DAF_f-XN68U/pZJVJ8In3qELz0mlWSBfCg/view"
                />
                <LinkItem
                  label="Indicateurs — audit de surveillance"
                  href="https://www.canva.com/design/DAF_f02ybf0/09IKcBzyspBZl215rNaESw/view"
                />
              </Section>

              <Section title="Définitions rapides">
                <Definition term="BPF">
                  Bilan pédagogique et financier. Il permet de vérifier
                  l’activité déclarée par l’organisme de formation. Il se
                  déclare une fois par an, généralement en avril ou mai.
                </Definition>

                <Definition term="Formation courte">
                  Formation de moins de 14 heures. Cette information peut
                  influencer les preuves attendues. Par exemple, l’indicateur 12
                  ne s’applique pas aux formations de moins de 14 heures, même
                  si les heures ne sont pas consécutives.
                </Definition>

                <Definition term="Échantillonnage">
                  Sélection de dossiers représentatifs pour vérifier les preuves
                  sans contrôler toute l’activité du client. L’auditeur procède
                  généralement à l’échantillonnage en début d’audit, à partir de
                  la liste des apprenants ou des actions réalisées.
                </Definition>
              </Section>

              <Section title="Usage des marques Qualiopi">
                <p style={s.text}>
                  L’usage du logo et du certificat doit être vérifié avec
                  attention, car une mauvaise utilisation peut créer une
                  confusion sur le périmètre ou le statut de certification.
                </p>

                <SubBlock title="Logo Qualiopi">
                  <ul style={s.list}>
                    <li>
                      Le logo Qualiopi ne doit pas être utilisé avant
                      certification.
                    </li>
                    <li>Il n’y a aucune obligation de l’utiliser.</li>
                    <li>
                      Il doit toujours être accompagné de la phrase obligatoire
                      mentionnant les catégories d’actions pour lesquelles
                      l’organisme est certifié.
                    </li>
                    <li>
                      Il ne doit pas être modifié, déformé, recoloré ou utilisé
                      d’une manière trompeuse.
                    </li>
                  </ul>
                </SubBlock>

                <SubBlock title="Où le logo peut apparaître">
                  <ul style={s.list}>
                    <li>Sur les pages de présentation de l’organisme.</li>
                    <li>Sur la première page du catalogue de formation.</li>
                    <li>Dans la signature des emails.</li>
                  </ul>
                </SubBlock>

                <SubBlock title="Où il ne doit pas apparaître">
                  <ul style={s.list}>
                    <li>En pied de page permanent du site internet.</li>
                    <li>
                      Sur des documents liés à une formation en particulier :
                      supports, programmes, fiches outils, exercices, etc.
                    </li>
                    <li>
                      Sur des documents qui pourraient laisser penser que la
                      certification porte sur une formation, un bénéficiaire ou
                      une réussite individuelle.
                    </li>
                  </ul>
                </SubBlock>

                <SubBlock title="Certificat Qualiopi">
                  <ul style={s.list}>
                    <li>
                      Le certificat doit être accessible ou communiqué au
                      public.
                    </li>
                    <li>
                      Il doit être affiché sur le site internet si l’organisme
                      en possède un.
                    </li>
                    <li>
                      Il doit être affiché dans les locaux si l’organisme
                      accueille du public dans ses locaux.
                    </li>
                    <li>
                      Le certificat doit correspondre au bon périmètre
                      d’activité.
                    </li>
                    <li>Le certificat doit être en cours de validité.</li>
                  </ul>
                </SubBlock>

                <p style={s.warningText}>
                  Point de vigilance : attention aux mentions qui peuvent
                  laisser croire à une certification non obtenue ou à un
                  périmètre plus large que celui réellement certifié.
                </p>
              </Section>

              <Section title="Échantillonnage">
                <p style={s.text}>
                  L’échantillonnage sert à vérifier des preuves réelles sur des
                  dossiers représentatifs. Il ne s’agit pas de tout contrôler,
                  mais de repérer les risques principaux.
                </p>

                <ul style={s.list}>
                  <li>
                    Choisir des dossiers représentatifs de l’activité réelle.
                  </li>
                  <li>
                    Varier si possible les clients, les formations, les dates et
                    les modalités : présentiel, distanciel, sous-traitance ou
                    non, formations les plus dispensées.
                  </li>
                  <li>
                    Noter les dossiers consultés dès le début de l’audit blanc,
                    idéalement au moment du profil.
                  </li>
                  <li>
                    Pour un audit d’une journée, hors audit initial, l’auditeur
                    choisit souvent quelques dossiers clients représentatifs.
                  </li>
                  <li>
                    Les preuves observées doivent appartenir au dossier
                    échantillonné. Ne pas prendre la convocation d’un client et
                    l’évaluation d’un autre.
                  </li>
                  <li>
                    Pour chaque client échantillonné, les preuves attendues
                    doivent être présentes pour chaque indicateur concerné.
                  </li>
                </ul>
              </Section>

              <Section title="Prise de notes">
                <p style={s.text}>
                  Dans chaque note, indiquer les preuves vues, les écarts
                  constatés, les documents publiés dans l’espace client et une
                  proposition concrète de correction.
                </p>

                <SubBlock title="À noter systématiquement">
                  <ul style={s.list}>
                    <li>Les documents présentés par le client.</li>
                    <li>Ce qui est conforme.</li>
                    <li>Ce qui n’est pas conforme.</li>
                    <li>Pourquoi le point est considéré comme non conforme.</li>
                    <li>
                      Les documents ou modèles rendus visibles dans l’espace
                      client.
                    </li>
                    <li>
                      Un exemple concret de correction attendue, si possible.
                    </li>
                    <li>
                      Les preuves à conserver : notes, captures d’écran,
                      documents transmis, exports, emails, etc.
                    </li>
                  </ul>
                </SubBlock>

                <div style={s.exampleBox}>
                  <p style={s.exampleLabel}>Exemple de note</p>

                  <p style={s.exampleText}>
                    Vu : convocation de M. XX mentionnant la date, l’heure et le
                    lieu de la formation. Vu également le tableau “nom du
                    document”.
                  </p>

                  <p style={s.exampleText}>
                    Écart : le livret d’accueil ne mentionne pas les modalités
                    d’accueil. Le logo Qualiopi n’est pas conforme : la
                    catégorie d’action est manquante.
                  </p>

                  <p style={s.exampleText}>
                    Correction proposée : ajouter les mentions manquantes dans
                    le livret d’accueil et corriger l’usage du logo en ajoutant
                    la phrase obligatoire avec la catégorie d’action certifiée.
                  </p>

                  <p style={s.exampleText}>
                    Preuves à conserver : version corrigée du livret, capture de
                    l’emplacement du logo, document ou capture montrant la
                    correction.
                  </p>
                </div>
              </Section>
            </div>
          </aside>
        </div>
      )}

      <style>{css}</style>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details style={s.section} open={title === "Prise de notes"}>
      <summary style={s.sectionTitle}>{title}</summary>
      <div style={s.sectionBody}>{children}</div>
    </details>
  );
}

function LinkItem({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={s.link}>
      {label} →
    </a>
  );
}

function ResourceCard({
  title,
  description,
  meta,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  meta: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article style={s.resourceCard}>
      <p style={s.resourceMeta}>{meta}</p>
      <h3 style={s.resourceTitle}>{title}</h3>
      <p style={s.resourceDescription}>{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={s.resourceButton}
          className="sel-btn-ghost"
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function Definition({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div style={s.definition}>
      <strong style={s.definitionTerm}>{term}</strong>
      <p style={s.definitionText}>{children}</p>
    </div>
  );
}

function SubBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={s.subBlock}>
      <p style={s.subBlockTitle}>{title}</p>
      {children}
    </div>
  );
}

const C = {
  bg: "#1a1510",
  surface: "#221c14",
  surfaceDeep: "#18120d",
  border: "rgba(196,169,106,0.18)",
  borderStrong: "rgba(196,169,106,0.34)",
  gold: "#c4a96a",
  goldBright: "#d4a843",
  text: "rgba(255,255,255,0.88)",
  textSoft: "rgba(255,255,255,0.58)",
  textFaint: "rgba(255,255,255,0.28)",
  warning: "#d4a843",
};

const s: Record<string, CSSProperties> = {
  floatingButton: {
    position: "fixed",
    right: 22,
    bottom: 22,
    zIndex: 80,
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
    padding: "0.72rem 1rem",
    borderRadius: 999,
    border: `1px solid ${C.borderStrong}`,
    background: "linear-gradient(135deg, #2a2117, #1a1510)",
    color: C.gold,
    fontSize: "0.86rem",
    fontWeight: 800,
    fontFamily: "Georgia, serif",
    cursor: "pointer",
    boxShadow: "0 14px 34px rgba(0,0,0,0.42)",
  },
  buttonIcon: {
    fontSize: "1rem",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    border: "none",
    background: "rgba(0,0,0,0.48)",
    cursor: "default",
  },
  drawer: {
    position: "relative",
    zIndex: 101,
    width: "min(460px, 92vw)",
    height: "100vh",
    overflowY: "auto",
    background:
      "radial-gradient(circle at top, rgba(196,169,106,0.12), transparent 34%), #1a1510",
    borderLeft: `1px solid ${C.borderStrong}`,
    boxShadow: "-22px 0 70px rgba(0,0,0,0.55)",
    padding: "1.4rem",
    color: C.text,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: "1rem",
    alignItems: "flex-start",
    marginBottom: "0.8rem",
  },
  eyebrow: {
    color: C.gold,
    textTransform: "uppercase",
    letterSpacing: "0.16em",
    fontSize: "0.68rem",
    fontFamily: "sans-serif",
    marginBottom: "0.35rem",
  },
  title: {
    margin: 0,
    color: C.text,
    fontSize: "1.55rem",
    lineHeight: 1.15,
    fontFamily: "Georgia, serif",
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.04)",
    color: C.gold,
    cursor: "pointer",
    fontWeight: 800,
  },
  intro: {
    color: C.textSoft,
    lineHeight: 1.6,
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
    marginBottom: "1rem",
  },
  content: {
    display: "grid",
    gap: "0.75rem",
  },
  section: {
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    background: C.surface,
    overflow: "hidden",
  },
  sectionTitle: {
    cursor: "pointer",
    padding: "0.9rem 1rem",
    color: C.gold,
    fontWeight: 800,
    fontSize: "0.88rem",
    fontFamily: "sans-serif",
  },
  sectionBody: {
    borderTop: `1px solid ${C.border}`,
    padding: "0.95rem 1rem 1rem",
    display: "grid",
    gap: "0.75rem",
  },
  link: {
    display: "block",
    color: C.text,
    textDecoration: "none",
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.7rem",
    fontSize: "0.82rem",
    lineHeight: 1.4,
    fontFamily: "sans-serif",
  },
  resourceCard: {
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "0.78rem",
  },
  resourceMeta: {
    color: C.gold,
    fontSize: "0.68rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
    fontFamily: "sans-serif",
    marginBottom: "0.32rem",
  },
  resourceTitle: {
    margin: "0 0 0.35rem",
    color: C.text,
    fontSize: "0.92rem",
    lineHeight: 1.25,
    fontFamily: "Georgia, serif",
  },
  resourceDescription: {
    color: C.textSoft,
    fontSize: "0.8rem",
    lineHeight: 1.5,
    fontFamily: "sans-serif",
  },
  resourceButton: {
    marginTop: "0.65rem",
    width: "100%",
    border: `1px solid ${C.borderStrong}`,
    borderRadius: 8,
    background: "rgba(196,169,106,0.08)",
    color: C.gold,
    padding: "0.55rem 0.65rem",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontWeight: 800,
    fontFamily: "sans-serif",
    textAlign: "left",
  },
  definition: {
    borderLeft: `2px solid ${C.gold}`,
    paddingLeft: "0.75rem",
  },
  definitionTerm: {
    color: C.text,
    fontSize: "0.84rem",
    fontFamily: "sans-serif",
  },
  definitionText: {
    color: C.textSoft,
    fontSize: "0.8rem",
    lineHeight: 1.5,
    marginTop: "0.2rem",
    fontFamily: "sans-serif",
  },
  subBlock: {
    border: `1px solid ${C.border}`,
    background: "rgba(255,255,255,0.025)",
    borderRadius: 8,
    padding: "0.75rem",
  },
  subBlockTitle: {
    color: C.gold,
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.09em",
    fontWeight: 800,
    fontFamily: "sans-serif",
    marginBottom: "0.45rem",
  },
  list: {
    margin: 0,
    paddingLeft: "1.1rem",
    color: C.textSoft,
    fontSize: "0.82rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  },
  text: {
    color: C.textSoft,
    fontSize: "0.82rem",
    lineHeight: 1.6,
    fontFamily: "sans-serif",
  },
  warningText: {
    color: C.warning,
    fontSize: "0.8rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
    borderLeft: `2px solid ${C.warning}`,
    paddingLeft: "0.75rem",
  },
  exampleBox: {
    border: `1px solid ${C.borderStrong}`,
    background: "rgba(196,169,106,0.06)",
    borderRadius: 8,
    padding: "0.8rem",
    display: "grid",
    gap: "0.55rem",
  },
  exampleLabel: {
    color: C.gold,
    textTransform: "uppercase",
    letterSpacing: "0.11em",
    fontSize: "0.64rem",
    fontWeight: 800,
    fontFamily: "sans-serif",
  },
  exampleText: {
    color: C.textSoft,
    fontSize: "0.8rem",
    lineHeight: 1.55,
    fontFamily: "sans-serif",
  },
};

const css = `
  .audit-grimoire-button:hover {
    transform: translateY(-1px);
    border-color: rgba(196,169,106,0.55) !important;
    box-shadow: 0 18px 44px rgba(0,0,0,0.52);
  }

  @media (max-width: 640px) {
    .audit-grimoire-button {
      right: 14px !important;
      bottom: 14px !important;
    }
  }
`;
