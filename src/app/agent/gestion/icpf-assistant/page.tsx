import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { isLilOwner } from "@/lib/server/studioAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { ICPF_INDICATORS } from "@/lib/icpfAssistantConfig";
import IcpfAssistantClient, { type InitialPreauditData } from "./IcpfAssistantClient";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type OrganisationRow = {
  email: string | null;
};

type DossierRow = {
  id: string;
  organisation_id: string | null;
  organisations: OrganisationRow | OrganisationRow[] | null;
};

function firstParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function normalizeOrganisation(
  organisation: OrganisationRow | OrganisationRow[] | null,
) {
  if (Array.isArray(organisation)) return organisation[0] ?? null;
  return organisation;
}

async function findAuthUserIdByEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

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

async function resolveSessionId({
  sessionId,
  dossierId,
}: {
  sessionId?: string;
  dossierId?: string;
}) {
  if (sessionId) return sessionId;
  if (!dossierId) return undefined;

  const admin = createSupabaseAdminClient();
  const { data: dossierRaw, error: dossierError } = await admin
    .from("dossiers")
    .select(
      `
      id,
      organisation_id,
      organisations:organisation_id (
        email
      )
    `,
    )
    .eq("id", dossierId)
    .maybeSingle();

  if (dossierError) {
    throw new Error(`Impossible de charger le dossier. ${dossierError.message}`);
  }

  const dossier = dossierRaw as DossierRow | null;
  const organisation = normalizeOrganisation(dossier?.organisations ?? null);
  const userId = organisation?.email
    ? await findAuthUserIdByEmail(organisation.email)
    : null;

  if (!userId) return undefined;

  const { data: sessionRaw, error: sessionError } = await admin
    .from("preaudit_sessions")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw new Error(
      `Impossible de charger la session preaudit. ${sessionError.message}`,
    );
  }

  return typeof sessionRaw?.id === "string" ? sessionRaw.id : undefined;
}

async function loadPreauditData({
  sessionId,
  dossierId,
}: {
  sessionId?: string;
  dossierId?: string;
}): Promise<InitialPreauditData | null> {
  const resolvedSessionId = await resolveSessionId({ sessionId, dossierId });
  if (!resolvedSessionId) return null;

  const admin = createSupabaseAdminClient();
  const indicatorNumbers = ICPF_INDICATORS.map((indicator) => indicator.indicatorNumber);

  const { data: sessionRaw, error: sessionError } = await admin
    .from("preaudit_sessions")
    .select(
      "id, status, audit_type, is_new_entrant, applicable_indicators, excluded_indicators, updated_at",
    )
    .eq("id", resolvedSessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(
      `Impossible de charger la session preaudit. ${sessionError.message}`,
    );
  }

  if (!sessionRaw) return null;

  const [indicatorsResult, questionsResult, resultsResult, notesResult] =
    await Promise.all([
      admin.from("preaudit_indicators").select("*").in("number", indicatorNumbers),
      admin
        .from("preaudit_questions")
        .select("*")
        .in("indicator_number", indicatorNumbers)
        .order("question_order", { ascending: true }),
      admin
        .from("preaudit_indicator_results")
        .select("*")
        .eq("session_id", resolvedSessionId)
        .in("indicator_number", indicatorNumbers),
      admin
        .from("preaudit_indicator_notes")
        .select("*")
        .eq("session_id", resolvedSessionId)
        .in("indicator_number", indicatorNumbers),
    ]);

  if (indicatorsResult.error) {
    throw new Error(
      `Impossible de charger les indicateurs preaudit. ${indicatorsResult.error.message}`,
    );
  }
  if (questionsResult.error) {
    throw new Error(
      `Impossible de charger les questions preaudit. ${questionsResult.error.message}`,
    );
  }
  if (resultsResult.error) {
    throw new Error(
      `Impossible de charger les resultats preaudit. ${resultsResult.error.message}`,
    );
  }
  if (notesResult.error) {
    throw new Error(
      `Impossible de charger les notes preaudit. ${notesResult.error.message}`,
    );
  }

  const questions = Array.isArray(questionsResult.data) ? questionsResult.data : [];
  const questionIds = questions
    .map((question) => (typeof question.id === "string" ? question.id : ""))
    .filter(Boolean);

  const answersResult = questionIds.length
    ? await admin
        .from("preaudit_answers")
        .select("*")
        .eq("session_id", resolvedSessionId)
        .in("question_id", questionIds)
    : { data: [], error: null };

  if (answersResult.error) {
    throw new Error(
      `Impossible de charger les reponses preaudit. ${answersResult.error.message}`,
    );
  }

  return {
    dossierId,
    session: sessionRaw as InitialPreauditData["session"],
    indicators: indicatorsResult.data ?? [],
    questions,
    answers: answersResult.data ?? [],
    results: resultsResult.data ?? [],
    notes: notesResult.data ?? [],
  };
}

export default async function IcpfAssistantPage({ searchParams }: PageProps) {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard>
          <SelenCardTitle>Acces reserve</SelenCardTitle>
          <p style={s.muted}>Cette page est reservee au compte proprietaire.</p>
        </SelenCard>
      </main>
    );
  }

  const params = (await searchParams) ?? {};
  const auditId = firstParam(params.auditId);
  const dossierId = firstParam(params.dossierId);
  const sessionId = firstParam(params.sessionId);
  const preauditData = await loadPreauditData({ sessionId, dossierId });

  return (
    <IcpfAssistantClient
      auditId={auditId}
      dossierId={dossierId}
      preauditData={preauditData}
    />
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  muted: { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5 },
};
