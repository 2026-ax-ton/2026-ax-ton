/* AI로 교육 만들기 화면 (admin/autogen) + 노동자 사진 문항 — PRD-AD-08 S1~S4·S6 · 담당자 판정 · 1클릭 승인

   ★ 서버를 부르지 않는다. Net.post 를 가짜로 바꿔 끼운다.
   ★ jsdom 에는 canvas 가 없어 사진 줄이기는 사람이 확인한다. 여기서는 그 뒤(위치 결과)부터 본다.

   이 묶음이 지키는 것
     1. ★★ 승인 전에는 courses 에 아무것도 쓰지 않는다 (AC-AD-08-05)
     2. ★★ 「확인 필요」 항목은 판정 전에는 승인이 안 켜진다 — 판정하면 켜진다 (2026-11-09)
     3. ★★ [틀림]은 문항에서 빠지고, [고치기]한 부위·위험유형이 문항에 쓰인다
     4. ★ 담당자가 빠진 위험을 더할 수 있고, 판정 기록이 aiDraft.review 에 남는다
     5. ★★ AI 가 준 글은 글자로만 — HTML 이 섞여도 요소가 생기지 않는다 (FR-25)
     6. ★ 안전 문구는 검수 완료만 고를 수 있다 (P-1)
     7. ★★ 결과 파일 모드 — 서버를 부르지 않고 같은 검토를 한다 · 모양 틀린 파일은 거절
     8. ★ https 가 아니거나 토큰이 없으면 서버를 부르지 않는다
     9. ★★ 노동자 퀴즈가 사진 위에서 짚고 채점한다 · 사진이 data URL 이 아니면 쓰지 않는다 */

const { boot, ok, eq, has, report } = require('./harness');
const click = (win, n) => n.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));

const RESEARCH = {
  overview: '유압 프레스', general: false, sourceCount: 3, thin: false, model: 'gemini-3.1-flash-lite',
  limits: ['nypress.co.kr 인증서 오류로 못 열림'],
  items: [
    { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', risk: '손이 끼인다.', status: 'ok', reasons: [],
      sources: [{ title: 'KOSHA', url: 'https://kosha.or.kr/a', host: 'kosha.or.kr', tier: 2 }], conflict: '' },
    { id: 'r2', part: '제어반', hazard: 'shock', risk: '<img src=x onerror=alert(1)>', status: 'check',
      reasons: ['출처끼리 말이 다름'], sources: [], conflict: '설명서와 웹 글이 다름' },
    { id: 'r3', part: '페달', hazard: 'unknown', risk: '오조작', status: 'check', reasons: ['위험유형을 정하지 못함'], sources: [] },
  ],
};
const PHOTO = 'data:image/jpeg;base64,' + Buffer.alloc(200, 1).toString('base64');
const GUIDED = { mapped: [
  { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', box: { x0: 30, y0: 40, x1: 70, y1: 60 }, answer: { x: 50, y: 50, r: 20 } },
  { id: 'r2', part: '제어반', hazard: 'shock', box: { x0: 0, y0: 0, x1: 20, y1: 20 }, answer: { x: 10, y: 10, r: 10 } },
  { id: 'r3', part: '페달', hazard: 'unknown', box: { x0: 60, y0: 80, x1: 80, y1: 100 }, answer: { x: 70, y: 90, r: 10 } },
], missing: [] };
const judgeBtn = (t, id, kind) => t.win.document.querySelector('#ag-items li[data-id="' + id + '"] button[data-judge="' + kind + '"]');

(async () => {
  const t = boot('admin/autogen.html', {
    login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js',
    before: (w) => { w.sessionStorage.setItem('safety.token.v1', 'tok-test'); },
  });
  const { win, $ } = t;
  const S = win.Store;
  const before = JSON.stringify(S.courses.load());

  const calls = [];
  win.Net.available = () => true;   // jsdom 에는 fetch 가 없다 — 실제 브라우저에는 있다
  win.Net.post = (path, body, opts) => {
    calls.push({ path, body, opts });
    return Promise.resolve({ ok: true, status: 200, data: JSON.parse(JSON.stringify(RESEARCH)) });
  };

  ok('화면 오류 없음', t.errors.length === 0, t.errors.join(' | '));
  ok('설비 목록이 채워진다', $('ag-equip').options.length > 0);

  /* S2 */
  click(win, $('btn-research'));
  await tick(); await tick();
  eq('★ 리서치를 /api/research 로 부른다', calls[0] && calls[0].path, '/api/research');
  eq('★ 토큰을 함께 보낸다', calls[0] && calls[0].opts.token, 'tok-test');
  ok('★ 설비 정보만 보낸다 (계정 값 없음)', calls[0] && !/kim@daesung|김현수/.test(JSON.stringify(calls[0].body)));
  eq('주의사항 3개가 보인다', $('ag-items').children.length, 3);
  ok('★★ AI 글에 HTML 이 있어도 요소가 생기지 않는다', !$('ag-items').querySelector('img'));
  has('그 글이 글자 그대로 보인다', $('ag-items').textContent, '<img src=x onerror=alert(1)>');
  has('★ 막힌 지점(limits)을 보인다', $('ag-limits').textContent, '인증서 오류');
  const dets = $('ag-items').querySelectorAll('details');
  ok('★★ 확인 필요는 펼쳐 두고, ok 는 접어 둔다', dets[1].open === true && dets[0].open === false);
  has('충돌 내용을 보인다', $('ag-items').textContent, '설명서와 웹 글이 다름');
  ok('출처 링크는 새 창 + noopener', $('ag-items').querySelector('a').rel.indexOf('noopener') !== -1);
  ok('★ 판정 버튼 셋이 항목마다 있다', !!judgeBtn(t, 'r2', 'right') && !!judgeBtn(t, 'r2', 'wrong') && !!judgeBtn(t, 'r2', 'edit'));

  /* 사진 결과를 끼워 넣는다 (canvas 없음) */
  const st = win.__autogen.state();
  st.guided = JSON.parse(JSON.stringify(GUIDED));
  st.keepPhoto = PHOTO;
  eq('★★ 판정 전: ok 항목만 문항 (확인 필요 r2·r3 빠짐)', win.__autogen.draftQuiz().length, 1);

  /* 문구 하나 고르기 */
  const firstPhrase = $('ag-phrases').querySelector('input');
  firstPhrase.checked = true;
  firstPhrase.dispatchEvent(new win.Event('change', { bubbles: true }));
  ok('★★ 확인 필요가 남아 있으면 승인이 꺼져 있다', $('btn-approve').disabled === true, $('ag-check').textContent);
  has('남은 판정 수를 보인다', $('ag-check').textContent, '2개 남음');
  eq('★★ 아직 courses 에 아무것도 안 썼다', JSON.stringify(S.courses.load()), before);

  /* 판정: r2 틀림, r3 고치기(위험유형 끼임 · 부위 이름 고침) */
  click(win, judgeBtn(t, 'r2', 'wrong'));
  click(win, judgeBtn(t, 'r3', 'edit'));
  const editBox = win.document.querySelector('#ag-items li[data-id="r3"] .ag-edit');
  ok('고치기를 누르면 고칠 칸이 열린다', !!editBox);
  const inputs = editBox.querySelectorAll('input, select');
  inputs[0].value = '발판 페달'; inputs[0].dispatchEvent(new win.Event('change', { bubbles: true }));
  inputs[1].value = 'pinch'; inputs[1].dispatchEvent(new win.Event('change', { bubbles: true }));
  const quiz = win.__autogen.draftQuiz();
  eq('★★ 틀림(r2)은 빠지고 고친 r3 는 들어간다', quiz.length, 2);
  has('★★ 고친 부위 이름으로 문항을 만든다', quiz[1].prompt, '발판 페달');
  eq('★ 고친 위험유형이 문항에 들어간다', quiz[1].hazard, 'pinch');
  ok('틀린 항목은 줄을 그어 보인다', win.document.querySelector('#ag-items li[data-id="r2"]').getAttribute('data-judge') === 'wrong');

  /* 위치 고치기 — AI 박스가 엉뚱한 곳이면 사진을 눌러 다시 짚는다 (2026-11-09 실측에서 필요했다) */
  ok('★ 틀림 항목에는 위치 고치기가 없다', !win.document.querySelector('button[data-move="r2"]'));
  click(win, win.document.querySelector('button[data-move="r1"]'));
  const fig = $('ag-figure');
  fig.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 });
  fig.dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: 50, clientY: 80 }));
  const q1 = win.__autogen.draftQuiz()[0];
  eq('★★ 누른 자리가 새 정답 중심이 된다 (퍼센트)', q1.answer.x + ',' + q1.answer.y, '25,80');
  eq('반지름은 AI 박스 크기 그대로', q1.answer.r, 20);
  eq('한 번 누르면 위치 고치기가 끝난다', win.__autogen.state().moving, '');

  /* 빠진 위험 추가 */
  $('ag-add-part').value = '유압호스';
  $('ag-add-risk').value = '고압 기름이 뿜어진다';
  $('ag-add-hazard').value = 'fire';
  click(win, $('btn-add-item'));
  has('★ 담당자가 더한 위험이 목록에 보인다', $('ag-items').textContent, '유압호스 (담당자 추가)');
  eq('추가 항목은 사진 위치가 없어 문항은 늘지 않는다', win.__autogen.draftQuiz().length, 2);

  ok('★★ 판정이 끝나면 승인이 켜진다', $('btn-approve').disabled === false, $('ag-check').textContent);
  eq('겹치지 않는 문항이면 겹침 안내가 없다', /겹치는 문항/.test($('ag-lang-note').textContent), false);
  click(win, $('btn-approve'));
  const courses = S.courses.load();
  const c = courses[courses.length - 1];
  eq('★★ 승인하면 교육 1건이 늘어난다', courses.length, JSON.parse(before).length + 1);
  eq('발급 상태', c.approved, true);
  eq('사진이 함께 들어간다', c.photo, PHOTO);
  eq('문항 2개', c.quiz.length, 2);
  ok('기존 모양 필드가 다 있다', ['id', 'title', 'equipmentId', 'languages', 'phraseIds', 'quiz', 'dueAt', 'createdAt'].every((k) => k in c));
  const rv = c.aiDraft && c.aiDraft.review;
  ok('★ 판정 기록이 남는다 (틀림 1 · 고침 1 · 추가 1 · 위치 고침 1)', rv && rv.wrong === 1 && rv.edited === 1 && rv.added === 1 && rv.moved === 1, JSON.stringify(rv));
  eq('틀린 부위 이름이 기록된다', rv && rv.wrongParts.join(), '제어반');
  ok('승인 뒤 초안을 비운다', $('sec-approve').hidden === true);

  /* 검수 완료 문구만 */
  const phraseIds = Array.from($('ag-phrases').querySelectorAll('input')).map((n) => n.value);
  ok('★ 검수 대기 문구(ph-5)는 고를 수 없다', phraseIds.indexOf('ph-5') === -1);

  /* 7. 결과 파일 모드 */
  {
    const t5 = boot('admin/autogen.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js' });
    let called = 0;
    t5.win.Net.post = () => { called += 1; return Promise.resolve({ ok: true, data: RESEARCH }); };
    const A = t5.win.__autogen;
    eq('★ 모양 틀린 파일은 거절', A.readRun({ kind: 'other', research: { items: [] } }), null);
    eq('research 가 없으면 거절', A.readRun({ kind: 'safety-ai-run' }), null);
    const bad = A.readRun({ kind: 'safety-ai-run', research: RESEARCH, guided: GUIDED, photo: { data: 'https://evil.example/x.jpg' } });
    ok('★★ 사진이 data URL 이 아니면 쓰지 않는다 (위치도 버림)', bad.photo === '' && bad.guided === null);
    const personRun = A.readRun({ kind: 'safety-ai-run', research: RESEARCH, guided: { ...GUIDED, person: true }, photo: { data: PHOTO } });
    ok('★ 사람 찍힘 결과는 위치를 쓰지 않는다', personRun.guided === null);
    const run = A.readRun({ kind: 'safety-ai-run', provider: 'openai', model: 'gpt-x', equipment: { name: 'C형 유압프레스' },
      research: JSON.parse(JSON.stringify(RESEARCH)), guided: JSON.parse(JSON.stringify(GUIDED)), photo: { data: PHOTO } });
    A.loadRun(run);
    eq('★★ 결과 파일로 같은 검토 화면이 열린다', t5.$('ag-items').children.length, 3);
    has('어느 설비를 조사한 결과인지 보인다', t5.$('ag-research-status').textContent, 'C형 유압프레스');
    eq('★★ 결과 파일 모드에서 서버를 부르지 않는다', called, 0);
    eq('결과 파일 출처 기록', A.state().source, 'file');

    const docRun = A.readRun({ kind: 'safety-ai-run', equipment: { name: 'x' },
      research: { ...JSON.parse(JSON.stringify(RESEARCH)), docNumbers: ['M-122-2012'] } });
    A.loadRun(docRun);
    has('★★ AI 가 적은 문서번호를 원문 확인 대상으로 보인다', t5.$('ag-limits').textContent, '문서번호 M-122-2012');

    /* 공식 문서 먼저 · 기계 고유 · 판매·중계 표시 (2026-11-09) */
    const offRes = JSON.parse(JSON.stringify(RESEARCH));
    offRes.items[0].official = { code: 'M-30-2002', section: '§7.2', title: 'KOSHA CODE M-30-2002', publisher: '한국산업안전공단', year: 2002 };
    offRes.items[1].specific = true;
    offRes.items[1].sources = [{ title: '판매 글', url: 'https://daara.co.kr/a', host: 'daara.co.kr', tier: 5, kind: 'sales' }];
    offRes.officialDocs = [{ code: 'M-30-2002', title: 'KOSHA CODE M-30-2002', publisher: '한국산업안전공단', year: 2002, url: 'https://moel.go.kr/x' }];
    A.loadRun(A.readRun({ kind: 'safety-ai-run', equipment: { name: '프레스' }, research: offRes }));
    has('★★ 공식 항목에 「공식 문서 · 번호 조항」 표시', t5.$('ag-items').textContent, '공식 문서 · M-30-2002 §7.2');
    has('★ 공식 문서 안내', t5.$('ag-limits').textContent, '공식 문서 · M-30-2002');
    has('★ 기계 고유 표시', t5.$('ag-items').textContent, '기계 고유');
    has('★ 판매·중계 출처 표시', t5.$('ag-items').textContent, '판매·중계');
    A.loadRun(A.readRun({ kind: 'safety-ai-run', equipment: { name: 'x' }, research: { ...JSON.parse(JSON.stringify(RESEARCH)), noOfficial: true } }));
    has('★★ 공식 문서가 없으면 크게 알린다', t5.$('ag-limits').textContent, '공식 기준 문서를 찾지 못했습니다');

    /* 겹치는 정답 원 안내 */
    const st5 = A.state();
    st5.guided = { mapped: [
      { id: 'r1', box: { x0: 40, y0: 40, x1: 60, y1: 60 }, answer: { x: 50, y: 50, r: 10 } },
      { id: 'r2', box: { x0: 45, y0: 45, x1: 65, y1: 65 }, answer: { x: 55, y: 55, r: 10 } }], missing: [] };
    st5.keepPhoto = PHOTO;
    st5.judge.r2 = 'right'; st5.judge.r3 = 'wrong';
    t5.$('ag-title').dispatchEvent(new t5.win.Event('input', { bubbles: true }));
    /* 2026-11-09 v3 실측 59쌍 겹침 → 같은 자리는 문항 하나로 합친다 (FR-AD-07-21) */
    eq('★★ 겹치는 자리는 문항 하나로 합친다 (앞 항목이 남는다)', A.draftQuiz().length, 1);
    has('★ 무엇을 무엇에 합쳤는지 알린다', t5.$('ag-lang-note').textContent, '1개 항목은 문항 하나로 합쳤습니다');
    ok('★ 저장 문항에는 합치기용 part 가 없다 (courses 문항 모양 그대로)', A.draftQuiz().every((q) => !('part' in q)));

    /* 사진 문항 상한 — 겹치지 않는 자리 8곳이어도 6문항까지 */
    st5.research.items = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, part: '부위' + i, hazard: 'pinch', risk: 'r', sources: [], status: 'ok', reasons: [] }));
    st5.guided = { mapped: st5.research.items.map((it, i) => ({ id: it.id, box: { x0: i * 12, y0: 10, x1: i * 12 + 4, y1: 14 }, answer: { x: i * 12 + 2, y: 12, r: 5 } })), missing: [] };
    st5.judge = {};
    t5.$('ag-title').dispatchEvent(new t5.win.Event('input', { bubbles: true }));
    eq('★★ 사진 문항은 6개까지', A.draftQuiz().length, 6);
    eq('뺀 항목 2개를 센다', A.draftPlan().cut.length, 2);
    has('★ 뺀 항목을 알린다', t5.$('ag-lang-note').textContent, '사진 문항은 6개까지라 2개 항목은');
    eq('문항 번호가 이어진다', A.draftQuiz().map((q) => q.id).join(), 'q1,q2,q3,q4,q5,q6');
    /* 판정 버튼 하나를 누르면 화면 전체(사진 포함)를 다시 그린다 */
    t5.win.document.querySelector('#ag-items button[data-judge="right"]')
      .dispatchEvent(new t5.win.MouseEvent('click', { bubbles: true }));
    const boxes = Array.from(t5.win.document.querySelectorAll('#ag-figure .ag-box'));
    eq('★ 사진 위 박스: 문항이 된 것 6 · 아닌 것 2 (흐리게)', boxes.filter((b) => b.getAttribute('data-q') === 'yes').length + '|' + boxes.filter((b) => b.getAttribute('data-q') === 'no').length, '6|2');
    has('★ 문항 박스에 번호', boxes[0].textContent, '문항 1 · ');
  }
  /* 6. https 가 아니면 */
  {
    const t2 = boot('admin/autogen.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/autogen.js' });
    let called = 0;
    t2.win.Net.available = () => true;
    t2.win.Net.post = () => { called += 1; return Promise.resolve({ ok: true, data: RESEARCH }); };
    ok('★ 토큰이 없으면 손 흐름 안내를 보인다', t2.$('offline-note').hidden === false);
    click(t2.win, t2.$('btn-research'));
    await tick();
    eq('★ 토큰이 없으면 서버를 부르지 않는다', called, 0);
  }

  /* 7. 노동자 사진 문항 */
  {
    const t3 = boot('worker/quiz.html?course=c-photo', {
      login: 'W-4821-07', page: 'worker/quiz.js',
      before: (w) => {
        const eqId = w.Store.findBy(w.Store.courses.load(), 'id', 'c-press').equipmentId;   // 이 노동자 공정의 설비
        w.Store.courses.update((list) => { list.push({
          id: 'c-photo', title: '사진 교육', equipmentId: eqId, languages: ['ko', 'km'], phraseIds: ['ph-1'],
          quiz: [{ id: 'q1', type: 'hotspot', prompt: '사진에서 「램」을(를) 누르세요', answer: { x: 50, y: 50, r: 20 }, figure: 'photo', i18n: {} }],
          dueAt: '', approved: true, createdAt: new Date().toISOString(), photo: PHOTO,
        }); });
        w.Store.progress.update((list) => { list.push({ workerId: 'W-4821-07', courseId: 'c-photo', learnedAt: new Date().toISOString(), quiz: null }); });
      },
    });
    const fig = t3.win.document.querySelector('.quiz-figure');
    ok('★★ 노동자 화면이 사진 문항을 그린다', fig && fig.classList.contains('photo'), t3.errors.join(' | '));
    const img = fig && fig.querySelector('img');
    eq('사진은 교육 안의 data URL (네트워크 요청 없음)', img && img.getAttribute('src'), PHOTO);
    ok('도해 SVG 를 그리지 않는다', fig && !fig.querySelector('svg'));
    fig.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    fig.dispatchEvent(new t3.win.MouseEvent('click', { bubbles: true, clientX: 52, clientY: 49 }));
    ok('★★ 정답 원 안을 짚으면 맞다고 표시된다', !!fig.querySelector('.tapmark'));
    ok('화면 오류 없음', t3.errors.length === 0, t3.errors.join(' | '));

    const t4 = boot('worker/quiz.html?course=c-bad', {
      login: 'W-4821-07', page: 'worker/quiz.js',
      before: (w) => {
        const eqId = w.Store.findBy(w.Store.courses.load(), 'id', 'c-press').equipmentId;   // 이 노동자 공정의 설비
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

  report('AI로 교육 만들기 — 승인 화면 · 사진 문항 (PRD-AD-08)');
})();
