import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import { isolatedTsModule } from "./isolatedTsModule.mjs";
const require = createRequire(import.meta.url);

export const ids = {
  of: "11111111-1111-4111-8111-111111111111", otherOf: "22222222-2222-4222-8222-222222222222",
  formation: "33333333-3333-4333-8333-333333333333", request: "44444444-4444-4444-8444-444444444444",
  original: "55555555-5555-4555-8555-555555555555", proof: "66666666-6666-4666-8666-666666666666",
  session: "77777777-7777-4777-8777-777777777777", enrolment: "88888888-8888-4888-8888-888888888888",
  learner: "99999999-9999-4999-8999-999999999999", program: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  prerequisite: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", reviewer: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

export function dailyPrivateFixture() {
  const originalBytes = Buffer.from("%PDF-questionnaire-original");
  const filledBytes = Buffer.from("%PDF-positionnement-rempli");
  const prerequisiteBytes = Buffer.from("%PDF-justificatif-prerequis");
  const fingerprint = "d".repeat(64);
  const subject = { first_name: "Ada", last_name: "Test", email: "learner@example.test" };
  const formation = { id: ids.formation, organisation_id: ids.of, title: "Formation exemple", status: "validated", positioning_mode: "off_platform", positioning_questionnaire_document_url: `/api/client/daily/uploads?id=${ids.original}`, prerequisite_mode: "none", prerequisite_requirements: [], detailed_program_document_url: `/api/client/daily/uploads?id=${ids.program}` };
  const source = { id: ids.original, organisation_id: ids.of, formation_id: null, document_type: "positioning_questionnaire_source", linked_object_type: "organisation", linked_object_id: ids.of, bucket: "documents", storage_path: `daily/${ids.of}/onboarding/original.pdf`, mime_type: "application/pdf", sha256: sha(originalBytes), is_current: true, status: "to_check", metadata: { original_filename: "Questionnaire.pdf" } };
  const proof = { id: ids.proof, organisation_id: ids.of, formation_id: ids.formation, session_id: null, learner_id: null, enrolment_id: null, document_type: "positioning_application_evidence", linked_object_type: "registration_request", linked_object_id: ids.request, bucket: "documents", storage_path: `daily/${ids.of}/positioning-applications/${ids.formation}/${ids.request}/filled.pdf`, mime_type: "application/pdf", sha256: sha(filledBytes), is_current: true, status: "to_check", metadata: { source: "daily_own_positioning", source_document_id: ids.original, source_sha256: source.sha256, submission_fingerprint: fingerprint, participant_index: 0, subject_first_name: subject.first_name, subject_last_name: subject.last_name, subject_email: subject.email, original_filename: "Copie remplie.pdf" } };
  const prerequisite = { id: ids.prerequisite, organisation_id: ids.of, formation_id: ids.formation, session_id: null, document_type: "prerequisite_application_evidence", linked_object_type: "registration_request", linked_object_id: ids.request, bucket: "documents", storage_path: `daily/${ids.of}/prerequisite-applications/${ids.formation}/${ids.request}/${ids.prerequisite}.pdf`, mime_type: "application/pdf", sha256: sha(prerequisiteBytes), is_current: true, status: "to_check", archived_at: null, logical_name: "Justificatif diplôme", metadata: { source: "daily_prerequisite_evidence", submission_fingerprint: "e".repeat(64), participant_index: 0, requirement_id: "diploma", original_filename: "Diplome.pdf" } };
  const request = { id: ids.request, formation_id: ids.formation, response_type: "beneficiary", respondent_first_name: subject.first_name, respondent_last_name: subject.last_name, respondent_email: subject.email, decision_status: "pending", attached_session_id: null, need_answers: { motivation: "Apprendre" }, positioning_answers: { mode: "off_platform", source_document_id: ids.original, source_sha256: source.sha256, submission_fingerprint: fingerprint, external_documents: [{ document_id: ids.proof, participant_index: 0, ...subject, sha256: proof.sha256, original_filename: "Copie remplie.pdf" }] } };
  const rows = {
    daily_subscriptions: [{ user_id: "owner-a", status: "active" }, { user_id: "owner-b", status: "active" }],
    organisations: [{ id: ids.of, email: "owner-a@example.test", status: "active" }, { id: ids.otherOf, email: "owner-b@example.test", status: "active" }],
    selen_admin_users: [{ email: "admin@example.test", role: "admin", is_active: true }],
    agent_profiles: [{ id: "agent-a", email: "agent-a@example.test", role: "agent", is_active: true }, { id: "agent-b", email: "agent-b@example.test", role: "agent", is_active: true }],
    daily_organisation_assignments: [{ organisation_id: ids.of, agent_profile_id: "agent-a" }, { organisation_id: ids.otherOf, agent_profile_id: "agent-b" }],
    daily_formations: [formation], daily_formation_registration_requests: [request], daily_registration_responses: [], daily_documents: [source, proof, prerequisite, { ...source, id: ids.program, document_type: "training_program_source", metadata: { original_filename: "Programme.pdf" } }],
    daily_registration_request_enrolments: [], daily_session_enrolments: [], daily_sessions: [], daily_prerequisite_evidence: [],
  };
  const files = new Map([[source.storage_path, originalBytes], [proof.storage_path, filledBytes], [prerequisite.storage_path, prerequisiteBytes]]);
  const reads = []; const downloads = []; const writes = []; const rpcs = [];
  const flags = { allowWrites: false, beforeUpdate: null, validateStatus: true };
  const admin = {
    auth: { admin: { getUserById: async id => ({ data: { user: { email: `${id}@example.test` } }, error: null }) } },
    from(table) {
      assert.ok(Object.hasOwn(rows, table), `Unexpected table: ${table}`);
      const filters = []; let projection = "*"; let single = false; let patch = null; let range = null;
      const query = {
        select(value) { projection = value; return query; },
        update(value) { assert.equal(flags.allowWrites, true, "Writes forbidden in this fixture"); patch = value; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { filters.push(row => value === null ? row[key] == null : row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        order() { return query; },
        range(from, to) { range = [from, to]; return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          reads.push({ table, projection });
          if (patch && flags.beforeUpdate) { flags.beforeUpdate(); flags.beforeUpdate = null; }
          let matching = rows[table].filter(row => filters.every(f => f(row)));
          if (range) matching = matching.slice(range[0], range[1] + 1);
          if (patch) { for (const row of matching) Object.assign(row, patch); writes.push({ table, ids: matching.map(row => row.id), patch }); }
          const data = matching.map(row => projection === "*" ? { ...row } : Object.fromEntries(projection.split(",").map(key => [key, row[key]])));
          assert.ok(!single || data.length <= 1, "Ambiguous single-row fixture");
          return Promise.resolve({ data: single ? data[0] ?? null : data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(flags.allowWrites, true);
      if (name === "review_daily_prerequisite_evidence") {
        const row = rows.daily_prerequisite_evidence.find(row => row.id === args.p_evidence_id);
        if (!row || row.status !== "submitted" || row.updated_at !== args.p_expected_updated_at) return { data: null, error: { message: "conflict" } };
        Object.assign(row, { status: args.p_decision, review_comment: args.p_comment, reviewed_by: args.p_reviewer, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        rpcs.push({ name, args }); return { data: { ...row }, error: null };
      }
      assert.equal(name, "daily_validate_formation_review");
      rpcs.push({ name, args });
      const row = rows.daily_formations.find(row => row.id === args.p_formation_id);
      assert.equal(args.p_organisation_id, row.organisation_id);
      assert.equal(args.p_expected_updated_at, row.updated_at);
      assert.equal(args.p_expected_status, row.status);
      if (flags.validateStatus) Object.assign(row, { status: "validated", spontaneous_registration_task_status: "to_attach" });
      return { data: { ...row }, error: null };
    },
    storage: { from(bucket) { assert.equal(bucket, "documents"); return { download: async path => {
      downloads.push(path);
      return files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: "not found" } };
    }, createSignedUrl: async (path, seconds) => files.has(path) && seconds === 600 ? { data: { signedUrl: `https://storage.example.test/signed/${encodeURIComponent(path)}` }, error: null } : { data: null, error: { message: "not found" } } }; } },
  };
  const supabase = { createSupabaseAdminClient: () => admin };
  const scope = isolatedTsModule("src/lib/server/dailyOrganisationScope.ts", { "@/lib/server/supabaseAdmin": supabase });
  const sources = isolatedTsModule("src/lib/server/dailyStudioFormationSources.ts", {
    "node:crypto": { createHash }, "@/lib/server/dailyOrganisationScope": scope,
  });
  const candidatures = isolatedTsModule("src/lib/server/dailyStudioCandidature.ts", { "@/lib/server/dailyStudioFormationSources": sources });
  const prerequisiteReview = isolatedTsModule("src/lib/server/dailyStudioPrerequisiteEvidence.ts", { "@/lib/server/dailyStudioFormationSources": sources });
  const auth = { value: { ok: true, email: "agent-a@example.test", userId: ids.reviewer } };
  const reviewForm = isolatedTsModule("src/components/daily/DailyFormationReviewForm.tsx", {
    react: require("react"),
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/navigation": { useRouter: () => ({ push() {}, replace() {}, refresh() {} }) },
    "@/lib/studioNavigation": isolatedTsModule("src/lib/studioNavigation.ts"),
  });
  const modules = {
    "@/components/daily/DailyFormationReviewForm": reviewForm,
    "@/lib/dailyQuestionnaireEditing": isolatedTsModule("src/lib/dailyQuestionnaireEditing.ts"),
    "@/lib/server/dailyStudioQuestionnaireSources": isolatedTsModule("src/lib/server/dailyStudioQuestionnaireSources.ts", { "node:crypto": crypto, "./dailyStudioFormationSources": sources }),
    "@/components/daily/DailyQuestionnaireEditor": isolatedTsModule("src/components/daily/DailyQuestionnaireEditor.tsx", {
      react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"),
      "./DailyQuestionnairePreview": isolatedTsModule("src/components/daily/DailyQuestionnairePreview.tsx", { "react/jsx-runtime": require("react/jsx-runtime") }),
    }),
    "@/components/daily/DailyQuestionnaireSourceUpload": isolatedTsModule("src/components/daily/DailyQuestionnaireSourceUpload.tsx", {
      react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"),
      "@/lib/supabase/client": { createClient() { throw new Error("Live browser storage forbidden in tests"); } },
      "@/lib/dailyQuestionnaireEditing": isolatedTsModule("src/lib/dailyQuestionnaireEditing.ts"),
      "./DailyFormationReviewForm": reviewForm,
    }),
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/app/agent/api/support/_utils": { requireSupportAgent: async () => auth.value },
    "@/lib/server/supabaseAdmin": supabase,
    "@/lib/server/dailyStudioFormationSources": sources,
    "@/lib/server/dailyStudioCandidature": candidatures,
    "@/lib/server/dailyStudioPrerequisiteEvidence": prerequisiteReview,
  };
  const route = isolatedTsModule("src/app/agent/api/daily/candidatures/[id]/positioning-document/route.ts", modules);
  const sourceRoute = isolatedTsModule("src/app/agent/api/daily/formations/[id]/source-document/route.ts", modules);
  const get = (document = ids.proof) => route.GET(new Request(`https://studio.example.test/positioning?document=${document}`), { params: Promise.resolve({ id: ids.request }) });
  const getSource = (kind = "program") => sourceRoute.GET(new Request(`https://studio.example.test/source?kind=${kind}`), { params: Promise.resolve({ id: ids.formation }) });
  return { rows, formation, request, source, proof, prerequisite, files, reads, downloads, writes, rpcs, flags, admin, scope, sources, candidatures, prerequisiteReview, modules, auth, get, getSource, filledBytes };
}

export function materializeFixture(f) {
  f.request.decision_status = "accepted"; f.request.attached_session_id = ids.session;
  Object.assign(f.proof, { document_type: "positioning_evidence", linked_object_type: "enrolment", linked_object_id: ids.enrolment, enrolment_id: ids.enrolment, learner_id: ids.learner, session_id: ids.session });
  Object.assign(f.proof.metadata, { source_request_id: ids.request, source_request_kind: "formation" });
  f.rows.daily_registration_request_enrolments.push({ registration_request_id: ids.request, participant_index: 0, participant_email: "learner@example.test", enrolment_id: ids.enrolment, learner_id: ids.learner });
  f.rows.daily_session_enrolments.push({ id: ids.enrolment, organisation_id: ids.of, session_id: ids.session, learner_id: ids.learner });
  f.rows.daily_sessions.push({ id: ids.session, organisation_id: ids.of, formation_id: ids.formation });
}
