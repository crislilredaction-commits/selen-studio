import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/dailyCandidatureFollowupFixture.mjs';
import { isolatedTsModule as load } from './helpers/isolatedTsModule.mjs';
const projection = load('src/lib/daily/candidatureSummary.ts');
const { loadDailyCandidatureFollowup: read } = load('src/lib/server/dailyCandidatureFollowup.ts', { '../daily/candidatureSummary': projection });
const plain = v => JSON.parse(JSON.stringify(v));
test('seven analysis fields feed only the linked active inscription, without raw metadata or writes', async () => {
    const f = fixture();
    f.rows.daily_registration_request_enrolments.push({ ...f.rows.daily_registration_request_enrolments[0] });
    const result = plain(await read(f.admin, 'of', 'session'));
    assert.equal(result.length, 1);
    assert.equal(result[0].learners.length, 1);
    assert.equal(result[0].learners[0].name, 'Ada Test');
    assert.equal(result[0].sections.length, 7);
    for (let i = 0; i < 7; i++)
        assert.equal(result[0].sections[i].value, `SECTION_${i}\nLigne conservée`);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_AGENT|PRIVATE_METADATA|agent_analysis_summary/);
    f.rows.daily_formation_registration_requests[0].agent_analysis_summary.observations = 'Note actualisée';
    assert.equal((await read(f.admin, 'of', 'session'))[0].sections[6].value, 'Note actualisée');
});
for (const status of ['cancelled', 'declined', 'abandoned'])
    test(`inactive inscription ${status} does not expose the dossier`, async () => {
        const f = fixture();
        f.rows.daily_session_enrolments[0].status = status;
        assert.equal((await read(f.admin, 'of', 'session')).length, 0);
        assert.ok(!f.reads.some(r => r.table === 'daily_formation_registration_requests'));
    });
for (const [field, value] of [['formation_id', 'other-formation'], ['attached_session_id', 'other-session'], ['decision_status', 'pending'], ['decision_status', 'refused']])
    test(`foreign or unaccepted request ${field}=${value} is excluded`, async () => {
        const f = fixture();
        f.rows.daily_formation_registration_requests[0][field] = value;
        assert.equal((await read(f.admin, 'of', 'session')).length, 0);
    });
test('a foreign OF session or parent formation is refused before personal reads', async () => {
    const f = fixture();
    await assert.rejects(read(f.admin, 'other-of', 'session'), /Session introuvable/);
    assert.deepEqual(f.reads.map(x => x.table), ['daily_sessions']);
    f.reads.length = 0;
    f.rows.daily_formations[0].organisation_id = 'other-of';
    await assert.rejects(read(f.admin, 'of', 'session'), /Session introuvable/);
    assert.ok(!f.reads.some(x => x.table === 'daily_learners'));
});
for (const change of ['foreign-learner', 'mismatched-mapping'])
    test(`${change} never supplies identity or notes`, async () => {
        const f = fixture();
        if (change === 'foreign-learner')
            f.rows.daily_learners[0].organisation_id = 'other-of';
        else
            f.rows.daily_registration_request_enrolments[0].learner_id = 'other-learner';
        assert.equal((await read(f.admin, 'of', 'session')).length, 0);
    });
test('source errors fail closed; unavailable and malformed summaries are never invented', async () => {
    const f = fixture();
    f.fail('daily_formation_registration_requests');
    await assert.rejects(read(f.admin, 'of', 'session'), /indisponible/);
    f.fail('');
    f.rows.daily_formation_registration_requests[0].agent_analysis_summary = { observations: { hidden: 'PRIVATE' }, evaluator_email: 'PRIVATE' };
    assert.equal((await read(f.admin, 'of', 'session')).length, 0);
});
test('all pages and company participants are grouped once from their actual inscriptions', async () => {
    const f = fixture();
    const e = f.rows.daily_session_enrolments[0], p = f.rows.daily_learners[0], m = f.rows.daily_registration_request_enrolments[0];
    f.rows.daily_session_enrolments = [];
    f.rows.daily_learners = [];
    f.rows.daily_registration_request_enrolments = [];
    for (let i = 0; i < 201; i++) {
        f.rows.daily_session_enrolments.push({ ...e, id: 'e' + i, learner_id: 'p' + i });
        f.rows.daily_learners.push({ ...p, id: 'p' + i, first_name: 'Person ' + i });
        f.rows.daily_registration_request_enrolments.push({ ...m, enrolment_id: 'e' + i, learner_id: 'p' + i, participant_index: i });
    }
    f.rows.daily_formation_registration_requests[0].company_name = 'Entreprise';
    const result = await read(f.admin, 'of', 'session');
    assert.equal(result.length, 1);
    assert.equal(result[0].learners.length, 201);
    assert.equal(result[0].applicant, 'Entreprise');
    assert.ok(f.reads.some(x => x.span?.[0] === 200));
});
