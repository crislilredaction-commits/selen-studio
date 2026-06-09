import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";

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

type SummaryRow = {
  indicatorNumber: number;
  title: string;
  diagnostic: Diagnostic;
  answeredCount: number;
  totalQuestions: number;
  issues: string[];
  note: string;
};

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

function computeDiagnostic(
  indicatorNumber: number,
  questions: QuestionRow[],
  answers: Record<string, Answer>,
): Diagnostic {
  let hasMajor = false;
  let hasMinor = false;
  let answered = 0;

  questions.forEach((q) => {
    const answer = answers[q.id];

    if (!answer) return;

    answered++;

    if (answer === "no") {
      if (q.affects_major) hasMajor = true;
      else if (q.affects_minor) hasMinor = true;
    }

    if (answer === "partial") {
      if (
        [10, 11, 12, 14, 15, 16, 20, 21, 22, 26, 27, 28, 29, 31, 32].includes(
          indicatorNumber,
        ) &&
        q.affects_major
      ) {
        hasMajor = true;
      } else {
        hasMinor = true;
      }
    }
  });

  if (questions.length === 0) return "a_verifier";

  const requiredAnswers = Math.min(5, questions.length);

  if (answered < requiredAnswers) return "a_verifier";
  if (hasMajor) return "majeure";
  if (hasMinor) return "mineure";
  return "conforme";
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

      const { data: answerData } = await admin.rpc(
        "get_preaudit_indicator_answers",
        {
          p_session_id: session.id,
          p_indicator_number: indicatorNumber,
        },
      );

      const answers: Record<string, Answer> = {};

      (answerData ?? []).forEach(
        (row: { question_id: string; answer: string }) => {
          if (["yes", "partial", "no", "unknown"].includes(row.answer)) {
            answers[row.question_id] = row.answer as Answer;
          }
        },
      );

      const { data: noteData } = await admin.rpc(
        "get_preaudit_indicator_note",
        {
          p_session_id: session.id,
          p_indicator_number: indicatorNumber,
        },
      );

      const answeredCount = Object.keys(answers).filter((questionId) =>
        questions.some((question) => question.id === questionId),
      ).length;

      const diagnostic = computeDiagnostic(indicatorNumber, questions, answers);
      const issues = getIssues(questions, answers);

      return {
        indicatorNumber,
        title:
          indicatorData?.simplified_title ||
          indicatorData?.title ||
          `Indicateur ${indicatorNumber}`,
        diagnostic,
        answeredCount,
        totalQuestions: questions.length,
        issues,
        note: noteData ? String(noteData) : "",
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
    (row) => row.answeredCount > 0,
  ).length;

  const applicableCount = session?.applicable_indicators?.length ?? 0;
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
                gridTemplateColumns: "repeat(5, 1fr)",
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
                  <Link
                    key={row.indicatorNumber}
                    href={`/agent/dossiers/${dossier.id}/preaudit#indicateur-${row.indicatorNumber}`}
                    id={`indicateur-${row.indicatorNumber}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 1fr auto",
                      gap: 12,
                      alignItems: "center",
                      textDecoration: "none",
                      background: "var(--selen-bg3)",
                      border: "1px solid var(--selen-border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      color: "var(--selen-text)",
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

                    <SelenBadge variant={diagnosticVariant(row.diagnostic)} dot>
                      {diagnosticLabel(row.diagnostic)}
                    </SelenBadge>
                  </Link>
                ))}
              </div>
            </SelenCard>
          </>
        ) : null}
      </div>
    </main>
  );
}
