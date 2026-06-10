import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type AdminClient = SupabaseClient<any>;

type Answer = "yes" | "partial" | "no" | "unknown";
type Diagnostic = "a_verifier" | "majeure" | "mineure" | "conforme";

type OrganisationRow = {
  id: string;
  name: string | null;
  email: string | null;
  siret: string | null;
  nda_number: string | null;
};

type DossierRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  organisation_id: string | null;
  created_at: string;
  updated_at: string;
  organisations: OrganisationRow | OrganisationRow[] | null;
};

type PreauditSessionRow = {
  id: string;
  user_id: string;
  status: string | null;
  audit_type: string | null;
  nda_number: string | null;
  nda_obtained_at: string | null;
  is_new_entrant: boolean | null;
  profile_data: Record<string, unknown> | null;
  applicable_indicators: number[] | null;
  excluded_indicators: number[] | null;
  created_at: string;
  updated_at: string | null;
};

type QuestionRow = {
  id: string;
  question_order: number;
  question: string;
  help_text: string | null;
  is_critical: boolean;
  affects_major: boolean;
  affects_minor: boolean;
  display_condition: Record<string, unknown> | null;
};

type PreauditAnswerRow = {
  question_id: string;
  answer: string | null;
};

type SummaryQuestionRow = QuestionRow & {
  answer: string | null;
};

type SummaryRow = {
  indicatorNumber: number;
  title: string;
  status: string | null;
  score: number | null;
  riskLevel: string | null;
  diagnosis: string | null;
  correctiveActions: unknown;
  recommendedModels: unknown;
  diagnostic: Diagnostic;
  answeredCount: number;
  totalQuestions: number;
  issues: string[];
  note: string;
  questions: SummaryQuestionRow[];
};

type PreauditIndicatorResultRow = {
  session_id: string;
  indicator_number: number;
  status: string | null;
  score: number | null;
  risk_level: string | null;
  diagnosis: string | null;
  corrective_actions: unknown;
  recommended_models: unknown;
};

type PreauditIndicatorNoteRow = Record<string, unknown>;

function getSupabaseAdminClient(): AdminClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Configuration Supabase admin manquante : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }) as AdminClient;
}

async function findAuthUserIdByEmail(admin: AdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(
        `Impossible de retrouver le compte client Supabase Auth. ${error.message}`,
      );
    }

    const found = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );

    if (found?.id) return found.id;

    if (data.users.length < perPage) break;

    page += 1;
  }

  return null;
}

function normalizeOrganisation(
  organisation: OrganisationRow | OrganisationRow[] | null,
) {
  if (Array.isArray(organisation)) return organisation[0] ?? null;
  return organisation;
}

function diagnosticLabel(diagnostic: Diagnostic) {
  if (diagnostic === "majeure") return "Non-conformité majeure probable";
  if (diagnostic === "mineure") return "Non-conformité mineure probable";
  if (diagnostic === "a_verifier") return "À vérifier";
  return "Conforme";
}

function diagnosticVariant(diagnostic: Diagnostic) {
  if (diagnostic === "conforme") return "success";
  if (diagnostic === "majeure") return "danger";
  if (diagnostic === "mineure") return "warn";
  return "info";
}

function formatAuditType(value?: string | null) {
  if (value === "initial") return "Initial";
  if (value === "surveillance") return "Surveillance";
  if (value === "renouvellement") return "Renouvellement";
  return "Non renseigné";
}

function formatAnswer(value?: string | null) {
  if (value === "yes") return "Oui";
  if (value === "partial") return "Partiellement";
  if (value === "no") return "Non";
  if (value === "unknown") return "Je ne sais pas";
  return value || "—";
}

function formatNullableValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item)
          : JSON.stringify(item),
      )
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function extractIndicatorNote(row: PreauditIndicatorNoteRow | null) {
  if (!row) return "";

  const value =
    row.note ??
    row.user_notes ??
    row.client_note ??
    row.content ??
    row.notes ??
    "";

  return typeof value === "string" ? value.trim() : String(value);
}

function mapResultStatusToDiagnostic(status?: string | null): Diagnostic {
  if (status === "conforme") return "conforme";
  if (status === "majeure") return "majeure";
  if (status === "mineure") return "mineure";
  return "a_verifier";
}

function getIssues(questions: QuestionRow[], answers: Record<string, Answer>) {
  const issues: string[] = [];

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    if (answer === "no" && q.affects_major) {
      issues.push(`❌ ${q.question}`);
    }

    if (answer === "partial" && q.affects_major) {
      issues.push(`⚠️ ${q.question}`);
    }

    if (answer === "no" && q.affects_minor) {
      issues.push(`⚠️ ${q.question}`);
    }
  });

  return issues;
}

async function getSummaryRows(
  admin: AdminClient,
  session: PreauditSessionRow,
): Promise<SummaryRow[]> {
  const applicableIndicators = session.applicable_indicators ?? [];

  const rows = await Promise.all(
    applicableIndicators.map(async (indicatorNumber) => {
      const { data: indicatorData } = await admin
        .from("preaudit_indicators")
        .select("title, simplified_title")
        .eq("number", indicatorNumber)
        .maybeSingle();

      const { data: questionData } = await admin
        .from("preaudit_questions")
        .select(
          "id, question_order, question, help_text, is_critical, affects_major, affects_minor, display_condition",
        )
        .eq("indicator_number", indicatorNumber)
        .order("question_order", { ascending: true });

      const questions = (questionData ?? []) as QuestionRow[];
      const questionIds = questions.map((question) => question.id);

      const answers: Record<string, Answer> = {};

      const { data: answerData } = questionIds.length
        ? await admin
            .from("preaudit_answers")
            .select("question_id, answer")
            .eq("session_id", session.id)
            .in("question_id", questionIds)
        : { data: [] };

      const indicatorAnswers = Array.isArray(answerData)
        ? (answerData as PreauditAnswerRow[])
        : [];
      const answerByQuestionId = new Map(
        indicatorAnswers.map((answer) => [answer.question_id, answer]),
      );

      indicatorAnswers.forEach(
        (row) => {
          if (row.answer && ["yes", "partial", "no", "unknown"].includes(row.answer)) {
            answers[row.question_id] = row.answer as Answer;
          }
        },
      );

      const { data: resultData } = await admin
        .from("preaudit_indicator_results")
        .select(
          "session_id, indicator_number, status, score, risk_level, diagnosis, corrective_actions, recommended_models",
        )
        .eq("session_id", session.id)
        .eq("indicator_number", indicatorNumber)
        .maybeSingle();

      const result = resultData as PreauditIndicatorResultRow | null;

      const { data: noteData } = await admin
        .from("preaudit_indicator_notes")
        .select("*")
        .eq("session_id", session.id)
        .eq("indicator_number", indicatorNumber)
        .maybeSingle();

      const indicatorNote = extractIndicatorNote(
        noteData as PreauditIndicatorNoteRow | null,
      );

      const answeredCount = Object.keys(answers).filter((questionId) =>
        questions.some((question) => question.id === questionId),
      ).length;

      const diagnostic = result
        ? mapResultStatusToDiagnostic(result.status)
        : "a_verifier";
      const issues = getIssues(questions, answers);
      const detailedQuestions = questions.map((question) => {
        const answer = answerByQuestionId.get(question.id);

        return {
          ...question,
          answer: answer?.answer ?? null,
        };
      });

      return {
        indicatorNumber,
        title:
          indicatorData?.simplified_title ||
          indicatorData?.title ||
          `Indicateur ${indicatorNumber}`,
        status: result?.status ?? null,
        score: result?.score ?? null,
        riskLevel: result?.risk_level ?? null,
        diagnosis: result?.diagnosis ?? null,
        correctiveActions: result?.corrective_actions ?? null,
        recommendedModels: result?.recommended_models ?? null,
        diagnostic,
        answeredCount,
        totalQuestions: questions.length,
        issues,
        note: indicatorNote,
        questions: detailedQuestions,
      };
    }),
  );

  return rows.sort((a, b) => a.indicatorNumber - b.indicatorNumber);
}

export default async function AgentPreauditSummaryPage({ params }: PageProps) {
  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const { data: dossierRaw, error: dossierError } = await admin
    .from("dossiers")
    .select(
      `
      id,
      title,
      type,
      status,
      organisation_id,
      created_at,
      updated_at,
      organisations:organisation_id (
        id,
        name,
        email,
        siret,
        nda_number
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (dossierError) {
    throw new Error(
      `Impossible de charger le dossier. ${dossierError.message}`,
    );
  }

  if (!dossierRaw) notFound();

  const dossier = dossierRaw as DossierRow;

  if (dossier.type !== "preaudit") {
    notFound();
  }

  const organisation = normalizeOrganisation(dossier.organisations);

  const userId = organisation?.email
    ? await findAuthUserIdByEmail(admin, organisation.email)
    : null;

  const { data: sessionRaw, error: sessionError } = userId
    ? await admin
        .from("preaudit_sessions")
        .select(
          "id, user_id, status, audit_type, nda_number, nda_obtained_at, is_new_entrant, profile_data, applicable_indicators, excluded_indicators, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };

  if (sessionError) {
    throw new Error(
      `Impossible de charger la session préaudit. ${sessionError.message}`,
    );
  }

  const session = sessionRaw as PreauditSessionRow | null;
  const summaryRows = session ? await getSummaryRows(admin, session) : [];

  const defectiveRows = summaryRows.filter(
    (row) => row.diagnostic === "majeure" || row.diagnostic === "mineure",
  );
  const toVerifyRows = summaryRows.filter(
    (row) => row.diagnostic === "a_verifier",
  );
  const conformeRows = summaryRows.filter(
    (row) => row.diagnostic === "conforme",
  );

  const answeredIndicators = summaryRows.filter(
    (row) => row.answeredCount > 0 || row.diagnostic !== "a_verifier",
  ).length;

  const applicableCount = session?.applicable_indicators?.length ?? 0;
  const excludedCount = session?.excluded_indicators?.length ?? 0;
  const excludedIndicatorsLabel = session?.excluded_indicators?.length
    ? session.excluded_indicators.join(", ")
    : "—";
  const refreshHref = `/agent/dossiers/${dossier.id}/preaudit`;
  const progressPercent =
    applicableCount > 0
      ? Math.round((answeredIndicators / applicableCount) * 100)
      : 0;

  return (
    <main
      style={{
        padding: 0,
        background: "var(--selen-bg)",
        minHeight: "100vh",
        color: "var(--selen-text)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          padding: "14px 28px",
          borderBottom: "1px solid var(--selen-border)",
          background: "var(--selen-bg)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--selen-text3)",
          }}
        >
          <Link
            href="/agent/dossiers"
            style={{ color: "var(--selen-text3)", textDecoration: "none" }}
          >
            Dossiers
          </Link>
          <span style={{ opacity: 0.4 }}>›</span>
          <Link
            href={`/agent/dossiers/${dossier.id}`}
            style={{ color: "var(--selen-text3)", textDecoration: "none" }}
          >
            {dossier.title}
          </Link>
          <span style={{ opacity: 0.4 }}>›</span>
          <span style={{ color: "var(--selen-text2)" }}>Synthèse préaudit</span>
        </div>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 9,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "var(--selen-gold)",
              opacity: 0.8,
            }}
          >
            Préaudit Qualiopi
          </p>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--selen-text)",
              marginTop: 8,
              lineHeight: 1.2,
            }}
          >
            Synthèse du préaudit
          </h1>

          <p
            style={{
              fontSize: 13,
              color: "var(--selen-text3)",
              lineHeight: 1.6,
              maxWidth: 760,
              marginTop: 10,
            }}
          >
            Vue agent reconstruite à partir des réponses client. Elle permet de
            vérifier rapidement l’avancement, les indicateurs en défaut et les
            notes saisies pendant l’auto-audit.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <SelenCard>
            <SelenCardTitle>Client</SelenCardTitle>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 14,
              }}
            >
              {[
                { label: "Nom", value: organisation?.name },
                { label: "Email", value: organisation?.email },
                { label: "SIRET", value: organisation?.siret },
                { label: "NDA", value: organisation?.nda_number },
              ].map((field) => (
                <div key={field.label}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--selen-text3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: 4,
                    }}
                  >
                    {field.label}
                  </div>

                  <div style={{ fontSize: 13, color: "var(--selen-text)" }}>
                    {field.value ?? "—"}
                  </div>
                </div>
              ))}
            </div>
          </SelenCard>

          <SelenCard>
            <SelenCardTitle>Session préaudit</SelenCardTitle>

            {session ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <SelenBadge variant="info" dot>
                    {session.status ?? "—"}
                  </SelenBadge>
                  <SelenBadge variant="type" dot>
                    {formatAuditType(session.audit_type)}
                  </SelenBadge>
                  <SelenBadge
                    variant={session.is_new_entrant ? "warn" : "status"}
                    dot
                  >
                    {session.is_new_entrant
                      ? "Nouvel entrant"
                      : "Non nouvel entrant"}
                  </SelenBadge>
                </div>

                <p
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Dernière mise à jour :{" "}
                  {new Date(
                    session.updated_at ?? session.created_at,
                  ).toLocaleDateString("fr-FR")}
                </p>

                <p
                  style={{
                    fontSize: 12,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Indicateurs non concernés : {excludedIndicatorsLabel}
                </p>

                <Link
                  href={refreshHref}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    justifySelf: "start",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 11px",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                    color: "var(--selen-text2)",
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Actualiser les réponses
                </Link>
              </div>
            ) : (
              <p
                style={{
                  fontSize: 13,
                  color: "var(--selen-text3)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Aucune session préaudit retrouvée pour cet email client.
              </p>
            )}
          </SelenCard>
        </div>

        {session ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {[
                {
                  label: "Avancement",
                  value: `${progressPercent}%`,
                },
                {
                  label: "Applicables",
                  value: String(applicableCount),
                },
                {
                  label: "Non concernés",
                  value: String(excludedCount),
                },
                {
                  label: "Conformes",
                  value: String(conformeRows.length),
                },
                {
                  label: "À vérifier",
                  value: String(toVerifyRows.length),
                },
                {
                  label: "En défaut",
                  value: String(defectiveRows.length),
                },
              ].map((stat) => (
                <SelenCard key={stat.label}>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 24,
                      fontWeight: 600,
                      color: "var(--selen-gold2)",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--selen-text3)",
                      marginTop: 4,
                    }}
                  >
                    {stat.label}
                  </div>
                </SelenCard>
              ))}
            </div>

            <SelenCard style={{ marginBottom: 16 }}>
              <SelenCardTitle>Indicateurs en défaut</SelenCardTitle>

              {defectiveRows.length ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {defectiveRows.map((row) => (
                    <article
                      key={row.indicatorNumber}
                      style={{
                        background: "var(--selen-bg3)",
                        border: "1px solid var(--selen-border)",
                        borderRadius: "var(--radius-md)",
                        padding: "12px 14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 10,
                              color: "var(--selen-gold)",
                              textTransform: "uppercase",
                              letterSpacing: "0.12em",
                              marginBottom: 4,
                            }}
                          >
                            Indicateur {row.indicatorNumber}
                          </div>
                          <h2
                            style={{
                              fontSize: 15,
                              margin: 0,
                              color: "var(--selen-text)",
                            }}
                          >
                            {row.title}
                          </h2>
                        </div>

                        <SelenBadge
                          variant={diagnosticVariant(row.diagnostic)}
                          dot
                        >
                          {diagnosticLabel(row.diagnostic)}
                        </SelenBadge>
                      </div>

                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--selen-text3)",
                          margin: "0 0 8px",
                        }}
                      >
                        Réponses : {row.answeredCount}/{row.totalQuestions}
                      </p>

                      {row.issues.length ? (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 18,
                            color: "var(--selen-text2)",
                            fontSize: 12,
                            lineHeight: 1.5,
                          }}
                        >
                          {row.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : null}

                      {row.note ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "10px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--selen-border)",
                            background: "var(--selen-bg)",
                            fontSize: 12,
                            color: "var(--selen-text2)",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Note client :</strong> {row.note}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--selen-text3)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Aucun indicateur en non-conformité probable pour le moment.
                </p>
              )}
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Tous les indicateurs applicables</SelenCardTitle>

              <div style={{ display: "grid", gap: 8 }}>
                {summaryRows.map((row) => (
                  <details
                    key={row.indicatorNumber}
                    id={`indicateur-${row.indicatorNumber}`}
                    style={{
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      color: "var(--selen-text)",
                    }}
                  >
                    <summary
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr auto",
                        gap: 12,
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--selen-gold)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        Ind. {row.indicatorNumber}
                      </span>

                      <span style={{ fontSize: 13 }}>{row.title}</span>

                      <SelenBadge
                        variant={diagnosticVariant(row.diagnostic)}
                        dot
                      >
                        {diagnosticLabel(row.diagnostic)}
                      </SelenBadge>
                    </summary>

                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid var(--selen-border)",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4, 1fr)",
                          gap: 8,
                        }}
                      >
                        {[
                          {
                            label: "Statut",
                            value: row.status
                              ? diagnosticLabel(row.diagnostic)
                              : "À vérifier",
                          },
                          {
                            label: "Score",
                            value:
                              row.score === null || row.score === undefined
                                ? "—"
                                : `${row.score}%`,
                          },
                          {
                            label: "Risque",
                            value: formatNullableValue(row.riskLevel),
                          },
                          {
                            label: "Réponses",
                            value: `${row.answeredCount}/${row.totalQuestions}`,
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{
                              background: "var(--selen-bg)",
                              border: "1px solid var(--selen-border)",
                              borderRadius: "var(--radius-sm)",
                              padding: "9px 10px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 9,
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                color: "var(--selen-text3)",
                                marginBottom: 4,
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                color: "var(--selen-text)",
                                fontWeight: 600,
                              }}
                            >
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {row.diagnosis ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--selen-text2)",
                            lineHeight: 1.5,
                          }}
                        >
                          <strong>Diagnostic :</strong> {row.diagnosis}
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "grid",
                          gap: 8,
                          fontSize: 12,
                          color: "var(--selen-text2)",
                          lineHeight: 1.5,
                        }}
                      >
                        <div>
                          <strong>Actions correctives :</strong>{" "}
                          {formatNullableValue(row.correctiveActions)}
                        </div>
                        <div>
                          <strong>Modèles recommandés :</strong>{" "}
                          {formatNullableValue(row.recommendedModels)}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--selen-border)",
                          background: "var(--selen-bg)",
                          fontSize: 12,
                          color: "var(--selen-text2)",
                          lineHeight: 1.5,
                        }}
                      >
                        <strong>Note client sur l’indicateur :</strong>{" "}
                        {row.note || "Aucune note client pour cet indicateur."}
                      </div>

                      {row.answeredCount === 0 ? (
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--selen-text3)",
                            lineHeight: 1.5,
                            margin: 0,
                          }}
                        >
                          Aucune réponse enregistrée pour cet indicateur.
                        </p>
                      ) : null}

                      <div style={{ display: "grid", gap: 8 }}>
                        {row.questions.map((question) => (
                          <article
                            key={question.id}
                            style={{
                              background: "var(--selen-bg)",
                              border: "1px solid var(--selen-border)",
                              borderRadius: "var(--radius-sm)",
                              padding: "10px 12px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                marginBottom: 8,
                              }}
                            >
                              <h3
                                style={{
                                  fontSize: 13,
                                  color: "var(--selen-text)",
                                  margin: 0,
                                  lineHeight: 1.45,
                                }}
                              >
                                Q{question.question_order}. {question.question}
                              </h3>
                              <SelenBadge variant="status" dot>
                                {formatAnswer(question.answer)}
                              </SelenBadge>
                            </div>

                            {question.help_text ? (
                              <p
                                style={{
                                  fontSize: 12,
                                  color: "var(--selen-text3)",
                                  lineHeight: 1.5,
                                  margin: "0 0 8px",
                                }}
                              >
                                {question.help_text}
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </SelenCard>
          </>
        ) : null}
      </div>
    </main>
  );
}
