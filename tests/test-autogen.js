/* AI로 교육 만들기 화면 (admin/autogen) + 노동자 사진 문항 — PRD-AD-08 S1~S4·S6 · 1클릭 승인

   ★ 서버를 부르지 않는다. Net.post 를 가짜로 바꿔 끼운다.
   ★ jsdom 에는 canvas 가 없어 사진 줄이기는 사람이 확인한다. 여기서는 그 뒤(위치 결과)부터 본다.

   이 묶음이 지키는 것
     1. ★★ 승인 전에는 courses 에 아무것도 쓰지 않는다 (AC-AD-08-05)
     2. ★★ 「확인 필요」 항목은 펼쳐 보이고 문항에 기본으로 넣지 않는다 (FR-14)
     3. ★★ AI 가 준 글은 글자로만 — HTML 이 섞여도 요소가 생기지 않는다 (FR-25)
     4. ★ 안전 문구는 검수 완료만 고를 수 있다 (P-1)
     5. ★★ 승인하면 사진 문항이 든 교육 1건 — 지금 courses 모양 + photo · figure 만 더한다
     6. ★ https 가 아니거나 토큰이 없으면 서버를 부르지 않고 손 흐름으로 안내한다
     7. ★★ 노동자 퀴즈가 사진 위에서 짚고 채점한다 · 사진이 data URL 이 아니면 쓰지 않는다 */

const { boot, ok, eq, has, report } = require('./harness');
const click = (win, n) => n.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));

const RESEARCH = {
  overview: '유압 프레스', general: false, sourceCount: 3, thin: false, model: 'gemini-3.1-flash-lite',
  items: [
    { id: 'r1', part: '램과 금형 사이', hazard: 'pinch', risk: '손이 끼인다.', status: 'ok', reasons: [],
      sources: [{ title: 'KOSHA', url: 'https://kosha.or.kr/a', host: 'kosha.or.kr', tier: 2 }], conflict: '' },
    { id: 'r2', part: '제어반', hazard: 'shock', risk: '<img src=x onerror=alert(1)>', status: 'check',
      reasons: ['출처끼리 말이 다름'], sources: [], conflict: '설명서와 웹 글이 다름' },
  ],
};
const PHOTO = 'data:image/jpeg;base64,' + Buffer.alloc(200, 1).toString('base64');

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
  ok('주의사항이 보인다', $('ag-items').children.length === 2);
  ok('★★ AI 글에 HTML 이 있어도 요소가 생기지 않는다', !$('ag-items').querySelector('img'));
  has('그 글이 글자 그대로 보인다', $('ag-items').textContent, '<img src=x onerror=alert(1)>');
  const dets = $('ag-items').querySelectorAll('details');
  ok('★★ 확인 필요는 펼쳐 두고, ok 는 접어 둔다', dets[1].open === true && dets[0].open === false);
  has('충돌 내용을 보인다', $('ag-items').textContent, '설명서와 웹 글이 다름');
  const inc = $('ag-items').querySelectorAll('input[name="ag-include"]');
  ok('★★ 확인 필요는 문항에 기본으로 넣지 않는다', inc[0].checked === true && inc[1].checked === false);
  ok('출처 링크는 새 창 + noopener', $('ag-items').querySelector('a').rel.indexOf('noopener') !== -1);

  /* 승인 전 */
  ok('승인 칸이 열린다', $('sec-approve').hidden === false);
  ok('★ 사진 전에는 승인 버튼이 꺼져 있다', $('btn-approve').disabled === true);
  eq('★★ 아직 courses 에 아무것도 안 썼다', JSON.stringify(S.courses.load()), before);

  /* 검수 완료 문구만 */
  const phraseIds = Array.from($('ag-phrases').querySelectorAll('input')).map((n) => n.value);
  const lib = S.library.load();
  ok('★ 고를 수 있는 문구는 전부 검수 완료(어느 언어든)', phraseIds.every((id) => {
    const p = S.findBy(lib, 'id', id);
    return S.phraseOk(p, 'ko') || (S.setup.load().languages || []).some((c) => S.phraseOk(p, c));
  }));
  ok('검수 대기 문구(ph-5)는 고를 수 없다', phraseIds.indexOf('ph-5') === -1);

  /* S3 결과를 끼워 넣는다 (canvas 없음) */
  const st = win.__autogen.state();
  st.guided = { mapped: [{ id: 'r1', part: '램과 금형 사이', hazard: 'pinch', box: { x0: 30, y0: 40, x1: 70, y1: 60 }, answer: { x: 50, y: 50, r: 20 } },
                         { id: 'r2', part: '제어반', hazard: 'shock', box: { x0: 0, y0: 0, x1: 20, y1: 20 }, answer: { x: 10, y: 10, r: 10 } }], missing: [] };
  st.keepPhoto = PHOTO;
  const quiz = win.__autogen.draftQuiz();
  eq('★★ 넣기로 한 것만 문항이 된다 (확인 필요 r2 는 빠짐)', quiz.length, 1);
  eq('사진 문항', quiz[0].figure + '|' + quiz[0].type, 'photo|hotspot');
  eq('★ 정답은 지금 courses 모양 {x,y,r}', JSON.stringify(quiz[0].answer), JSON.stringify({ x: 50, y: 50, r: 20 }));

  /* 담당자가 확인 필요 항목을 직접 넣으면 들어간다 */
  inc[1].checked = true;
  inc[1].dispatchEvent(new win.Event('change', { bubbles: true }));
  eq('담당자가 체크하면 확인 필요도 문항이 된다', win.__autogen.draftQuiz().length, 2);
  inc[1].checked = false;
  inc[1].dispatchEvent(new win.Event('change', { bubbles: true }));

  /* 문구 하나 고르고 승인 */
  const firstPhrase = $('ag-phrases').querySelector('input');
  firstPhrase.checked = true;
  firstPhrase.dispatchEvent(new win.Event('change', { bubbles: true }));
  ok('★ 다 채우면 승인 버튼이 켜진다', $('btn-approve').disabled === false, $('ag-check').textContent);
  click(win, $('btn-approve'));
  const courses = S.courses.load();
  const c = courses[courses.length - 1];
  eq('★★ 승인하면 교육 1건이 늘어난다', courses.length, JSON.parse(before).length + 1);
  eq('발급 상태', c.approved, true);
  eq('사진이 함께 들어간다', c.photo, PHOTO);
  eq('문항 1개', c.quiz.length, 1);
  ok('기존 모양 필드가 다 있다', ['id', 'title', 'equipmentId', 'languages', 'phraseIds', 'quiz', 'dueAt', 'createdAt'].every((k) => k in c));
  ok('★ 문구는 검수 완료만', c.phraseIds.every((id) => phraseIds.indexOf(id) !== -1));
  ok('AI 기록(판정 아님)을 남긴다', c.aiDraft && c.aiDraft.items === 2 && c.aiDraft.checks === 1);
  ok('승인 뒤 초안을 비운다', $('sec-approve').hidden === true);

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
