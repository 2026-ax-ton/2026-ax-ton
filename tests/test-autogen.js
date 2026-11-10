/* AI로 교육 만들기 화면 (admin/autogen) + 노동자 사진 문항 — PRD-AD-08 · 2026-11-11 개선 요청

   ★ 서버를 부르지 않는다. Net.post 를 가짜로 바꿔 끼운다.
   ★ jsdom 에는 canvas 가 없어 사진 줄이기는 사람이 확인한다.

   이 묶음이 지키는 것
     1. ★★ 설비는 설비 탭(setup)에서 불러온다 — 사진·저장된 분석을 다시 입력하지 않는다. 분석은 설비에 저장된다
     2. ★★ 설비를 바꾸면 앞 설비의 분석·문항을 버린다. 서버·결과 파일의 설비가 다르면 쓰지 않는다
     3. ★★ 문구는 그 설비 종류 + 공통만 — 다른 설비(도장) 문구는 나오지도 들어가지도 않는다
     4. ★★ 문항은 서버 규칙이 만든다(위험요소 → 문항). 담당자는 문항을 고르지 않는다 — 수정 요청·다시 만들기·보류만
     5. ★★ AI 작성 문항은 표시되고, 검토 표시 전에는 발급이 안 된다. 발급본에 위험요소 스냅샷이 붙는다
     6. ★ 사진 박스 번호 = 목록 번호, 박스를 누르면 그 항목이 강조된다. 좌표 없는 항목은 「위치 확인 필요」
     7. ★ 외부 참고 사진은 「실제 설비 사진 아님」으로 구분, data URL 만
     8. ★★ 승인 전에는 courses 에 쓰지 않는다 · AI 글은 글자로만 (FR-25)
     9. ★★ 노동자 퀴즈가 사진 위에서 짚고 채점한다 · 사진이 data URL 이 아니면 쓰지 않는다 */

const { boot, ok, eq, has, report } = require('./harness');
const click = (win, n) => n.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));
const ticks = async (n) => { for (let i = 0; i < (n || 6); i += 1) await tick(); };

const RESEARCH = {
  overview: '유압 프레스', general: false, sourceCount: 3, thin: false, model: 'gemini-3.1-flash-lite',
  limits: ['nypress.co.kr 인증서 오류로 못 열림'],
  items: [
    { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', risk: '손이 끼인다.', status: 'ok', reasons: [],
      sources: [{ title: 'KOSHA', url: 'https://kosha.or.kr/a', host: 'kosha.or.kr', tier: 2 }], conflict: '' },
    { id: 'r2', part: '제어반', hazard: 'shock', risk: '<img src=x onerror=alert(1)>', status: 'check',
      reasons: ['출처끼리 말이 다름'], sources: [], conflict: '설명서와 웹 글이 다름' },
    { id: 'r3', part: '페달', hazard: 'unknown', risk: '오조작', status: 'check', reasons: ['위험유형을 정하지 못함'], sources: [], needsPhoto: '페달 옆에서' },
  ],
};
const PHOTO = 'data:image/jpeg;base64,' + Buffer.alloc(200, 1).toString('base64');
const GUIDED = { mapped: [
  { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', box: { x0: 30, y0: 40, x1: 70, y1: 60 }, answer: { x: 50, y: 50, r: 20 } },
  { id: 'r2', part: '제어반', hazard: 'shock', box: { x0: 0, y0: 0, x1: 20, y1: 20 }, answer: { x: 10, y: 10, r: 10 } },
], missing: [{ id: 'r3', part: '페달', needsPhoto: '페달 옆에서' }] };
const incBox = (t, id) => t.win.document.querySelector('#ag-items li[data-id="' + id + '"] input.ag-include');
const setInc = (t, id, on) => { const b = incBox(t, id); b.checked = on; b.dispatchEvent(new t.win.Event('change', { bubbles: true })); };
const tabTo = (t, name) => click(t.win, t.win.document.querySelector('#ag-tabs [data-tab="' + name + '"]'));

/** 가짜 /api/questions — 위험요소마다 한 문항 (좌표가 있으면 위치, 없으면 AI 작성 고르기). r1 은 검수 문구 정답 */
function fakeQuestions(body) {
  const slots = body.slots || body.hazards.map((h, i) => ({ slot: i + 1, hazardId: h.id, type: h.answer ? 'location' : 'action', difficulty: 'medium', required: !!h.official }));
  const quiz = slots.map((s, i) => {
    const h = body.hazards.find((x) => x.id === s.hazardId);
    const base = { id: 'q' + (i + 1), slot: s.slot, subtype: s.type, hazard: h.hazard, hazardId: h.id, difficulty: s.difficulty, why: '해설 ' + h.part, prevention: '예방 ' + h.part, sources: h.sources, evidence: '근거', i18n: {} };
    if (s.type === 'location') return { ...base, type: 'hotspot', prompt: '사진에서 「' + h.part + '」을(를) 누르세요', answer: h.answer, figure: 'photo', answerFrom: 'photo', aiWritten: false };
    return { ...base, type: 'choice', prompt: (body.avoid ? '새 ' : '') + h.part + ' — 어떻게 합니까?', options: ['맞는 행동', '틀린 행동 하나', '틀린 행동 둘'], answer: 0, results: ['ok', 'x', 'x'], answerFrom: 'ai', aiWritten: true };
  });
  return { equipment: body.equipment, plan: { count: slots.length, slots, reasons: ['위험요소 ' + body.hazards.length + '개 → 문항 ' + slots.length + '개'], rulesVersion: '2026-11-11' }, quiz, excluded: [{ slot: 1, prompt: '모두 정답', why: ['금지어 「모두 정답」'] }], missing: [], issuable: { ok: true, why: [] }, rulesVersion: '2026-11-11' };
}

(async () => {
  /* ═══ 1. 서버 모드 — 설비 사진·종류는 설비 탭 것 ═══ */
  const t = boot('admin/autogen.html', {
    login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js',
    before: (w) => {
      w.sessionStorage.setItem('safety.token.v1', 'tok-test');
      w.Store.setup.update((s) => { s.equipments.find((e) => e.id === 'e-press3').photo = PHOTO; });
    },
  });
  const { win, $ } = t;
  const S = win.Store;
  const before = JSON.stringify(S.courses.load());
  const doc = win.document;

  const calls = [];
  let researchEquip = null;
  win.Net.available = () => true;
  win.Net.post = (path, body) => {
    calls.push({ path, body: JSON.parse(JSON.stringify(body)) });
    const id = body.equipment && body.equipment.id;
    const reply = (data) => Promise.resolve({ ok: true, status: 200, data: { ...data, equipment: researchEquip || { id } } });
    if (path === '/api/research') return reply(JSON.parse(JSON.stringify(RESEARCH)));
    if (path === '/api/hazards') return reply(JSON.parse(JSON.stringify(GUIDED)));
    if (path === '/api/photos') return reply({ images: { r1: { data: 'data:image/jpeg;base64,/9j/AAAA', page: 'https://kosha.or.kr/a', host: 'kosha.or.kr', alt: '램', kind: 'page', license: '확인 필요' } } });
    if (path === '/api/questions') return Promise.resolve({ ok: true, status: 200, data: fakeQuestions(body) });
    return Promise.resolve({ ok: false, status: 404, data: {} });
  };

  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
  eq('★ 설비 목록은 설비 탭의 것', $('ag-equip').options.length, S.setup.load().equipments.length);
  ok('★★ 설비 사진을 설비 탭에서 불러온다 (다시 넣지 않는다)', $('ag-equip-photo').hidden === false && $('ag-equip-photo').getAttribute('src') === PHOTO);
  has('설비 종류를 보인다', $('ag-equip-spec').textContent, '종류: 프레스');
  ok('「AI 여기까지」 안내는 없다 (2026-11-10)', !doc.querySelector('.ai-note'));

  click(win, $('btn-research'));
  await ticks();
  const rc = calls.find((c) => c.path === '/api/research');
  eq('★★ 조사에 설비 id·종류를 보낸다', rc && rc.body.equipment.id + '|' + rc.body.equipment.kind, 'e-press3|press');
  ok('★ 계정 값은 보내지 않는다', rc && !/kim@daesung|김현수/.test(JSON.stringify(rc.body)));
  const hc = calls.find((c) => c.path === '/api/hazards');
  ok('★★ 설비 사진이 있으면 위치 찾기를 바로 부른다 (설비 id 함께)', !!hc && hc.body.image === PHOTO && hc.body.equipment.id === 'e-press3');
  const saved = S.setup.load().equipments.find((e) => e.id === 'e-press3').analysis;
  eq('★★ 분석이 설비에 저장된다 (설비 탭이 원천)', saved && saved.research.items.length + '|' + saved.guided.mapped.length + '|' + saved.kind, '3|2|press');
  has('★ 개수 줄 — 위험요소·사진·위치·위치 확인 필요·문항', $('ag-counts').textContent, '위험요소 3개 · 설비 사진 1장 · 사진 위치 2곳 · 위치 확인 필요 1개 · 문항 0개');
  ok('★ 판정이 남아 있으면 문항을 아직 만들지 않는다', !calls.some((c) => c.path === '/api/questions'));
  ok('참고 사진 찾기를 부른다', calls.some((c) => c.path === '/api/photos'));

  /* 사진 · 번호 · 강조 */
  const boxes = Array.from(doc.querySelectorAll('#ag-figure .ag-box'));
  eq('★ 사진 위 박스 = 좌표가 있는 항목 수', boxes.length, 2);
  eq('★★ 박스 번호 = 목록 번호 (번호만, 이름은 title)', boxes[1].textContent + '|' + boxes[1].title, '#2|#2 제어반');
  has('실제 설비 사진 표시', $('ag-figure').textContent, '실제 설비 사진 · AI 탐지');
  click(win, boxes[1]);
  eq('★★ 박스를 누르면 그 항목의 탭으로 가서 강조', win.__autogen.state().itemTab + '|' + doc.querySelector('#ag-items li[data-id="r2"]').getAttribute('data-active'), 'check|yes');
  eq('그 박스도 강조 · 이름까지 보인다', doc.querySelector('#ag-figure .ag-box[data-id="r2"]').getAttribute('data-active') + '|' + doc.querySelector('#ag-figure .ag-box[data-id="r2"]').textContent, 'yes|#2 제어반 · 감전');
  has('★★ 좌표 없는 항목은 「위치 확인 필요」 — 지어내지 않는다', doc.querySelector('#ag-items li[data-id="r3"]').textContent, '위치 확인 필요');
  has('필요한 사진을 알린다', doc.querySelector('#ag-items li[data-id="r3"]').textContent, '필요한 사진: 페달 옆에서');
  ok('★★ AI 글에 HTML 이 있어도 요소가 생기지 않는다', !doc.querySelector('#ag-items li[data-id="r2"] img'));
  has('그 글이 글자 그대로 보인다', $('ag-items').textContent, '<img src=x onerror=alert(1)>');
  ok('★ 아직 안 본 확인 필요는 반쯤 찬 표시', incBox(t, 'r3').indeterminate === true);
  tabTo(t, 'ok');
  const ref = doc.querySelector('#ag-items li[data-id="r1"] .ag-ref');
  ok('★ 참고 사진이 보인다', !!ref && ref.querySelector('img').getAttribute('src').indexOf('data:image/jpeg;base64,') === 0);
  has('★★ 외부 참고 사진은 「실제 설비 사진 아님」으로 구분', ref.textContent, '실제 설비 사진 아님');
  has('이용 조건을 보인다', ref.textContent, '이용 조건: 확인 필요');

  /* 교육자료 — 설비 종류 문구만 */
  const phraseIds = Array.from(doc.querySelectorAll('#ag-phrases [data-phrase]')).map((n) => n.getAttribute('data-phrase'));
  ok('★★ 프레스 설비에 도장 문구(ph-4)는 나오지 않는다', phraseIds.length > 0 && phraseIds.indexOf('ph-4') === -1, phraseIds.join());
  ok('★ 프레스·공통 검수 문구가 자동으로 들어간다', phraseIds.indexOf('ph-1') !== -1 && phraseIds.indexOf('ph-6') !== -1);
  ok('★ 검수 대기 문구(ph-7)는 들어가지 않는다', phraseIds.indexOf('ph-7') === -1);
  ok('★★ 문구를 고르는 칸이 없다 (담당자가 고르지 않는다)', !doc.querySelector('#ag-phrases input'));

  /* 판정 → 다 보면 문항을 자동으로 만든다 */
  tabTo(t, 'check');
  setInc(t, 'r2', false);
  ok('하나 남았으면 아직 안 만든다', !calls.some((c) => c.path === '/api/questions'));
  click(win, doc.querySelector('#ag-items li[data-id="r3"] button[data-judge="edit"]'));
  await ticks();
  const editBox = doc.querySelector('#ag-items li[data-id="r3"] .ag-edit');
  const inputs = editBox.querySelectorAll('input, select');
  inputs[0].value = '발판 페달'; inputs[0].dispatchEvent(new win.Event('change', { bubbles: true }));
  inputs[1].value = 'pinch'; inputs[1].dispatchEvent(new win.Event('change', { bubbles: true }));
  click(win, $('btn-regen-all'));
  await ticks();
  const qc = calls.filter((c) => c.path === '/api/questions').pop();
  ok('★★ 판정이 끝나면 /api/questions 로 문항을 만든다', !!qc);
  const sent = qc.body.hazards.map((h) => h.id).join();
  eq('★★ 뺀 위험(r2)은 보내지 않는다 · 고친 r3 은 보낸다', sent, 'r1,r3');
  eq('★★ 고친 부위·위험유형으로 보낸다', qc.body.hazards[1].part + '|' + qc.body.hazards[1].hazard, '발판 페달|pinch');
  eq('★ 좌표가 있는 위험에만 좌표를 보낸다', JSON.stringify(qc.body.hazards.map((h) => !!h.answer)), '[true,false]');
  ok('★★ 문구는 그 설비 종류 것만 보낸다', qc.body.phrases.every((p) => p.id !== 'ph-4'));
  eq('문항이 그려진다', doc.querySelectorAll('#ag-quiz li.ag-q').length, 2);
  has('★★ AI 작성 문항 표시', $('ag-quiz').textContent, 'AI 작성 — 검토 필요');
  has('위치 문항 표시', $('ag-quiz').textContent, '사진 위치 (AI 탐지 좌표)');
  has('★ 문항마다 위험요소 링크', $('ag-quiz').textContent, '위험요소 #3 발판 페달');
  has('★ 해설·예방조치·근거', $('ag-quiz').textContent, '해설 발판 페달');
  has('예방조치', $('ag-quiz').textContent, '안전수칙·예방조치: 예방 발판 페달');
  has('★ 규칙에 걸려 뺀 후보와 이유', $('ag-plan').textContent, '금지어');
  has('계획 이유', $('ag-plan').textContent, '위험요소 2개 → 문항 2개');
  ok('★★ 문항을 고르는 체크박스가 없다', !doc.querySelector('#ag-quiz input'));
  tabTo(t, 'ok');
  has('★ 항목에 연결 문항 번호', doc.querySelector('#ag-items li[data-id="r1"]').textContent, '연결 문항 q1');

  /* 검토 → 발급 */
  eq('★★ 아직 courses 에 아무것도 안 썼다', JSON.stringify(S.courses.load()), before);
  ok('★★ AI 작성 문항 검토 표시 전에는 발급이 꺼져 있다', $('btn-approve').disabled === true, $('ag-check').textContent);
  $('ag-reviewed').checked = true;
  $('ag-reviewed').dispatchEvent(new win.Event('change', { bubbles: true }));
  ok('★ 검토 표시를 하면 발급이 켜진다', $('btn-approve').disabled === false, $('ag-check').textContent);

  /* 수정 요청 — 그 문항만 */
  click(win, doc.querySelector('#ag-quiz button[data-regen="q2"]'));
  await ticks();
  const rq = calls.filter((c) => c.path === '/api/questions').pop();
  eq('★★ 수정 요청은 그 칸 하나 · 앞 문항과 다르게', rq.body.slots.length + '|' + rq.body.avoid[0], '1|발판 페달 — 어떻게 합니까?');
  has('★ 같은 번호(q2)에 새 문항', doc.querySelector('#ag-quiz li[data-q="q2"]').textContent, '새 발판 페달');
  ok('★ 문항이 바뀌면 검토 표시를 다시 받는다', $('ag-reviewed').checked === false && $('btn-approve').disabled === true);
  $('ag-reviewed').checked = true;
  $('ag-reviewed').dispatchEvent(new win.Event('change', { bubbles: true }));

  /* 보류 */
  click(win, $('btn-hold'));
  ok('★ 발급 보류 중에는 발급이 꺼진다', $('btn-approve').disabled === true);
  click(win, $('btn-hold'));
  ok('보류를 풀면 다시 켜진다', $('btn-approve').disabled === false);

  click(win, $('btn-approve'));
  const courses = S.courses.load();
  const c = courses[courses.length - 1];
  eq('★★ 승인하면 한 건 저장', courses.length, JSON.parse(before).length + 1);
  eq('설비 id', c.equipmentId, 'e-press3');
  ok('★★ 문항은 서버가 만든 것 그대로 (노동자 화면 모양)', c.quiz.length === 2 && c.quiz[0].type === 'hotspot' && c.quiz[1].type === 'choice');
  ok('★★ 위험요소 스냅샷 — 모두 이 설비 · 문항의 hazardId 가 다 들어 있다',
    c.hazards.every((h) => h.equipmentId === 'e-press3') && c.quiz.every((q) => c.hazards.some((h) => h.id === q.hazardId)));
  ok('★★ 발급본 문구에 도장 문구가 없다', c.phraseIds.indexOf('ph-4') === -1 && c.phraseIds.length > 0);
  eq('사진 문항이 있으면 설비 사진을 싣는다', c.photo, PHOTO);
  eq('규칙 판을 남긴다', c.rulesVersion, '2026-11-11');
  eq('★ 판정 기록 (뺌 1 · 고침 1)', c.aiDraft.review.wrong + '|' + c.aiDraft.review.edited, '1|1');
  eq('AI 작성 문항 수 기록', c.aiDraft.aiWritten, 1);
  ok('★ 문항 칸 번호(slot)는 저장하지 않는다', c.quiz.every((q) => !('slot' in q)));
  ok('★★ 참고 사진(외부 그림)은 저장하지 않는다', !JSON.stringify(c).includes('/9j/AAAA') && !JSON.stringify(S.setup.load()).includes('/9j/AAAA'));
  ok('발급 뒤 승인 버튼이 꺼진다', $('btn-approve').disabled === true);

  /* 설비 바꾸기 — 앞 설비 것을 버리고, 다시 돌아오면 저장된 분석을 불러온다 */
  const n0 = calls.length;
  $('ag-equip').value = 'e-booth1';
  $('ag-equip').dispatchEvent(new win.Event('change', { bubbles: true }));
  eq('★★ 다른 설비를 고르면 앞 설비의 분석·문항이 사라진다', !!win.__autogen.state().research + '|' + $('sec-items').hidden + '|' + $('sec-quiz').hidden, 'false|true|true');
  eq('★ 제목도 그 설비로', $('ag-title').value, '도장 부스 1 안전교육');
  ok('도장 부스는 사진이 없다', $('ag-equip-photo').hidden === true);
  $('ag-equip').value = 'e-press3';
  $('ag-equip').dispatchEvent(new win.Event('change', { bubbles: true }));
  eq('★★ 설비에 저장된 분석을 다시 조사하지 않고 불러온다', calls.length + '|' + aiCount(win), n0 + '|3');
  has('저장된 분석이라고 알린다', $('ag-research-status').textContent, '저장된 AI 분석');
  ok('화면 오류 없음 (흐름 끝)', t.errors.length === 0, t.errors.join(' | '));

  /* 해시로 설비 고르기 (설비 탭 · 콘텐츠 탭에서 오는 길) */
  const th = boot('admin/autogen.html#eq=e-booth1', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js' });
  eq('★ #eq= 로 온 설비를 고른다', th.$('ag-equip').value, 'e-booth1');

  /* 서버가 다른 설비 결과를 주면 쓰지 않는다 */
  researchEquip = { id: 'e-panel' };
  $('ag-equip').value = 'e-booth1';
  $('ag-equip').dispatchEvent(new win.Event('change', { bubbles: true }));
  click(win, $('btn-research'));
  await ticks();
  has('★★ 다른 설비 결과는 버린다', $('ag-research-status').textContent, '다른 설비의 결과');
  eq('그 결과를 저장하지 않는다', !!S.setup.load().equipments.find((e) => e.id === 'e-booth1').analysis, false);
  researchEquip = null;

  /* ═══ 2. 결과 파일 모드 ═══ */
  {
    const t5 = boot('admin/autogen.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js' });
    const A = t5.win.__autogen;
    let called = 0;
    t5.win.Net.post = () => { called += 1; return Promise.resolve({ ok: false }); };
    eq('파일 모양이 틀리면 거절', A.readRun({ kind: 'other' }), null);
    const qs = fakeQuestions({ equipment: { id: 'x' }, hazards: [{ id: 'r1', part: '램과 금형 사이', hazard: 'pinch', sources: [], answer: GUIDED.mapped[0].answer }] });
    const run = A.readRun({ kind: 'safety-ai-run', equipment: { name: 'C형 유압프레스' }, model: 'm', provider: 'openai',
      research: JSON.parse(JSON.stringify(RESEARCH)), guided: JSON.parse(JSON.stringify(GUIDED)), photo: { data: PHOTO }, questions: qs });
    eq('★ 같은 종류(프레스) 결과 파일은 받는다', A.loadRun(run), true);
    eq('★★ 서버를 부르지 않는다', called, 0);
    has('어느 설비를 조사한 결과인지', t5.$('ag-research-status').textContent, 'C형 유압프레스');
    eq('★ 파일의 문항을 보인다', t5.win.document.querySelectorAll('#ag-quiz li.ag-q').length, 1);
    ok('★ 결과 파일에서는 수정 요청 버튼이 없다 (서버 필요)', !t5.win.document.querySelector('#ag-quiz button[data-regen]'));
    has('서버에서 된다고 알린다', t5.$('ag-quiz-status').textContent, '배포 주소');
    /* 판정을 바꾸면 파일 문항은 옛 것 — 발급을 막는다 */
    t5.win.document.querySelector('#ag-tabs [data-tab="check"]').dispatchEvent(new t5.win.MouseEvent('click', { bubbles: true }));
    setInc(t5, 'r2', true);
    setInc(t5, 'r3', false);
    has('★★ 판정이 바뀌면 「다시 만들어야」 표시', t5.$('ag-plan').textContent, '위험요소 판정이 바뀌었습니다');
    ok('★★ 옛 문항으로는 발급되지 않는다', A.steps().find((s) => s.what === 'AI 평가문항').done === false);
    /* 서버 규칙(§9.4)이 발급 불가라고 하면 막는다 */
    A.state().quizFor = A.signature();
    A.state().quiz.issuable = { ok: false, why: ['필수 주제가 빠졌습니다: emergency'] };
    const st = A.steps().find((s) => s.what === 'AI 평가문항');
    eq('★★ 규칙 §9.4 발급 막기 이유를 보이고 막는다', st.done + '|' + st.note, 'false|필수 주제가 빠졌습니다: emergency');

    const bad = A.readRun({ kind: 'safety-ai-run', equipment: { name: '도장 부스', kind: 'paint' }, research: JSON.parse(JSON.stringify(RESEARCH)) });
    eq('★★ 다른 종류 설비(도장)의 결과 파일은 받지 않는다', A.loadRun(bad), false);
    has('왜 안 되는지 알린다', t5.$('ag-research-status').textContent, '다른 종류 설비(도장)');

    /* 공식 문서 · 기계 고유 · 판매·중계 · 문서번호 · 공식 문서 없음 */
    const offRes = JSON.parse(JSON.stringify(RESEARCH));
    offRes.items[0].official = { code: 'M-30-2002', section: '§7.2', title: 'KOSHA CODE M-30-2002' };
    offRes.items[1].specific = true;
    offRes.items[1].sources = [{ title: '판매 글', url: 'https://daara.co.kr/a', host: 'daara.co.kr', tier: 5, kind: 'sales' }];
    offRes.officialDocs = [{ code: 'M-30-2002', title: 'KOSHA CODE M-30-2002', publisher: '한국산업안전공단', year: 2002 }];
    offRes.docNumbers = ['M-122-2012'];
    A.loadRun(A.readRun({ kind: 'safety-ai-run', equipment: { name: '프레스' }, research: offRes }));
    has('★★ 공식 항목 표시', t5.$('ag-items').textContent, '공식 문서 · M-30-2002 §7.2');
    has('★ 문서번호 원문 확인 (접어 둔 곳)', t5.$('ag-limits').textContent, '문서번호 M-122-2012');
    t5.win.document.querySelector('#ag-tabs [data-tab="check"]').dispatchEvent(new t5.win.MouseEvent('click', { bubbles: true }));
    has('★ 기계 고유', t5.$('ag-items').textContent, '기계 고유');
    has('★ 판매·중계 출처 표시', t5.$('ag-items').textContent, '판매·중계');
    A.loadRun(A.readRun({ kind: 'safety-ai-run', equipment: { name: '프레스' }, research: { ...JSON.parse(JSON.stringify(RESEARCH)), noOfficial: true } }));
    has('★★ 공식 문서가 없으면 크게 알린다', t5.$('ag-limits').textContent, '공식 기준 문서를 찾지 못했습니다');

    /* 참고 사진 — 바깥 주소·svg 는 그리지 않는다 */
    const imgRes = JSON.parse(JSON.stringify(RESEARCH));
    imgRes.items[0].image = { data: 'data:image/jpeg;base64,/9j/AAAA', page: 'https://maker.example.com/p', host: 'maker.example.com', kind: 'video' };
    imgRes.items[1].image = { data: 'https://evil.example.com/x.jpg', page: 'javascript:alert(1)', host: 'evil' };
    imgRes.items[2].image = { data: 'data:image/svg+xml;base64,PHN2Zz4=', page: 'https://x.example.com', host: 'x' };
    A.loadRun(A.readRun({ kind: 'safety-ai-run', equipment: { name: '프레스' }, research: imgRes }));
    has('★ 영상 썸네일은 「영상 썸네일」로 구분', t5.$('ag-items').textContent, '영상 썸네일 (참고)');
    t5.win.document.querySelector('#ag-tabs [data-tab="check"]').dispatchEvent(new t5.win.MouseEvent('click', { bubbles: true }));
    ok('★★ 바깥 주소·svg 사진은 그리지 않는다 (제3자 요청 0건)', !t5.win.document.querySelector('#ag-items .ag-ref'));
    ok('화면 오류 없음 (결과 파일)', t5.errors.length === 0, t5.errors.join(' | '));
  }

  /* ═══ 3. https 가 아니면 · 설비가 없으면 ═══ */
  {
    const t2 = boot('admin/autogen.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js' });
    let called = 0;
    t2.win.Net.available = () => true;
    t2.win.Net.post = () => { called += 1; return Promise.resolve({ ok: true, data: RESEARCH }); };
    ok('★ 토큰이 없으면 안내를 보인다', t2.$('offline-note').hidden === false);
    click(t2.win, t2.$('btn-research'));
    await tick();
    eq('★ 토큰이 없으면 서버를 부르지 않는다', called, 0);
    has('★★ 눌러도 조용하지 않다', t2.$('ag-research-status').textContent, '결과 파일 불러오기');

    const t6 = boot('admin/autogen.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js',
      before: (w) => { w.Store.setup.update((s) => { s.equipments = []; }); } });
    ok('★★ 설비가 없으면 「설비 등록하러 가기」', t6.$('ag-no-equip').hidden === false && !!t6.$('ag-no-equip').querySelector('a[href="setup.html?return=content"]'));
  }

  /* ═══ 4. 노동자 사진 문항 ═══ */
  {
    const t3 = boot('worker/quiz.html?course=c-photo', {
      login: 'W-4821-07', page: 'worker/quiz.js',
      before: (w) => {
        const eqId = w.Store.findBy(w.Store.courses.load(), 'id', 'c-press').equipmentId;
        w.Store.courses.update((list) => { list.push({
          id: 'c-photo', title: '사진 교육', equipmentId: eqId, languages: ['ko', 'km'], phraseIds: ['ph-1'],
          quiz: [{ id: 'q1', type: 'hotspot', prompt: '사진에서 「램」을(를) 누르세요', answer: { x: 50, y: 50, r: 20 }, figure: 'photo', i18n: {}, hazardId: 'r1', subtype: 'location' }],
          hazards: [{ id: 'r1', equipmentId: eqId }],
          dueAt: '', approved: true, createdAt: new Date().toISOString(), photo: PHOTO,
        }); });
        w.Store.progress.update((list) => { list.push({ workerId: 'W-4821-07', courseId: 'c-photo', learnedAt: new Date().toISOString(), quiz: null }); });
      },
    });
    const fig = t3.win.document.querySelector('.quiz-figure');
    ok('★★ 노동자 화면이 사진 문항을 그린다 (새 칸이 있어도)', fig && fig.classList.contains('photo'), t3.errors.join(' | '));
    const img = fig && fig.querySelector('img');
    eq('사진은 교육 안의 data URL', img && img.getAttribute('src'), PHOTO);
    fig.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    fig.dispatchEvent(new t3.win.MouseEvent('click', { bubbles: true, clientX: 52, clientY: 49 }));
    ok('★★ 정답 원 안을 짚으면 맞다고 표시된다', !!fig.querySelector('.tapmark'));
    ok('화면 오류 없음', t3.errors.length === 0, t3.errors.join(' | '));

    const t4 = boot('worker/quiz.html?course=c-bad', {
      login: 'W-4821-07', page: 'worker/quiz.js',
      before: (w) => {
        const eqId = w.Store.findBy(w.Store.courses.load(), 'id', 'c-press').equipmentId;
        w.Store.courses.update((list) => { list.push({
          id: 'c-bad', title: '나쁜 사진', equipmentId: eqId, languages: ['ko'], phraseIds: ['ph-1'],
          quiz: [{ id: 'q1', type: 'hotspot', prompt: 'p', answer: { x: 50, y: 50, r: 20 }, figure: 'photo', i18n: {} }],
          dueAt: '', approved: true, createdAt: new Date().toISOString(), photo: 'https://evil.example/x.jpg',
        }); });
        w.Store.progress.update((list) => { list.push({ workerId: 'W-4821-07', courseId: 'c-bad', learnedAt: new Date().toISOString(), quiz: null }); });
      },
    });
    const f4 = t4.win.document.querySelector('.quiz-figure');
    ok('★★ 사진이 data URL 이 아니면(외부 주소) 쓰지 않고 도해로 간다', f4 && !f4.querySelector('img'));
  }

  report('AI로 교육 만들기 — 설비 원천 · 위험요소→문항 · 검토 발급 (PRD-AD-08 · 2026-11-11)');
})();

function aiCount(win) { return (win.__autogen.state().research || { items: [] }).items.length; }
