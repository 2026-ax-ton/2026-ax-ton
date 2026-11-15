/* 위험요소 → 평가문항 자동 생성·선정 — api/_questions.mjs · /api/questions (2026-11-11)

   ★ 실제 AI·DB 를 부르지 않는다. 가짜 fetch · 가짜 sql 을 끼운다.

   이 묶음이 지키는 것
     1. ★ 문항 수·유형·난이도는 규칙(RULES)으로 코드가 정한다 — 같은 입력이면 같은 계획
     2. ★ 공식 문서 위험(필수)은 반드시 칸을 받는다. 점수 낮은 위험부터 빠진다
     3. ★ 위치 문항은 사진 좌표가 있을 때만, 좌표를 지어내지 않는다
     4. ★ 문항마다 위험요소·근거·해설·예방조치·출처가 이어진다
     5. ★ 검수 문구가 맞으면 정답은 그 문구 그대로(answerFrom phrase:), 아니면 AI 작성(aiWritten)
     6. ★ 금지어·정답 둘·선택지 길이 쏠림·중복은 빼고 이유를 남긴다
     7. 다시 만들기는 그 칸만 — 위험요소·유형·난이도 그대로 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ok, eq, has, report } = require('./harness');

const db = await import('../api/_db.mjs');
const shared = await import('../api/_shared.mjs');
const authLib = await import('../api/_auth.mjs');
const Q = await import('../api/_questions.mjs');
const api = await import('../api/questions.mjs');
const { HAZARD_CODES } = await import('../api/_hazards.mjs');

const ORIGIN = 'https://2026-ax-ton.vercel.app';
const realLog = console.log;
console.log = () => {};   // 서버 로그 줄은 숨긴다
Object.assign(process.env, {
  ALLOWED_ORIGIN: ORIGIN, VERCEL_URL: '', VERCEL_BRANCH_URL: '', VERCEL_PROJECT_PRODUCTION_URL: '', ALLOW_FILE_ORIGIN: '0',
  DATABASE_URL: 'postgresql://fake/fake', GEMINI_API_KEY: 'AIzaSyFAKE0000000000questionstest',
  AI_MODEL_TRANSLATE: 'gemini-3.1-flash-lite', AI_DAILY_LIMIT: '600',
});
delete process.env.AI_PROVIDER;
shared.resetDailyCall();
const tokens = new Map();
db.setSqlForTest((strings, ...vals) => {
  const q = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.startsWith('select a.id, a.user_id, a.role')) return Promise.resolve(tokens.has(vals[0]) ? [tokens.get(vals[0])] : []);
  throw new Error('가짜 DB가 모르는 질의: ' + q);
});
const login = (t, row) => { tokens.set(authLib.tokenHash(t), row); return t; };
const ADMIN = login('tok-admin', { id: 'a1', user_id: 'kim', role: 'admin', name: '김', workplace_id: 'wp-a', site_name: 'A' });
const WORKER = login('tok-w', { id: 'a2', user_id: 'W-1', role: 'worker', name: '', workplace_id: 'wp-a', site_name: 'A' });

const src = (h) => ({ title: h, url: 'https://' + h + '/doc', host: h });
const HAZ = [
  { id: 'o1', part: '가드 재전환', hazard: 'pinch', risk: '가드를 열고 다시 돌리지 않으면 끼인다', official: { code: 'M-30-2002', section: '§7.2' }, sources: [src('moel.go.kr')] },
  { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', risk: '램이 내려올 때 손이 끼인다', sources: [src('kosha.or.kr'), src('maker.com')], answer: { x: 50, y: 40, r: 12 } },
  { id: 'r2', part: '제어반', hazard: 'shock', risk: '덮개를 열면 충전부에 감전된다', sources: [src('kosha.or.kr')], answer: { x: 10, y: 10, r: 8 } },
  { id: 'r3', part: '통로 바닥', hazard: 'fall', risk: '기름에 미끄러진다', specific: false, sources: [src('blog.com')] },
  { id: 'r4', part: '유압 호스', hazard: 'unknown', risk: '호스가 터지면 기름이 뿜어진다', specific: true, sources: [src('maker.com')] },
];
const hz = Q.cleanHazards(HAZ, HAZARD_CODES);
const PHRASES = [{ id: 'ph-1', ko: '금형 사이에 손을 넣지 마십시오' }, { id: 'ph-2', ko: '작업 전 전원을 차단하십시오' }];

/* ── 1·2·3 계획 ─────────────────────────────────────────────────── */
const plan = Q.planQuiz(hz);
eq('★★ 같은 입력이면 같은 계획', JSON.stringify(Q.planQuiz(hz)), JSON.stringify(plan));
eq('★ 문항 수 = 규칙 (위험 5 → 최소~최대 사이 5)', plan.count, Math.min(Q.RULES.count.max, Math.max(Q.RULES.count.min, 5)));
eq('★★ 공식 문서 위험이 첫 칸 · 필수', plan.slots[0].hazardId + '|' + plan.slots[0].required, 'o1|true');
ok('★★ 위치 문항은 사진 좌표가 있는 위험만', plan.slots.filter((s) => s.type === 'location').every((s) => hz.find((h) => h.id === s.hazardId).answer));
ok('★ 사진 좌표가 없는 위험은 위치 문항이 안 된다', plan.slots.filter((s) => ['o1', 'r3', 'r4'].indexOf(s.hazardId) !== -1).every((s) => s.type !== 'location'));
ok('난이도가 모두 정해진다', plan.slots.every((s) => ['easy', 'medium', 'hard'].indexOf(s.difficulty) !== -1));
ok('계획 이유를 남긴다', plan.reasons.length > 0 && /문항/.test(plan.reasons[0]));
eq('규칙 판을 남긴다', plan.rulesVersion, Q.RULES.version);

const many = Q.cleanHazards(Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, part: ['램','금형','페달','호퍼','노즐','히터','벨트','기어','체인','롤러','클램프','실린더','펌프','밸브','레버','스위치','배선','덮개','손잡이','받침대'][i], hazard: i % 2 ? 'pinch' : 'unknown', risk: 'r', sources: [] }))
  .concat([{ id: 'o9', part: '공식', hazard: 'unknown', risk: 'r', official: { code: 'C', section: 's' }, sources: [] }]), HAZARD_CODES);
const p2 = Q.planQuiz(many);
eq('★ 위험이 많아도 최대 문항 수까지', p2.count, Q.RULES.count.max);
ok('★★ 점수가 낮아도 공식 문서 위험은 빠지지 않는다', p2.slots.some((s) => s.hazardId === 'o9'));
ok('★ 점수 낮은 위험(unknown)이 먼저 빠진다', p2.slots.filter((s) => /^x/.test(s.hazardId)).every((s) => many.find((h) => h.id === s.hazardId).hazard === 'pinch'));

/* ── 규칙 문서 §6·§7 ⑤⑥·§9.4 ── */
const topics = new Set(plan.slots.map((s) => s.topic));
ok('★★ 필수 주제 hazard·prevention·emergency 를 모두 덮는다 (§6)', ['hazard', 'prevention', 'emergency'].every((t) => topics.has(t)));
ok('★ 난이도는 유형에서 (위치·OX 쉬움 · 행동 보통 · 상황 어려움, §4.3)', plan.slots.every((s) => s.difficulty === Q.LEVEL_OF[s.type]));
const noPhoto = Q.planQuiz(Q.cleanHazards(HAZ.map((h) => ({ ...h, answer: null })), HAZARD_CODES));
eq('★ 좌표가 하나도 없으면 hazard 주제는 OX 로 (§7 ⑤)', noPhoto.slots.filter((s) => s.type === 'location').length + '|' + noPhoto.slots.some((s) => s.type === 'ox'), '0|true');
const one = Q.planQuiz(Q.cleanHazards([HAZ[1]], HAZARD_CODES));
eq('★ 위험 1개 → 2문항, 같은 위험의 두 칸은 유형이 다르다', one.count + '|' + (one.slots[0].type !== one.slots[1].type), '2|true');
const mergedPlan = Q.planQuiz(Q.cleanHazards([HAZ[1], { ...HAZ[1], id: 'r9', part: '램과 금형 사이 공간', answer: null, official: { code: 'C', section: 's' } }], HAZARD_CODES));
eq('★ 부위가 겹치는 같은 유형 위험은 하나로 (공식 쪽을 남기고 좌표는 옮긴다, §7 ①)', mergedPlan.hazards.length + '|' + mergedPlan.hazards[0].id + '|' + !!mergedPlan.hazards[0].answer, '1|r9|true');
const p3 = Q.planQuiz(hz.slice(0, 2));
eq('★ 위험이 적으면 위험당 최대 문항까지 (2위험 → ' + Math.min(Q.RULES.count.min, 2 * Q.RULES.count.perHazardMax) + ')', p3.count, Math.min(Q.RULES.count.min, 2 * Q.RULES.count.perHazardMax));
eq('위험이 없으면 문항 0', Q.planQuiz([]).count, 0);

/* ── 4·5·6 선정 ─────────────────────────────────────────────────── */
function fakeAnswer(slots) {
  const out = [];
  slots.filter((s) => s.type !== 'location').forEach((s) => {
    if (s.type === 'ox') {
      out.push({ slot: s.slot, hazardId: s.hazardId, type: 'ox', statement: (HAZ.find((h) => h.id === s.hazardId) || {}).part + ' 점검은 혼자 해도 된다 ' + s.slot, truth: s.slot % 2 === 0, why: '해설', prevention: '예방', sourceUrls: [] });
    } else {
      /* 첫 후보는 금지어가 있어 떨어지고, 둘째가 뽑힌다 */
      out.push({ slot: s.slot, hazardId: s.hazardId, type: s.type, prompt: '모두 정답 ' + s.slot, options: ['가', '나', '다'], answer: 0, why: 'w', prevention: 'p' });
      out.push({ slot: s.slot, hazardId: s.hazardId, type: s.type, prompt: (HAZ.find((h) => h.id === s.hazardId) || {}).risk + ' — ' + s.slot, options: ['작업 전 전원 차단함', '그대로 계속 작업함', '혼자 빨리 처리함'], answer: 0, answerPhraseId: s.hazardId === 'r2' ? 'ph-2' : '', why: '해설입니다', prevention: '예방조치', sourceUrls: ['https://kosha.or.kr/doc', 'https://evil.com/x'] });
    }
  });
  return { questions: out };
}
const sel = Q.selectQuiz(plan, hz, fakeAnswer(plan.slots), PHRASES);
eq('★★ 칸마다 문항이 하나씩', sel.quiz.length + '|' + sel.missing.length, plan.count + '|0');
ok('★★ 모든 문항이 위험요소·근거·해설·출처로 이어진다', sel.quiz.every((q) => q.hazardId && q.evidence && q.why && Array.isArray(q.sources)));
ok('★ 노동자 화면이 읽는 모양 (hotspot·choice)', sel.quiz.every((q) => (q.type === 'hotspot' && q.figure === 'photo' && typeof q.answer.x === 'number') || (q.type === 'choice' && q.options.length >= 2 && Number.isInteger(q.answer) && q.results.length === q.options.length)));
const loc = sel.quiz.find((q) => q.subtype === 'location');
ok('★★ 위치 문항 좌표는 사진 위치 찾기가 준 그대로', !!loc && JSON.stringify(loc.answer) === JSON.stringify(hz.find((h) => h.id === loc.hazardId).answer) && loc.aiWritten === false);
const ox = sel.quiz.find((q) => q.subtype === 'ox');
if (ox) eq('OX 는 선택지 둘', ox.options.join(), 'O (맞다),X (틀리다)');
const phraseQ = sel.quiz.find((q) => q.answerFrom === 'phrase:ph-2');
if (phraseQ) eq('★★ 검수 문구가 맞으면 정답은 그 문구 그대로', phraseQ.options[phraseQ.answer], '작업 전 전원을 차단하십시오');
ok('★★ AI 가 쓴 문항은 aiWritten 표시', sel.quiz.filter((q) => q.type === 'choice').every((q) => q.aiWritten === true));
ok('★★ 금지어 후보는 빼고 이유를 남긴다', sel.excluded.some((x) => x.why.some((w) => /금지어/.test(w))));
ok('★ 출처는 그 위험요소의 출처만 (지어낸 주소는 버림)', sel.quiz.every((q) => !q.sources.some((s) => /evil\.com/.test(s.url))));
const choices = sel.quiz.filter((q) => q.type === 'choice' && q.options.length >= 3);
ok('★ 정답 자리 = (칸 번호 − 1) mod 선택지 수 (§7 ⑨)', choices.every((q) => q.answer === (q.slot - 1) % q.options.length));
ok('★★ 발급 가능 판정 (§9.4)', sel.issuable.ok === true, sel.issuable.why.join());
const lacking = Q.selectQuiz(plan, hz, { questions: [] }, PHRASES);
ok('★★ 필수 주제·최소 문항이 빠지면 발급 불가 이유를 낸다', lacking.issuable.ok === false && lacking.issuable.why.some((w) => /필수 주제/.test(w)));
ok('★ 오답을 고르면 위험 설명을 들려준다', choices.every((q) => q.results[(q.answer + 1) % q.options.length] === hz.find((h) => h.id === q.hazardId).risk));

const bad = (o) => Q.normalizeCandidate({ hazardId: 'r1', prompt: '문항', options: ['짧다', '이것은 아주 아주 아주 아주 길게 쓴 정답 선택지', '짧음'], answer: 1, why: 'w', ...o }, { slot: 1, hazardId: 'r1', type: 'action' }, hz[1], PHRASES).reasons.join();
has('★ 선택지 길이 쏠림을 잡는다 (이유 이름 §9.1)', bad({}), '길이 쏠림');
has('★ 두 문장 발문은 뺀다 (상황판단만 두 문장)', bad({ prompt: '손이 끼었습니다. 먼저 무엇을 합니까?', options: ['가나', '다라', '마바'], answer: 0 }), '발문 문장');
has('★ 「아닌 것은」 부정 발문 금지', bad({ prompt: '옳지 않은 것은?', options: ['가나', '다라', '마바'], answer: 0 }), '금지어');
has('★ 정답 번호가 틀리면 뺀다', bad({ options: ['가나', '다라', '마바'], answer: 5 }), '정답 번호');
has('★ 같은 선택지 둘', bad({ options: ['가나', '가나', '마바'], answer: 0 }), '같은 선택지');
has('★ 다른 위험요소를 가리키면 뺀다', bad({ hazardId: 'r2', options: ['가나', '다라', '마바'], answer: 0 }), '다른 위험요소');
has('★ 「면책」 금지 (이유 이름 「면책」)', bad({ options: ['가나', '다라', '마바'], answer: 0, why: '면책됩니다' }), '면책 (');
const dup = Q.selectQuiz({ slots: [{ slot: 1, hazardId: 'r3', type: 'action', difficulty: 'easy' }, { slot: 2, hazardId: 'r4', type: 'action', difficulty: 'easy' }] }, hz,
  { questions: [{ slot: 1, hazardId: 'r3', prompt: '바닥에 기름이 있으면 어떻게 합니까', options: ['닦는다', '지나간다', '뛴다'], answer: 0, why: 'w' },
    { slot: 2, hazardId: 'r4', prompt: '바닥에 기름이 있으면 어떻게 합니까', options: ['닦는다', '지나간다', '뛴다'], answer: 0, why: 'w' }] }, []);
eq('★★ 거의 같은 문항은 하나만 (중복 방지)', dup.quiz.length + '|' + dup.missing.join(), '1|2');

/* ── 엔드포인트 ─────────────────────────────────────────────────── */
let modelCalls = 0;
function fakeModel(respond) {
  globalThis.fetch = async (url, init) => {
    if (!(init && init.body)) return new Response('', { status: 404 });
    modelCalls += 1;
    const user = JSON.parse(init.body).contents[0].parts[0].text;
    const slots = Array.from(user.matchAll(/slot (\d+): hazardId (\S+) \(.*?\), type (\w+), 난이도 (\w+)/g)).map((m) => ({ slot: +m[1], hazardId: m[2], type: m[3], difficulty: m[4] }));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(respond(slots, user)) }] } }] }), { status: 200 });
  };
}
const call = async (body, token = ADMIN) => {
  const res = await api.handle(new Request('https://x/api/questions', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, authorization: 'Bearer ' + token }, body: JSON.stringify(body) }));
  return { status: res.status, data: await res.json().catch(() => null) };
};
const BODY = { equipment: { id: 'e-press3', kind: 'press', name: '프레스 3호기' }, hazards: HAZ, phrases: PHRASES };

fakeModel((slots) => fakeAnswer(slots));
eq('노동자는 못 부른다', (await call(BODY, WORKER)).status, 403);
eq('설비 id 가 없으면 400', (await call({ ...BODY, equipment: { name: 'x' } })).status, 400);
eq('위험요소가 없으면 400', (await call({ ...BODY, hazards: [] })).status, 400);
modelCalls = 0;
const r = await call(BODY);
eq('★ 200 · 문항 = 계획 수', r.status + '|' + r.data.quiz.length, '200|' + plan.count);
eq('★★ 고른 설비를 그대로 돌려준다', r.data.equipment.id + '|' + r.data.equipment.kind, 'e-press3|press');
eq('★ AI 는 한 번만 부른다 (모든 칸을 한 질문에)', modelCalls, 1);
ok('계획을 함께 돌려준다', r.data.plan && r.data.plan.slots.length === plan.count);

/* 다시 만들기 — 그 칸만, 위험·유형·난이도 그대로, 앞 문항과 다르게 */
const target = r.data.plan.slots.find((s) => s.type !== 'location');
let seenUser = '';
fakeModel((slots, user) => { seenUser = user; return fakeAnswer(slots); });
const again = await call({ ...BODY, slots: [target], avoid: ['앞 문항 글'] });
eq('★★ 다시 만들기는 그 칸 하나', again.data.quiz.length + '|' + again.data.quiz[0].slot + '|' + again.data.quiz[0].hazardId, '1|' + target.slot + '|' + target.hazardId);
eq('★ 유형·난이도 그대로', again.data.quiz[0].subtype + '|' + again.data.quiz[0].difficulty, target.type + '|' + target.difficulty);
has('★ 앞 문항과 다르게 만들라고 알린다', seenUser, '앞 문항 글');

/* 필수 칸이 비면 그 칸만 한 번 더 */
let n = 0;
fakeModel((slots) => { n += 1; return n === 1 ? { questions: [] } : fakeAnswer(slots); });
const retry = await call(BODY);
ok('★★ 필수(공식 문서) 칸이 비면 한 번 더 묻는다', n === 2 && retry.data.quiz.some((q) => q.hazardId === 'o1'));

/* 위치 문항뿐이면 AI 를 부르지 않는다 */
modelCalls = 0;
const onlyLoc = await call({ ...BODY, slots: [r.data.plan.slots.find((s) => s.type === 'location')] });
eq('★ 위치 문항은 코드가 만든다 (AI 0회)', modelCalls + '|' + onlyLoc.data.quiz[0].type, '0|hotspot');

db.setSqlForTest(null);
console.log = realLog;
report('평가문항 자동 생성·선정 — /api/questions (SAFETY_QUESTION_GENERATION_RULES)');
