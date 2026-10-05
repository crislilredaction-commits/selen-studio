import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { fixture } from './helpers/dailyCandidatureFollowupFixture.mjs';
import { isolatedTsModule as load } from './helpers/isolatedTsModule.mjs';
const projection = load('src/lib/daily/candidatureSummary.ts');
const reader = load('src/lib/server/dailyCandidatureFollowup.ts', { '../daily/candidatureSummary': projection });
function endpoint(allowed = true, track) {
    const f = fixture();
    let Pdf = jsPDF;
    if (track)
        Pdf = class extends jsPDF {
            constructor(o) { super(o); const text = this.text.bind(this); this.text = (line, x, y, options) => { track.push({ line, y }); return text(line, x, y, options); }; }
        };
    const route = load('src/app/agent/daily/session-dossiers/[id]/followup/pdf/route.ts', { jspdf: { jsPDF: Pdf }, 'next/server': { NextResponse: class extends Response {
                static json(data, init) { return Response.json(data, init); }
            } }, '@/app/agent/api/support/_utils': { requireSupportAgent: async () => ({ ok: true, email: 'agent@example.test' }) }, '@/lib/server/supabaseAdmin': { createSupabaseAdminClient: () => f.admin }, '@/lib/server/dailyOrganisationScope': { isDailyOrganisationInAgentScope: async (_email, org) => allowed && org === 'of' }, '@/lib/server/dailyCandidatureFollowup': reader });
    return { ...f, call: () => route.GET(new Request('https://test.invalid'), { params: Promise.resolve({ id: 'session' }) }) };
}
test('real followup PDF refuses a foreign or unauthorized scope before reading the dossier', async () => { const f = endpoint(false); const result = await f.call(); assert.equal(result.status, 403); assert.ok(!f.reads.some(x => x.table === 'daily_formation_registration_requests' || x.table === 'daily_session_followup_entries')); });
test('real followup PDF contains all seven current notes without private metadata', async () => { const f = endpoint(); const response = await f.call(); assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Type'), 'application/pdf'); assert.equal(response.headers.get('Cache-Control'), 'private, no-store'); const pdf = Buffer.from(await response.arrayBuffer()).toString('latin1'); assert.match(pdf, /^%PDF-/); for (let i = 0; i < 7; i++)
    assert.ok(pdf.includes('SECTION_' + i)); assert.doesNotMatch(pdf, /PRIVATE_AGENT|PRIVATE_METADATA/); });
test('long analysis is paginated line by line without losing its final paragraph', async () => { const drawn = []; const f = endpoint(true, drawn); f.rows.daily_formation_registration_requests[0].agent_analysis_summary.observations = Array.from({ length: 250 }, (_, i) => 'NOTE_LINE_' + i + ' utile '.repeat(24)).join('\n') + '\nFINAL_ANALYSIS_PARAGRAPH'; const response = await f.call(); assert.equal(response.status, 200); assert.equal(drawn.filter(x => String(x.line).includes('FINAL_ANALYSIS_PARAGRAPH')).length, 1); for (const x of drawn)
    assert.ok(x.y >= 18 && x.y <= 287, 'outside page: ' + x.y); const pdf = Buffer.from(await response.arrayBuffer()).toString('latin1'); assert.ok(pdf.includes('FINAL_ANALYSIS_PARAGRAPH')); assert.ok((pdf.match(/\/Type \/Page\b/g) || []).length > 2); });
