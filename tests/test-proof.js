/* 기능5 교육 증빙 생성 — 실제 DOM 검증 */
const { boot, ok, eq, has, report, SRC } = require('./harness');

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const change = (win, node) => node.dispatchEvent(new win.Event('change', { bubbles: true }));

function open(opts = {}) {
  return boot('admin/proof.html',
    Object.assign({ login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/proof.js' }, opts));
}

/* ★ 문서 구조가 바뀌었다 (C1). 교육 하나가 .proof-course 덩어리 하나이고,
     기간 단위로 묶으면 그 덩어리가 여러 개 들어온다.
     아래 헬퍼는 "몇 번째 교육 덩어리 안에서" 를 뜻한다. */
const blocks = (t) => [...t.win.document.querySelectorAll('#proof-courses .proof-course')];
const block = (t, i) => blocks(t)[i || 0];
const inBlock = (t, sel, i) => block(t, i).querySelector(sel);

/* =================================================================
   1. 교육일지가 실제 기록으로 채워진다
   ================================================================= */
{
  const t = open();
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
  // 기본은 첫 교육 (c-press · 프레스 3호기)
  // ★ 사업장·규모는 표지로, 교육명은 덩어리 제목으로 옮겼다 (C1)
  const cover = text(t.$('proof-cover-rows'));
  has('사업장', cover, '대성정밀');
  has('규모', cover, '10~49인');

  const meta = text(inBlock(t, '.proof-meta tbody'));
  has('교육명', text(inBlock(t, '.proof-course-title')), '프레스 3호기 안전교육');
  has('공정과 설비', meta, '프레스 · 프레스 3호기');
  has('교육 언어', meta, '크메르어 · 인도네시아어 · 베트남어');
  has('실시 기간이 기록에서 나온다', meta, '2026');
  has('대상 인원', meta, '1명');

  has('발급 시각', text(t.$('proof-issued-at')), '발급');
  has('발급자', text(t.$('proof-issued-by')), '김현수');
  eq('교육 실시자 서명란에 이름', text(t.$('sign-admin')), '김현수');

  // 전달한 안전 문구 4개 (ph-1, ph-2, ph-3, ph-6)
  eq('안전 문구 4줄', inBlock(t, '.proof-phrases').children.length, 4);
  has('문구 내용이 그대로', text(inBlock(t, '.proof-phrases')), '프레스가 멈춰도 손을 넣지 마십시오');

  /* ★ ph-3 은 인도네시아어 번역이 중지돼 그 언어 노동자에게는 전달되지 않았다.
       증빙에 그 사실을 적는다 — 무엇이 전달되지 않았는지가 이 문서의 내용이다. */
  has('어느 언어에 전달되지 않았는지 적는다',
    text(inBlock(t, '.proof-phrases')), '인도네시아어 노동자에게는 전달되지 않았습니다');

  // 문항 3개
  eq('문항 3줄', inBlock(t, '.proof-quiz').children.length, 3);
  has('문항 유형도 적는다', text(inBlock(t, '.proof-quiz')), '위험 지점 짚기');

  // 대상자 표
  const rows = inBlock(t, '.proof-rows').querySelectorAll('tr');
  eq('대상자 1명 (프레스 공정)', rows.length, 1);
  has('식별번호', text(rows[0]), 'W-4821-07');
  has('언어', text(rows[0]), '크메르어');
  has('점수', text(rows[0]), '100점');
  has('이수', text(rows[0]), '이수');

  // ★ 면책 표현 금지 / 법적 책임 대신하지 않음 명시
  ok('"면책" 이라고 쓰지 않는다', !text(t.$('proof')).includes('면책'));
  has('법적 책임을 대신하지 않는다고 적는다',
    text(t.$('proof-foot')), '법적 책임을 대신하지 않습니다');
  has('고칠 수 있는 사본을 만들지 않는다고 적는다',
    text(t.$('proof-foot')), '따로 고칠 수 있는 사본을 만들지 않으므로');

  // ★ 서명이 아니라 이해도 검증 결과라는 것
  has('서명이 아니라 검증 결과라고 적는다',
    text(t.$('proof')), '서명이 아니라 이해도 검증 결과');
  has('미이수자도 그대로 적는다고 밝힌다', text(t.$('proof')), '미이수자와 미통과자도 그대로 적습니다');
}

/* =================================================================
   2. ★ 미이수자 · 미통과자를 숨기지 않는다
      도장 공정에 사람을 늘리고 상태를 섞어서 확인한다
   ================================================================= */
{
  const t = open({
    before(win) {
      win.Store.setup.update((s) => {
        s.workers.push({ id: 'W-4821-21', lang: 'id', processId: 'p-paint' });
        s.workers.push({ id: 'W-4821-22', lang: 'id', processId: 'p-paint' });
      });
      // W-4821-21 은 들었지만 검증 안 함 / W-4821-22 는 아무것도 안 함
      win.Store.progress.update((list) => {
        list.push({ workerId: 'W-4821-21', courseId: 'c-paint', lang: 'id',
          learnedAt: '2026-08-18T01:00:00.000Z', quiz: null });
      });
    },
  });

  t.$('pick-course').value = 'c-paint';
  change(t.win, t.$('pick-course'));

  const rows = [...inBlock(t, '.proof-rows').querySelectorAll('tr')];
  eq('★ 대상자 3명 전원이 표에 있다', rows.length, 3);

  const idOf = (r) => text(r.querySelector('td'));
  const byId = {};
  rows.forEach((r) => { byId[idOf(r)] = text(r); });

  has('미통과자가 표에 남는다', byId['W-4821-11'], '미통과');
  has('점수도 그대로', byId['W-4821-11'], '50점');
  has('검증 미실시도 표에 남는다', byId['W-4821-21'], '검증 미실시');
  has('미수강도 표에 남는다', byId['W-4821-22'], '미수강');

  // 순서가 결과로 바뀌지 않는다 — 정렬만 바꿔도 밀어내는 통로가 된다
  const order = rows.map(idOf);
  eq('★ 등록 순서 그대로 (결과순 정렬 없음)',
    order.join(','), 'W-4821-11,W-4821-21,W-4821-22');

  // 숨기는 조작이 화면에 아예 없다
  const html = t.win.document.getElementById('proof').outerHTML +
    t.win.document.querySelector('.card').outerHTML;
  ok('★ 걸러 보기·숨기기 조작이 없다',
    !/미이수.*숨기|숨기기|제외하고|이수자만/.test(html), '숨기는 경로가 있습니다');

  // 요약 타일
  const tiles = [...t.$('summary').querySelectorAll('.kpi')].map(
    (k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd')));
  has('대상 3명', tiles.join(' '), '대상=3명');
  has('이수 0명', tiles.join(' '), '이수=0명');
  has('미통과 1명', tiles.join(' '), '미통과=1명');
  has('미수강 2명', tiles.join(' '), '미수강=2명');
}

/* =================================================================
   3. 최초 통과율 — 다시 풀어 통과한 것은 세지 않는다
   ================================================================= */
{
  const t = open({
    before(win) {
      // W-4821-07 이 두 번째 시도에 통과한 상황
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
        r.quiz = { score: 100, passed: true, answers: [1, 1, 1], at: '2026-08-20T00:00:00.000Z',
          attempt: 2, firstPassed: false };
      });
    },
  });

  const tiles = [...t.$('summary').querySelectorAll('.kpi')].map(
    (k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd')));
  has('이수는 1명', tiles.join(' '), '이수=1명');
  has('★ 최초 통과율은 0%', tiles.join(' '), '최초 통과율=0%');

  const row = inBlock(t, '.proof-rows').querySelectorAll('tr')[0];
  has('몇 회차인지 표에 적는다', text(row), '2회차');
}

/* =================================================================
   4. 통과율 100% 는 지표 실패로 표시한다
   ================================================================= */
{
  const t = open();
  const rateTile = [...t.$('summary').querySelectorAll('.kpi')]
    .find((k) => text(k.querySelector('dt')) === '최초 통과율');
  eq('예시 데이터는 100%', text(rateTile.querySelector('dd')), '100%');
  has('★ 100% 는 문항이 쉬운 것이라고 적는다',
    text(rateTile), '100% 는 문항이 쉬운 것입니다');
  ok('경고 모양이 된다', rateTile.className.includes('alert'));
}

/* =================================================================
   5. 교육 이후 중지된 문구가 있으면 증빙에 그 사실이 남는다
   ================================================================= */
{
  const t = open({
    before(win) {
      win.Store.library.update((list) => {
        list.find((p) => p.id === 'ph-1').status = 'stopped';
      });
    },
  });
  has('★ 이후 중지됐다는 사실을 적는다',
    text(inBlock(t, '.proof-phrases')), '교육 이후 사용 중지된 문구입니다');
}

/* =================================================================
   6. 문항이 없는 교육은 이수로 기록되지 않는다고 적는다
   ================================================================= */
{
  const t = open({
    before(win) {
      win.Store.courses.update((list) => { list[0].quiz = []; });
    },
  });
  has('문항이 없으면 이수가 아니라고 적는다',
    text(inBlock(t, '.proof-quiz')), '문항이 없는 교육은 이수로 기록되지 않습니다');
}

/* =================================================================
   7. 교육이 없으면 무엇을 해야 하는지 말한다
   ================================================================= */
{
  const t = open({ before(win) { win.Store.courses.save([]); } });
  eq('일지를 숨긴다', t.$('proof').hidden, true);
  eq('인쇄 버튼이 잠긴다', t.$('btn-print').disabled, true);
  has('어디로 가야 하는지', text(t.$('summary')), '교육 콘텐츠 생성(기능2)에서 교육을 먼저 만들어');
}

/* =================================================================
   8. 인쇄는 window.print() 로만 — 외부 라이브러리 없음
   ================================================================= */
{
  const t = open();
  let printed = 0;
  t.win.print = () => { printed++; };
  click(t.win, t.$('btn-print'));
  eq('브라우저 인쇄를 부른다', printed, 1);
}

/* =================================================================
   9. 쓰는 키가 없다 — 고칠 사본을 만들지 않는다
   ================================================================= */
{
  const t = open();
  const before = JSON.stringify(t.win.Store.progress.load());
  click(t.win, t.$('pick-course'));
  change(t.win, t.$('pick-course'));
  t.win.print = () => {};
  click(t.win, t.$('btn-print'));
  eq('★ 증빙을 만들어도 기록이 바뀌지 않는다',
    JSON.stringify(t.win.Store.progress.load()), before);

  const fs = require('fs');
  const js = fs.readFileSync(SRC + '/admin/proof.js', 'utf8');
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('★ 어떤 저장소에도 쓰지 않는다',
    !/\.(save|update)\s*\(/.test(code), '쓰기 호출이 있습니다');
}

/* =================================================================
   10. 인쇄 CSS 와 규칙
   ================================================================= */
{
  const fs = require('fs');
  const base = SRC + '/admin/';
  const html = fs.readFileSync(base + 'proof.html', 'utf8');
  const js = fs.readFileSync(base + 'proof.js', 'utf8');
  const css = fs.readFileSync(base + 'admin.css', 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

  ok('외부 주소 없음', !/(src|href)\s*=\s*["']https?:/i.test(html));
  ok('innerHTML 안 씀', !/innerHTML/.test(strip(js)));
  ok('localStorage 직접 호출 안 함', !/localStorage/.test(strip(js)));
  // 주석은 규칙을 적어 둔 곳이라 위반이 아니다. 화면에 나가는 것만 본다.
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');
  ok('"면책" 표현 없음', !/면책/.test(visible + strip(js)));
  ok('껍데기 안내 없음', !/아직 만들지 않은 화면/.test(html));

  has('@media print 가 있다', css, '@media print');
  has('화면 조작은 인쇄되지 않는다', css, '.noprint');
  has('표 머리가 페이지마다 반복된다', css, 'table-header-group');
  has('배지가 흑백에서도 뜻이 남는다', css, 'border-color: #666 !important');
}

/* =================================================================
   N. 문항이 어느 언어로 제공됐는지 증빙에 남는다

   이 서식이 서명과 다른 이유는 "번역된 문항으로 이해를 확인했다" 는 것이다.
   그리고 한국어로만 제공된 문항을 숨기지 않는다 —
   숨길 수 있는 증빙은 증빙이 아니다.
   ================================================================= */
{
  const t = open();
  const quiz = inBlock(t, '.proof-quiz');
  const lines = [...quiz.querySelectorAll('li')];

  eq('c-press 문항 3개', lines.length, 3);

  // 문항 문구는 한국어 — 감독기관에 내는 한국어 문서다
  has('문항 문구는 한국어로 적는다', text(lines[0]), '손이 끼일 수 있는 곳');

  // q1, q2 는 크메르어·인도네시아어 번역이 있다
  has('제공 언어를 적는다', text(lines[0]), '제공 언어');
  has('한국어를 먼저 적는다', text(lines[0]), '한국어');
  has('크메르어로도 제공됐다고 적는다', text(lines[0]), '크메르어');

  /* ★ q3 은 번역이 없다. 그 사실이 그대로 적혀야 한다. */
  has('★ 번역이 없는 문항은 그 사실을 적는다', text(lines[2]), '한국어로 제공');
  has('어느 언어가 빠졌는지 적는다', text(lines[2]), '크메르어');

  // 숨기는 통로가 없는지
  const html = quiz.outerHTML;
  ok('★ 문항을 걸러 보는 조작이 없다', !/hidden|display:\s*none/.test(html), html.slice(0, 120));
}

/* --- 인쇄에서도 옅게 만들지 않는다 --- */
{
  const fs = require('fs');
  const css = fs.readFileSync(SRC + '/admin/admin.css', 'utf8');
  const printBlock = css.slice(css.indexOf('@media print'));

  ok('제공 언어 줄이 인쇄에서 검게 나온다', /\.proof-qlang\s*\{\s*color:\s*#000/.test(printBlock));
  ok('제공 언어 줄을 인쇄에서 감추지 않는다', !/\.proof-qlang[^{]*\{[^}]*display:\s*none/.test(printBlock));
}


/* =================================================================
   기능5 — 기간별 증빙 묶음 (C1)

   ★ 여기서 지켜야 하는 것은 "묶이는가" 가 아니라
     "묶어도 사람이 빠지지 않는가" 다.
   ================================================================= */

/* 검사가 해가 바뀌어도 안 깨지게 날짜를 지금 기준으로 만든다 */
function qISO(offsetQuarters) {
  const n = new Date();
  const q = Math.floor(n.getMonth() / 3) + (offsetQuarters || 0);
  return new Date(n.getFullYear(), q * 3, 1, 12).toISOString();
}
function yISO(offsetYears) {
  const n = new Date();
  return new Date(n.getFullYear() + (offsetYears || 0), 5, 1, 12).toISOString();
}

/* 두 교육을 같은 분기에 놓는다 */
function sameQuarter(win) {
  win.Store.courses.update((list) => {
    list.forEach((c) => { c.createdAt = qISO(0); });
  });
}

{
  /* --- 기본은 교육 하나. 지금까지 하던 대로다 --- */
  const t = open();
  eq('★ 기본은 교육 하나다', t.$('pick-scope').value, 'course');
  eq('교육 고르는 칸이 보인다', t.$('field-course').hidden, false);
  eq('기간 고르는 칸은 숨어 있다', t.$('field-period').hidden, true);
  eq('교육 덩어리가 하나', blocks(t).length, 1);
  has('표지에 담은 범위를 적는다', text(t.$('proof-cover-rows')), '교육 1건');
}

{
  /* --- 분기로 묶으면 그 분기 교육이 다 들어온다 --- */
  const t = open({ before: sameQuarter });

  t.$('pick-scope').value = 'quarter';
  change(t.win, t.$('pick-scope'));

  eq('기간 고르는 칸이 나온다', t.$('field-period').hidden, false);
  eq('교육 고르는 칸은 숨는다', t.$('field-course').hidden, true);

  eq('★ 그 분기 교육이 한 문서에 다 들어온다', blocks(t).length, 2);
  const all = text(t.$('proof-courses'));
  has('첫 교육이 있다', all, '프레스 3호기 안전교육');
  has('둘째 교육도 있다', all, '도장 부스 1 안전교육');

  has('★ 표지에 담은 범위를 적는다', text(t.$('proof-cover-rows')), '분기');
  has('담은 교육 건수도 적는다', text(t.$('proof-cover-rows')), '2건');

  /* 교육마다 문구·문항·대상자 표가 따로 있다 */
  eq('교육마다 안전 문구 목록이 있다',
    t.win.document.querySelectorAll('#proof-courses .proof-phrases').length, 2);
  eq('교육마다 문항 목록이 있다',
    t.win.document.querySelectorAll('#proof-courses .proof-quiz').length, 2);
  eq('교육마다 대상자 표가 있다',
    t.win.document.querySelectorAll('#proof-courses .proof-rows').length, 2);

  /* 서명란과 꼬리말은 문서에 하나뿐이다 */
  eq('서명란은 하나', t.win.document.querySelectorAll('.proof-sign').length, 1);
  has('법적 책임을 대신하지 않는다', text(t.$('proof-foot')), '법적 책임을 대신하지 않습니다');
  ok('★ "면책" 이라고 쓰지 않는다', !text(t.$('proof')).includes('면책'));
}

{
  /* ★ 묶어도 사람을 빼지 않는다.
       이 화면의 전제다 — 미수강·미통과가 그대로 남아야 한다. */
  const t = open({
    before(win) {
      sameQuarter(win);
      win.Store.progress.save([]);      // 아무도 수강하지 않은 상태
    },
  });

  t.$('pick-scope').value = 'quarter';
  change(t.win, t.$('pick-scope'));

  const tiles = [...t.$('summary').querySelectorAll('.kpi')]
    .map((k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd'))).join(' ');
  ok('★ 대상자가 그대로 잡힌다', /대상=[1-9]/.test(tiles), tiles);
  ok('★ 미수강이 그대로 잡힌다', /미수강=[1-9]/.test(tiles), tiles);
  ok('★ 이수는 0 이다 (묶어서 100% 가 되지 않는다)', /이수=0/.test(tiles), tiles);

  const rows = [...t.win.document.querySelectorAll('#proof-courses .proof-rows tr')];
  ok('표에도 사람이 그대로 남는다', rows.length >= 2, String(rows.length));
  has('미수강이라고 적는다', text(t.$('proof-courses')), '미수강');
}

{
  /* ★ 무엇이 이 문서에 없는지 적는다.
       범위를 골라 뽑을 수 있게 된 이상, 받는 쪽이 "이게 전부가 아니다" 를
       알 수 있어야 한다. */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c, i) => { c.createdAt = i === 0 ? qISO(0) : yISO(-1); });
      });
    },
  });

  t.$('pick-scope').value = 'quarter';
  change(t.win, t.$('pick-scope'));

  eq('이 분기 교육만 들어온다', blocks(t).length, 1);
  has('★ 빠진 것이 있다고 적는다', text(t.$('proof-scope')), '이 문서에 없습니다');
  has('몇 건이 빠졌는지 적는다', text(t.$('proof-scope')), '1건');
}

{
  /* 발급일이 없는 교육은 어느 기간에도 넣을 수 없다 — 그 사실을 적는다 */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c, i) => { if (i === 0) c.createdAt = qISO(0); else delete c.createdAt; });
      });
    },
  });

  t.$('pick-scope').value = 'quarter';
  change(t.win, t.$('pick-scope'));
  has('★ 날짜 없는 교육이 빠졌다고 적는다', text(t.$('proof-scope')), '발급일이 없는 교육');
}

{
  /* 연도로도 묶인다 */
  const t = open({ before: sameQuarter });
  t.$('pick-scope').value = 'year';
  change(t.win, t.$('pick-scope'));
  eq('★ 연도로 묶으면 그 해 교육이 다 들어온다', blocks(t).length, 2);
  has('표지에 연도를 적는다', text(t.$('proof-cover-rows')), '년');
}

{
  /* 그 기간에 교육이 없으면 빈 문서를 만들지 않는다 */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c) => { c.createdAt = yISO(-1); });
      });
    },
  });

  t.$('pick-scope').value = 'quarter';
  change(t.win, t.$('pick-scope'));

  /* 고를 수 있는 기간은 실제로 교육이 있는 기간뿐이다 —
     없는 기간을 고를 수 있으면 빈 문서가 나온다 */
  const periods = [...t.$('pick-period').options].map((o) => o.value);
  ok('★ 교육이 있는 기간만 고를 수 있다', periods.length > 0, JSON.stringify(periods));
  ok('작년 분기가 후보에 있다', periods.some((p) => p.includes('-Q')), JSON.stringify(periods));
  eq('그 기간을 고르면 교육이 들어온다', blocks(t).length, 2);
}
report('기능5 교육 증빙 생성');
