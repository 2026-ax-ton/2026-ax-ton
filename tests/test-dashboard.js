/* 기능6 담당자 대시보드 — 실제 DOM 검증 */
const { boot, ok, eq, has, report, SRC } = require('./harness');

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

function open(opts = {}) {
  return boot('admin/dashboard.html',
    Object.assign({ login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/dashboard.js' }, opts));
}

/* =================================================================
   1. 화면에 반드시 있어야 하는 문장 세 개 (SCREEN 기능6)
   ================================================================= */
{
  const t = open();
  const doc = t.win.document;
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  const all = text(doc.querySelector('main'));
  has('① 노동자 평가가 아니라 콘텐츠 개선 신호', all, '노동자 평가가 아니라');
  has('①-2', all, '콘텐츠 개선 신호');
  has('② 미통과는 교육의 실패', all, '미통과는 노동자의 실패가 아니라 교육의 실패로 기록됩니다');
  has('③ 인사·평가 목적 내보내기 없음', all, '개인별 점수의 인사·평가 목적 내보내기는 제공하지 않습니다');
  has('AI 개입 없음 고지', text(doc.querySelector('.ai-note')), 'AI 개입 없음');
  has('추정하거나 보정하지 않는다', text(doc.querySelector('.ai-note')), '추정하거나 보정하지 않습니다');
}

/* =================================================================
   2. ★ 정보 위계 — 취약 항목이 이수율보다 크다
   ================================================================= */
{
  const t = open();
  const doc = t.win.document;

  const statusCard = t.$('status-tiles').closest('.card');
  const weakCard = t.$('weak-bars').closest('.card');

  ok('이수 현황 타일은 작은 모양', t.$('status-tiles').className.includes('small'));
  ok('★ 취약 항목이 강조 블록', weakCard.className.includes('feature'));
  ok('이수 현황은 강조 블록이 아니다', !statusCard.className.includes('feature'));

  // 문서상 순서: 0 고지 → 1 이수 현황 → 2 취약 항목
  const cards = [...doc.querySelectorAll('main .card')];
  ok('이수 현황이 취약 항목보다 위에 있다',
    cards.indexOf(statusCard) < cards.indexOf(weakCard));
}

/* =================================================================
   3. ★ 언어 × 위험유형 정답률 — 이 화면의 핵심
      예시 데이터:
        W-4821-07 km c-press [1,1,1]  → q1 pinch, q2 pinch, q3 shock
        W-4821-11 id c-paint [0,1]    → q1 fire(오답), q2 chemical(정답)
   ================================================================= */
{
  const t = open();
  const bars = [...t.$('weak-bars').querySelectorAll('.bar-item')];
  eq('막대 4줄 (km-끼임, km-감전, id-화재, id-화학물질)', bars.length, 4);

  const byLabel = {};
  bars.forEach((b) => { byLabel[text(b.querySelector('.what'))] = b; });
  const labels = Object.keys(byLabel);

  ok('인도네시아어 화재가 있다', labels.some((l) => l.includes('인도네시아어 · 화재')),
    JSON.stringify(labels));
  ok('크메르어 끼임이 있다', labels.some((l) => l.includes('크메르어 · 끼임')),
    JSON.stringify(labels));

  // ★ 낮은 것이 맨 위
  const first = bars[0];
  has('가장 낮은 항목이 맨 위 — 인도네시아어 화재', text(first.querySelector('.what')), '화재');
  has('0%', text(first.querySelector('.num')), '0%');
  eq('낮음 등급', first.getAttribute('data-level'), 'low');
  has('★ 색만이 아니라 등급 글자도 준다', text(first.querySelector('.num')), '낮음');
  eq('막대 길이가 0%', first.querySelector('.bar-fill').style.width, '0%');
  has('몇 문항 중 몇 개인지', text(first.querySelector('.what')), '0/1문항');

  // 100% 항목
  const good = bars[bars.length - 1];
  eq('양호 등급', good.getAttribute('data-level'), 'ok');
  has('양호 글자', text(good.querySelector('.num')), '양호');

  // 무엇부터 하면 되는지 말해 준다
  has('가장 낮은 항목을 지목한다', text(t.$('weak-hint')), '인도네시아어');
  has('무엇을 하라고 말한다', text(t.$('weak-hint')), '설명을 다시 만드는 것부터');
}

/* =================================================================
   4. 이수 현황 숫자와 최초 통과율
      대상: c-press → 프레스 공정 1명 / c-paint → 도장 공정 1명
   ================================================================= */
{
  const t = open();
  const tiles = {};
  [...t.$('status-tiles').querySelectorAll('.kpi')].forEach((k) => {
    tiles[text(k.querySelector('dt'))] = text(k);
  });

  has('이수 1건', tiles['이수'], '1건');
  has('미통과 1건', tiles['미통과'], '1건');
  has('최초 통과율 50%', tiles['최초 통과율'], '50%');
  has('목표 범위를 적는다', tiles['최초 통과율'], '70~85%');
}

/* =================================================================
   5. 최초 통과율이 100% 면 지표 실패로 표시
   ================================================================= */
{
  const t = open({
    before(win) {
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-11');
        r.quiz = { score: 100, passed: true, answers: [1, 1], at: '2026-08-20T00:00:00.000Z',
          attempt: 1, firstPassed: true };
      });
    },
  });
  const rate = [...t.$('status-tiles').querySelectorAll('.kpi')]
    .find((k) => text(k.querySelector('dt')) === '최초 통과율');
  has('100%', text(rate.querySelector('dd')), '100%');
  has('★ 문항이 쉬운 것이라고 말한다', text(rate), '100% 는 문항이 쉬운 것입니다');
  ok('경고 모양', rate.className.includes('alert'));
}

/* =================================================================
   6. 조치가 필요한 사람 — 막힌 항목까지 이름을 댄다
   ================================================================= */
{
  const t = open();
  const rows = [...t.$('action-rows').querySelectorAll('tr')];
  eq('조치 대상 1명 (미통과)', rows.length, 1);
  has('식별번호', text(rows[0]), 'W-4821-11');
  has('언어', text(rows[0]), '인도네시아어');
  has('교육', text(rows[0]), '도장 부스 1 안전교육');
  has('미통과 상태', text(rows[0]), '미통과');
  has('★ 어느 항목에서 막혔는지', text(rows[0]), '화재');
}

/* =================================================================
   7. ★ 위험요소 신고 — 익명이 지켜지는지
   ================================================================= */
{
  const t = open();
  const items = [...t.$('report-queue').querySelectorAll('.queue-item')];
  eq('신고 2건', items.length, 2);

  // 긴급이 위로
  eq('긴급 건이 맨 위', items[0].getAttribute('data-urgent'), 'yes');
  has('위험유형과 설비', text(items[0]), '끼임 — 프레스 3호기');
  has('신고 내용', text(items[0]), '덮개가 흔들려서');
  has('★ 익명이라고 적는다', text(items[0]), '익명 신고');

  // ★ 신고자를 식별할 값이 화면에 없어야 한다
  const queueText = text(t.$('report-queue'));
  ok('★ 노동자 식별번호가 신고 큐에 나오지 않는다',
    !/W-\d{4}-\d{2}/.test(queueText), queueText.slice(0, 200));
  has('익명성이 깨지면 어떻게 되는지 적는다',
    text(t.$('report-queue').closest('.card')), '익명성이 깨지면 신고가 멈추고');

  /* --- 조치 상태 바꾸기 --- */
  const resolveBtn = [...items[0].querySelectorAll('.btn-sm')]
    .find((b) => text(b) === '조치 완료');
  click(t.win, resolveBtn);

  const r1 = t.win.Store.reports.load().find((r) => r.id === 'r-1');
  eq('상태가 바뀐다', r1.status, 'resolved');
  ok('★ 신고자를 식별할 값이 새로 들어가지 않는다',
    !('workerId' in r1) && !('author' in r1) && !('userId' in r1) && !('by' in r1),
    JSON.stringify(Object.keys(r1)));

  has('화면에도 조치 완료로 보인다', text(t.$('report-queue')), '조치 완료');
}

/* =================================================================
   8. 교육별 실시 상황 · 기한
   ================================================================= */
{
  const t = open();
  const items = [...t.$('due-list').querySelectorAll('.item')];
  eq('교육 2개', items.length, 2);
  has('이수 현황', text(items[0]), '이수 1 / 1명');
  has('마지막 실시일', text(items[0]), '마지막 실시');
  /* 예시 데이터에서 기한을 가진 것은 c-press 하나뿐이다 —
     기한이 선택이라는 것이 대시보드 한 화면에서 보여야 한다.
     "D-" 를 기대하지 않는다: 예시 날짜가 지나면 "지남" 이 되고 그것도 맞는 표시다. */
  ok('기한이 있으면 미정이 아니다',
    text(items[0]).indexOf('기한 미정') === -1, text(items[0]));
  has('기한이 없으면 미정', text(items[1]), '기한 미정');

  // courses 에 dueAt 이 들어오면 D-day 를 쓴다
  const t2 = open({
    before(win) {
      const soon = new Date(Date.now() + 5 * 86400000).toISOString();
      const past = new Date(Date.now() - 3 * 86400000).toISOString();
      win.Store.courses.update((list) => { list[0].dueAt = soon; list[1].dueAt = past; });
    },
  });
  const items2 = [...t2.$('due-list').querySelectorAll('.item')];
  has('임박한 기한은 D-day', text(items2[0]), 'D-5');
  has('지난 기한은 그렇게 표시', text(items2[1]), '지남');
}

/* =================================================================
   9. 기록이 없을 때 무엇을 하면 되는지 말한다
   ================================================================= */
{
  const t = open({ before(win) { win.Store.progress.save([]); } });
  has('검증 기록이 없다고 말한다', text(t.$('weak-bars')), '아직 이해도 검증 기록이 없습니다');
  has('언제 나오는지 알려 준다', text(t.$('weak-bars')), '검증을 마치면');

  const t2 = open({ before(win) { win.Store.reports.save([]); } });
  has('신고가 없으면', text(t2.$('report-queue')), '접수된 위험요소 신고가 없습니다');

  const t3 = open({ before(win) { win.Store.courses.save([]); } });
  has('교육이 없으면 어디로 가는지', text(t3.$('due-list')), '교육 콘텐츠 생성에서 먼저 만들어');
}

/* =================================================================
   10. 규칙 검사
   ================================================================= */
{
  const fs = require('fs');
  const base = SRC + '/admin/';
  const html = fs.readFileSync(base + 'dashboard.html', 'utf8');
  const js = fs.readFileSync(base + 'dashboard.js', 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const visible = html.replace(/<!--[\s\S]*?-->/g, '');

  ok('외부 주소 없음', !/(src|href)\s*=\s*["']https?:/i.test(html));
  ok('절대경로 없음', !/(src|href)\s*=\s*["']\//.test(html));
  ok('innerHTML 안 씀', !/innerHTML/.test(strip(js)));
  ok('localStorage 직접 호출 안 함', !/localStorage/.test(strip(js)));
  ok('"면책" 표현 없음', !/면책/.test(visible + strip(js)));
  ok('껍데기 안내 없음', !/아직 만들지 않은 화면/.test(html));

  // ★ reports 에 쓸 때 status 외의 것을 넣지 않는지
  ok('★ 신고에 조치 상태만 쓴다',
    /if \(r\) r\.status = status;/.test(js), '신고 쓰기가 status 외의 것을 건드립니다');
}


/* =================================================================
   기능6 대시보드 — 기간 걸러 보기 (C2)

   ★ 날짜를 "지금" 기준으로 만든다. 예시 데이터의 2026-08 을 그대로 쓰면
     해가 바뀌는 순간 검사가 깨진다 — 일을 안 해도 깨지는 검사가 된다.
   ================================================================= */

/* 이번 분기 안의 날짜 / 작년 날짜를 만든다 */
function thisQuarterISO() {
  const n = new Date();
  return new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1, 12).toISOString();
}
function lastYearISO() {
  const n = new Date();
  return new Date(n.getFullYear() - 1, 5, 1, 12).toISOString();
}

{
  /* c-press 는 이번 분기, c-paint 는 작년으로 옮긴다 */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c) => {
          if (c.id === 'c-press') c.createdAt = thisQuarterISO();
          if (c.id === 'c-paint') c.createdAt = lastYearISO();
        });
      });
    },
  });
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  const tiles = () => [...t.$('status-tiles').querySelectorAll('.kpi')]
    .map((k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd'))).join(' ');

  /* --- 기본은 전체다 — 숨기지 않는 쪽 --- */
  eq('★ 처음에는 전체를 본다', t.$('range-all').getAttribute('aria-pressed'), 'true');
  has('전부 본다고 적는다', text(t.$('range-note')), '전부를 봅니다');
  const allTiles = tiles();

  /* --- 이번 분기 --- */
  click(t.win, t.$('range-quarter'));
  eq('고른 것이 눌린 상태로 보인다', t.$('range-quarter').getAttribute('aria-pressed'), 'true');
  eq('전체는 눌리지 않은 상태', t.$('range-all').getAttribute('aria-pressed'), 'false');

  const qTiles = tiles();
  ok('★ 범위를 바꾸면 타일이 함께 바뀐다', qTiles !== allTiles, allTiles + '  vs  ' + qTiles);

  /* ★ 조용히 줄이지 않는다 */
  has('★ 무엇이 빠졌는지 적는다', text(t.$('range-note')), '빠져 있습니다');
  has('빠진 건수를 적는다', text(t.$('range-note')), '1건');

  /* --- 올해 --- */
  click(t.win, t.$('range-year'));
  has('올해도 작년 것은 빠진다', text(t.$('range-note')), '빠져 있습니다');

  /* --- 전체로 돌아오면 원래대로 --- */
  click(t.win, t.$('range-all'));
  eq('★ 전체로 돌아오면 원래 숫자다', tiles(), allTiles);

  /* ★ 요구사항은 "타일과 정답률 막대가 함께 바뀐다" 다.
       타일만 보고 넘어가면 막대가 옛 범위에 머물러 있어도 모른다 —
       담당자는 지난 분기 취약 항목을 이번 분기 것으로 읽게 된다. */
  const bars = () => [...t.$('weak-bars').querySelectorAll('.bar-item')]
    .map((b) => text(b));

  click(t.win, t.$('range-all'));
  const allBars = bars();
  ok('전체에서는 두 교육의 항목이 다 나온다', allBars.length >= 3, JSON.stringify(allBars));
  ok('작년 교육(도장·인도네시아어) 항목이 보인다',
    allBars.join(' ').includes('인도네시아어'), JSON.stringify(allBars));

  click(t.win, t.$('range-quarter'));
  const qBars = bars();
  ok('★ 범위를 바꾸면 막대도 함께 바뀐다',
    qBars.length < allBars.length, JSON.stringify(allBars) + ' → ' + JSON.stringify(qBars));
  ok('★ 범위 밖 교육의 항목은 막대에서 빠진다',
    !qBars.join(' ').includes('인도네시아어'), JSON.stringify(qBars));
}

{
  /* ★ 미수강자가 사라지면 안 된다.
       발급일이 아니라 "수강한 날" 로 걸렀으면 아무것도 안 한 사람은
       날짜가 없어서 통째로 빠지고, 이수율이 저절로 올라간다. */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c) => { c.createdAt = thisQuarterISO(); });
      });
      // 기록을 전부 지운다 — 아무도 수강하지 않은 상태
      win.Store.progress.save([]);
    },
  });

  click(t.win, t.$('range-quarter'));
  const tiles = [...t.$('status-tiles').querySelectorAll('.kpi')]
    .map((k) => text(k.querySelector('dt')) + '=' + text(k.querySelector('dd'))).join(' ');
  ok('★ 아무도 수강 안 해도 미수강자가 그대로 잡힌다', /미수강=[1-9]/.test(tiles), tiles);
  ok('★ 이수는 0 이다 (숨겨서 100% 가 되지 않는다)', /이수=0/.test(tiles), tiles);
}

{
  /* 날짜가 없는 교육은 숨기지 않는다 —
     기록이 부실할수록 화면이 깨끗해지면 안 된다 */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c) => { delete c.createdAt; });
      });
    },
  });
  click(t.win, t.$('range-quarter'));
  has('★ 날짜 없는 교육도 그대로 본다', text(t.$('range-note')), '전부를 봅니다');
}

{
  /* ★ 위험요소 신고는 기간을 따르지 않는다.
       조치가 안 끝난 신고는 언제 들어온 것이든 계속 보여야 한다.
       지난 분기 긴급 신고가 범위 밖이라고 사라지면 그게 사고다.

     ★ 예시 신고는 마침 이번 분기 안에 있다. 그대로 두면 걸러도 티가 안 나서
       검사가 아무것도 지키지 못한다 — 하나를 작년으로 옮겨 둔다. */
  const t = open({
    before(win) {
      win.Store.courses.update((list) => {
        list.forEach((c) => { c.createdAt = lastYearISO(); });
      });
      win.Store.reports.update((list) => {
        if (list[0]) {
          list[0].createdAt = lastYearISO();
          list[0].status = 'urgent';       // 오래됐고 아직 긴급인 신고
        }
      });
    },
  });

  const before = text(t.$('report-queue'));
  ok('작년 긴급 신고가 목록에 있다', before.includes('긴급'), before.slice(0, 120));

  click(t.win, t.$('range-quarter'));
  eq('★ 기간을 좁혀도 신고 목록은 그대로다', text(t.$('report-queue')), before);
  ok('★ 작년 긴급 신고가 사라지지 않는다',
    text(t.$('report-queue')).includes('긴급'), text(t.$('report-queue')).slice(0, 120));
}
/* =================================================================
   현장 소통 게시판으로 가는 길 (C7)

   ★ 답글을 달 수 있게 만들어도 들어갈 길이 없으면 없는 기능이다.
     담당자에게 "주소를 직접 치세요" 라고 할 수는 없다.
   ================================================================= */
{
  const t = open();
  const links = [...t.win.document.querySelectorAll('a')]
    .map((a) => a.getAttribute('href'));
  ok('★ 게시판으로 가는 링크가 있다',
    links.includes('../worker/talk.html'), links.join(', '));

  const card = [...t.win.document.querySelectorAll('.card')]
    .find((c) => c.querySelector('a[href="../worker/talk.html"]'));
  has('★ 답글이 공식 답변이 된다고 미리 알린다', text(card), '공식 답변');
  has('★ 이름을 감출 수 없다고 알린다', text(card), '이름을 감출 수 없습니다');
}

/* =================================================================
   목업에서 옮겨 온 것 (B4)
   ================================================================= */
{
  const t = open();
  const main = text(t.win.document.querySelector('main'));

  /* ★ 증빙이 왜 믿을 만한지 — 고칠 경로가 없고, 뺄 사람이 없다 */
  has('★ 생성된 기록은 수정할 수 없다고 적는다', main, '생성된 기록은 수정할 수 없고');
  has('★ 숨기는 경로가 없다고 적는다', main, '숨기는 경로는 없습니다');

  /* ★ 개선 루프를 화면에서 닫는다 — 보고 끝내면 교육이 안 고쳐진다 */
  const weak = t.win.document.querySelector('.card.feature');
  const fix = weak.querySelector('a[href="content.html"]');
  ok('★ 취약 항목에서 교육을 고치러 갈 길이 있다', !!fix,
    text(weak).slice(0, 120));
  has('무엇을 하러 가는지 적는다', text(fix), '다시 만들기');
}

/* =================================================================
   재교육 지시 (D2)

   ★ 지켜야 하는 것
     ① 해소 여부를 orders 에 저장하지 않는다 (진실이 두 곳이 되면 어긋난다)
     ② 지시 횟수를 세거나 사람을 줄 세우지 않는다 (인사 평가 자료가 된다)
     ③ 거둔 지시를 지우지 않는다 (냈다가 거둔 사실이 사라진다)
   ================================================================= */

/* 조치 대상 표에서 그 사람의 행을 찾는다 */
function actionRow(t, workerId) {
  return [...t.$('action-rows').querySelectorAll('tr')]
    .find((tr) => text(tr).includes(workerId));
}

const btnIn = (row, label) =>
  [...row.querySelectorAll('button')].find((b) => text(b).includes(label));

{
  const t = open({ before(win) { win.Store.orders.save([]); } });

  const row = actionRow(t, 'W-4821-11');      // 미통과인 사람
  ok('조치 대상에 그 사람이 있다', !!row);
  ok('★ 행에서 바로 재교육을 지시할 수 있다', !!btnIn(row, '재교육 지시'), text(row));

  /* 표 안에 입력칸을 넣지 않는다 — 좁은 화면에서 표가 무너진다 */
  eq('처음에는 입력칸이 닫혀 있다', t.$('order-form').hidden, true);

  click(t.win, btnIn(row, '재교육 지시'));
  eq('누르면 입력칸이 열린다', t.$('order-form').hidden, false);
  has('누구에게 보내는지 적힌다', text(t.$('order-who')), 'W-4821-11');
  ok('무엇 때문인지 적힌다', text(t.$('order-why')).length > 0);

  /* 빈 채로 보내지 않는다 — 무엇을 다시 들으라는 것인지 없으면 지시가 아니다 */
  click(t.win, t.$('order-send'));
  eq('★ 한 줄도 안 적으면 안 보내진다', t.win.Store.orders.load().length, 0);
  has('왜 안 되는지 알려 준다', text(t.$('toast')), '한 줄 적어');

  t.$('order-note').value = '환기팬이 멈췄을 때 부분을 다시 들어 주세요';
  click(t.win, t.$('order-send'));

  const orders = t.win.Store.orders.load();
  eq('지시가 저장된다', orders.length, 1);
  eq('누구에게', orders[0].workerId, 'W-4821-11');
  eq('어느 교육', orders[0].courseId, 'c-paint');
  has('남긴 말', orders[0].note, '환기팬');
  eq('누가 냈는지 남는다', orders[0].by, 'kim@daesung.co.kr');
  eq('거둔 적 없음', orders[0].canceledAt, null);

  /* ★ 해소 여부를 여기 적지 않는다 — progress 를 보고 판정한다 */
  ok('★ orders 에 완료/해소 필드를 만들지 않는다',
    !('done' in orders[0]) && !('resolved' in orders[0]) && !('closedAt' in orders[0]),
    JSON.stringify(orders[0]));

  eq('보내고 나면 입력칸이 닫힌다', t.$('order-form').hidden, true);
  has('보냈다고 알린다', text(t.$('toast')), '보냈습니다');

  /* 표에 상태가 뜨고, 거둘 수 있다 */
  const after = actionRow(t, 'W-4821-11');
  has('★ 지시했다는 것이 표에 남는다', text(after), '지시함');
  ok('다시 지시 버튼을 또 주지 않는다', !btnIn(after, '재교육 지시'), text(after));
  ok('거둘 수 있다', !!btnIn(after, '거두기'));

  /* ★ 지시 횟수를 세지 않는다 — 그건 인사 평가 자료다 */
  const main = text(t.win.document.querySelector('main'));
  ok('★ "n회" 같은 누적 횟수를 화면에 세지 않는다',
    !/재교육\s*\d+\s*회|지시\s*\d+\s*회/.test(main), main.slice(0, 200));
  has('★ 이 지시가 무엇이 아닌지 적는다', main, '"이 사람이 못했다" 가 아닙니다');
  has('★ 줄 세우지 않는다고 적는다', main, '줄 세우는 화면은 만들지 않습니다');
}

{
  /* --- 거두기 — 지우지 않고 표시만 남긴다 --- */
  const t = open({ before(win) { win.Store.orders.save([]); } });
  const row = actionRow(t, 'W-4821-11');
  click(t.win, btnIn(row, '재교육 지시'));
  t.$('order-note').value = '다시 들어 주세요';
  click(t.win, t.$('order-send'));

  click(t.win, btnIn(actionRow(t, 'W-4821-11'), '거두기'));

  const orders = t.win.Store.orders.load();
  eq('★ 지우지 않는다 — 냈다가 거둔 사실이 남는다', orders.length, 1);
  ok('거둔 시각이 찍힌다', !!(orders[0] && orders[0].canceledAt), JSON.stringify(orders));
  ok('다시 지시할 수 있다', !!btnIn(actionRow(t, 'W-4821-11'), '재교육 지시'));
  has('거뒀다고 알린다', text(t.$('toast')), '거뒀습니다');
}

{
  /* --- ★ 해소 판정은 progress 를 본다 ---
       지시를 내린 뒤에 통과했어야 해소다. 그전 통과로 사라지면
       담당자가 방금 보낸 지시가 보내자마자 없어진다. */
  const t = open({
    before(win) {
      win.Store.orders.save([{
        id: 'or-t1', workerId: 'W-4821-11', courseId: 'c-paint',
        note: '다시', at: '2026-08-20T00:00:00.000Z',
        by: 'kim@daesung.co.kr', canceledAt: null,
      }]);
      /* 지시보다 앞선 통과 기록 */
      win.Store.progress.update((list) => {
        const row = list.find((r) => r.workerId === 'W-4821-11' && r.courseId === 'c-paint');
        row.quiz = { score: 100, passed: true, answers: [1, 1],
          at: '2026-08-11T05:24:00.000Z', attempt: 2, firstPassed: false };
      });
    },
  });

  /* 통과했으니 조치 대상 표에서는 빠진다. 지시가 살아 있는지는 Store 로 본다 */
  const o = t.win.Store.orders.load()[0];
  const row = t.win.Store.progress.load()
    .find((r) => r.workerId === 'W-4821-11' && r.courseId === 'c-paint');
  eq('★ 지시보다 앞선 통과로는 해소되지 않는다', t.win.Store.orderOpen(o, row), true);

  row.quiz.at = '2026-08-21T00:00:00.000Z';
  eq('★ 지시 뒤에 통과하면 해소된다', t.win.Store.orderOpen(o, row), false);

  o.canceledAt = '2026-08-22T00:00:00.000Z';
  row.quiz.at = '2026-08-11T05:24:00.000Z';
  eq('거둔 지시는 살아 있지 않다', t.win.Store.orderOpen(o, row), false);
}

report('기능6 담당자 대시보드');
