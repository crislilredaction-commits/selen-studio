import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./helpers/dailyCandidatureFollowupFixture.mjs";
const require = createRequire(import.meta.url);
function visibleText(node) {
    if (Array.isArray(node))
        return node.map(visibleText).join(" ");
    if (typeof node === "string" || typeof node === "number")
        return String(node);
    return node?.props ? visibleText(node.props.children) : "";
}
import { isolatedTsModule as load } from "./helpers/isolatedTsModule.mjs";
const projection = load("src/lib/daily/candidatureSummary.ts");
const reader = load("src/lib/server/dailyCandidatureFollowup.ts", { "../daily/candidatureSummary": projection });
function pageFixture(allowed = true) {
    const f = fixture();
    f.rows.daily_convention_signatures = [];
    const from = f.admin.from;
    f.admin.from = table => {
        const q = from(table);
        const eq = q.eq;
        q.eq = (column, value) => {
            if (table === "daily_convention_signatures" && column === "organisation_id")
                throw Error("Column does not exist in canonical schema");
            return eq(column, value);
        };
        return q;
    };
    const ui = load("src/app/agent/daily/session-dossiers/[id]/followup/page.tsx", {
        "react/jsx-runtime": require("react/jsx-runtime"), "next/link": { default: "a" }, "next/cache": { revalidatePath() { } },
        "@/lib/server/supabaseAdmin": { createSupabaseAdminClient: () => f.admin },
        "@/app/agent/api/support/_utils": { requireSupportAgent: async () => ({ ok: true, email: "agent@example.test" }) },
        "@/lib/server/dailyOrganisationScope": { isDailyOrganisationInAgentScope: async (_email, org) => allowed && org === "of" },
        "@/lib/server/dailyCandidatureFollowup": reader,
        "@/lib/server/dailySignatureReminders": { sendManualDailySignatureReminder() { throw Error("Email forbidden"); } },
        "@/lib/daily/signatureReminder24h": { isSignatureTerminal: () => false },
        "@/components/ui/SelenCard": { default: "section", SelenCardTitle: "h2" }, "@/components/ui/SelenButton": { default: "button" }
    });
    return { ...f, render: () => ui.default({ params: Promise.resolve({ id: "session" }) }) };
}
test("Studio followup renders all seven notes and identity with the existing signature schema", async () => {
    const f = pageFixture();
    const text = visibleText(await f.render());
    for (let i = 0; i < 7; i++)
        assert.ok(text.includes("SECTION_" + i));
    assert.match(text, /Ada Test/);
    assert.doesNotMatch(text, /PRIVATE_AGENT|PRIVATE_METADATA/);
    f.rows.daily_formation_registration_requests[0].agent_analysis_summary.observations = "Note corrigée actuelle";
    assert.match(visibleText(await f.render()), /Note corrigée actuelle/);
});
test("Studio refuses an agent outside the OF before reading any dossier or signature", async () => {
    const f = pageFixture(false);
    assert.match(visibleText(await f.render()), /Accès refusé/);
    assert.deepEqual(f.reads.map(row => row.table), ["daily_sessions"]);
});
test("Studio removes candidature notes when its inscription is inactive", async () => {
    const f = pageFixture();
    f.rows.daily_session_enrolments[0].status = "abandoned";
    const text = visibleText(await f.render());
    assert.doesNotMatch(text, /SECTION_[0-6]/);
    assert.match(text, /Aucune synthèse/);
});
