/* 노동자 화면 4개 (홈 · 기능8 신고 · 기능7 소통 · 마이) — 실제 DOM 검증 */
const { boot, ok, eq, has, report, iconName } = require('./harness');

const text = (n) => (n ? n.textContent.trim().replace(/\s+/g, ' ') : '');
const click = (win, node) => node.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const change = (win, node) => node.dispatchEvent(new win.Event('change', { bubbles: true }));

const pick = (win, root, name, value) => {
  root.querySelectorAll('input[name="' + name + '"]').forEach((i) => { i.checked = i.value === value; });
  change(win, root);
};

function open(page, opts = {}) {
  return boot('worker/' + page + '.html',
    Object.assign({ login: 'W-4821-07', page: 'worker/' + page + '.js' }, opts));
}

/* =================================================================
   홈 — 글자를 읽지 않고 길을 찾을 수 있는가
   ================================================================= */
{
  const t = open('home');
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  // 1. 오늘의 안전 문구 — ★ 검수된 것만
  const todayText = text(t.$('today-text'));
  ok('오늘의 문구가 있다', todayText.length > 0);
  const lib = t.win.Store.library.load();
  const shown = lib.find((p) => p.ko === text(t.$('today-ko')) ||
    (p.translations.km && p.translations.km.text === todayText));
  ok('★ 검수 완료된 문구만 배너에 오른다', !shown || shown.status === 'reviewed',
    shown && shown.id + ' status=' + shown.status);
  eq('문구를 소리로 들을 수 있다', t.$('today-listen').querySelectorAll('.btn-audio').length, 1);

  // 2. 3단계 — 예시 데이터에서 W-4821-07 은 c-press 통과 → 완료
  const stages = [...t.$('stage-track').children].map((li) => li.getAttribute('data-state'));
  eq('세 단계가 다 표시된다', stages.filter(Boolean).length, 3);
  has('상태를 말로도 알려 준다', text(t.$('stage-say')), '마쳤습니다');
  ok('상태를 소리로 들을 수 있다', !!t.$('stage-say').querySelector('.btn-audio'));

  // 3. 메뉴 4갈래 — 픽토그램 + 글자 + 음성
  const cells = [...t.$('bigmenu').querySelectorAll('.bigmenu-cell')];
  eq('메뉴 4개', cells.length, 4);
  ok('메뉴마다 픽토그램이 있다',
    cells.every((c) => !!iconName(c.querySelector('.ico'))),
    cells.map((c) => iconName(c.querySelector('.ico'))).join(','));
  ok('★ 메뉴마다 음성 버튼이 있다',
    cells.every((c) => !!c.querySelector('.btn-audio')));
  const hrefs = cells.map((c) => c.querySelector('a').getAttribute('href'));
  eq('수강·신고·소통·마이로 간다',
    hrefs.join(','), 'learn.html,report.html,talk.html,my.html');

  // 4. 번역 이상 신고 안내
  const main = text(t.win.document.querySelector('main'));
  // ★ 이제 이 사람(크메르어)의 언어로 뜬다. 한국어 글자를 박아 두면
  //   번역이 될수록 검사가 깨진다. 사전을 거쳐 "그 언어로 나오는가" 를 본다.
  has('말이 이상하면 알려 달라고 한다 (내 언어로)', main, t.win.I18N.t('home.badTrans'));
  ok('★ 크메르어 사용자에게 한국어 원문이 아니라 번역이 뜬다',
    t.win.I18N.t('home.badTrans') !== t.win.I18N.t('home.badTrans', 'ko'));
  has('알린 사람을 기록하지 않는다고 말한다', main, '누구인지는 기록하지 않습니다');

  /* --- 아직 안 들은 상태면 교육으로 보낸다 --- */
  const t2 = open('home', {
    before(win) { win.Store.progress.save([]); },
  });
  has('아직 안 들었다고 말한다', text(t2.$('stage-say')), '아직 듣지 않았습니다');
  const now = [...t2.$('stage-track').children].find((li) => li.getAttribute('data-state') === 'now');
  has('듣기 단계가 지금 차례', text(now), t2.win.I18N.t('home.stepLearn', 'km'));
  has('교육으로 가는 버튼', t2.$('stage-actions').innerHTML, 'learn.html');

  /* --- 검수된 문구가 없으면 --- */
  const t3 = open('home', {
    before(win) {
      win.Store.library.update((list) => { list.forEach((p) => { p.status = 'waiting'; }); });
    },
  });
  has('★ 검수된 문구가 없으면 배너를 비운다',
    text(t3.$('today-text')), '아직 안전 문구가 준비되지 않았습니다');
}

/* =================================================================
   기능8 신고 — ★★ 익명이 지켜지는가
   ================================================================= */
{
  const t = open('report');
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  // 익명 고지가 맨 위에
  const anon = t.win.document.querySelector('.anon-note');
  has('이름을 남기지 않는다고 크게 적는다', text(anon), t.win.I18N.t('report.anon', 'km'));
  has('관리자도 알 수 없다고 말한다', text(anon), t.win.I18N.t('report.anonBody2', 'km'));
  ok('안내를 소리로도 들을 수 있다', !!anon.querySelector('.btn-audio'));

  // 그림으로 고른다
  const equips = t.$('pick-equip').querySelectorAll('input[name="equip"]');
  eq('설비 3대', equips.length, 3);
  ok('내 공정 설비가 먼저 온다',
    ['e-press3', 'e-panel'].indexOf(equips[0].value) !== -1, equips[0].value);
  const hazards = t.$('pick-hazard').querySelectorAll('input[name="hazard"]');
  eq('위험유형 6개', hazards.length, 6);

  has('고르기 전에는 미선택', text(t.$('b-equip')), '미선택');

  /* --- ★ 글을 한 자도 안 쓰고 신고가 끝난다 --- */
  pick(t.win, t.$('pick-equip'), 'equip', 'e-press3');
  pick(t.win, t.$('pick-hazard'), 'hazard', 'pinch');
  has('고른 설비가 표시된다', text(t.$('b-equip')), '프레스 3호기');
  has('고른 위험이 표시된다', text(t.$('b-hazard')), '끼임');

  const before = t.win.Store.reports.load().length;
  click(t.win, t.$('btn-send'));

  const list = t.win.Store.reports.load();
  eq('★ 메모 없이도 접수된다', list.length, before + 1);

  const made = list[list.length - 1];

  /* --- ★★ 여기가 이 화면의 핵심 검사 --- */
  const keys = Object.keys(made);
  const forbidden = ['workerId', 'userId', 'author', 'by', 'reporter', 'name', 'lang', 'createdBy'];
  ok('★★ 신고자를 식별할 값이 하나도 없다',
    forbidden.every((k) => !(k in made)),
    JSON.stringify(keys));
  ok('★★ 저장된 값 어디에도 내 아이디가 없다',
    !JSON.stringify(made).includes('W-4821'),
    JSON.stringify(made));
  /* ★ 이 목록을 넓힐 때는 "그 값으로 사람을 찾을 수 있는가" 를 먼저 답해야 한다.
     memoFromVoice 는 참/거짓 하나다. 말로 알렸는지만 말하고 누가 알렸는지는
     말하지 않는다. 목소리 자체는 저장되지 않는다 — 저장되면 작은 사업장에서
     담당자가 듣고 누구인지 알 수 있고, 그 순간 익명이 아니게 된다. */
  eq('저장되는 값은 정해진 것만',
    keys.slice().sort().join(','),
    'createdAt,equipmentId,hazard,id,memo,memoFromVoice,processId,status,ticket');
  ok('★★ 음성 표시는 참/거짓 하나뿐이다 (사람을 가리키는 값이 아니다)',
    typeof made.memoFromVoice === 'boolean', String(made.memoFromVoice));
  ok('★★ 목소리(오디오)를 저장하지 않는다',
    !/audio|blob|base64|data:audio|recording/i.test(JSON.stringify(made)),
    JSON.stringify(made));

  // 접수 번호에도 사람이 안 들어간다
  ok('접수 번호가 생긴다', /^R-\d{6}-\d{4}$/.test(made.ticket), made.ticket);
  ok('★ 접수 번호에 아이디가 없다', !made.ticket.includes('4821'), made.ticket);

  // 접수 화면
  eq('접수 화면이 뜬다', t.$('view-done').hidden, false);
  eq('신고 폼은 숨는다', t.$('view-form').hidden, true);
  eq('접수 번호를 보여 준다', text(t.$('ticket')), made.ticket);
  has('번호에 누구인지가 없다고 말한다', text(t.$('view-done')), t.win.I18N.t('report.ticketWhy', 'km'));
  ok('접수 안내를 소리로 들을 수 있다', !!t.$('done-listen').querySelector('.btn-audio'));

  // 목록에 뜨고, 왜 "내 신고" 를 못 보는지 설명한다
  has('★ 익명이라 내 것만 골라 볼 수 없다고 설명한다',
    text(t.$('list-why')), '"내가 낸 것" 만 골라 볼 수 없습니다');
  const items = t.$('report-list').querySelectorAll('.report-item');
  eq('목록에 3건 (예시 2 + 방금 1)', items.length, 3);
  ok('★ 목록에도 식별번호가 나오지 않는다',
    !/W-\d{4}-\d{2}/.test(text(t.$('report-list'))), text(t.$('report-list')).slice(0, 200));

  /* --- 또 알리기 --- */
  click(t.win, t.$('btn-again'));
  eq('폼이 다시 뜬다', t.$('view-form').hidden, false);
  eq('고른 것이 비워진다', t.$('pick-equip').querySelectorAll('input:checked').length, 0);

  /* --- 안 고르면 막는다 --- */
  const t2 = open('report');
  click(t2.win, t2.$('btn-send'));
  eq('설비를 안 고르면 접수되지 않는다', t2.win.Store.reports.load().length, 2);
  pick(t2.win, t2.$('pick-equip'), 'equip', 'e-press3');
  click(t2.win, t2.$('btn-send'));
  eq('위험유형을 안 고르면 접수되지 않는다', t2.win.Store.reports.load().length, 2);
}

/* =================================================================
   기능7 소통 — 게시판과 이름 감추기
   ================================================================= */
{
  const t = open('talk');
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  const items = [...t.$('post-list').querySelectorAll('.post-item')];
  eq('예시 글 2개', items.length, 2);

  const meta = items.map((i) => text(i.querySelector('.meta')));
  ok('제목·작성자·작성일·조회수·댓글이 보인다',
    meta.every((m) => m.includes('조회') && m.includes('댓글')), JSON.stringify(meta));
  ok('익명 글은 이름 감춤으로 보인다',
    meta.some((m) => m.includes('이름 감춤')), JSON.stringify(meta));

  /* --- 글 열기 · 조회수 --- */
  const first = items[0].querySelector('.post-open');
  const beforeViews = t.win.Store.posts.load()[0].views || 0;
  click(t.win, first);
  eq('글 화면이 뜬다', t.$('view-post').hidden, false);
  ok('제목이 보인다', text(t.$('p-title')).length > 0);
  ok('글을 소리로 읽어 준다', !!t.$('p-listen').querySelector('.btn-audio'));

  /* --- 댓글 달기 (이름 감추고) --- */
  t.$('c-body').value = '저도 궁금합니다';
  pick(t.win, t.$('pick-canon'), 'canon', 'yes');
  click(t.win, t.$('btn-comment'));

  const posts = t.win.Store.posts.load();
  const opened = posts.find((p) => (p.comments || []).some((c) => c.body === '저도 궁금합니다'));
  ok('댓글이 저장된다', !!opened);
  const added = opened.comments[opened.comments.length - 1];
  eq('★ 이름을 감추면 아이디를 저장하지 않는다', added.author, '');
  eq('감췄다는 표시', added.anonymous, true);
  has('화면에도 이름 감춤으로', text(t.$('p-comments')), '이름 감춤');

  /* --- 새 글 쓰기 (이름 밝히고) --- */
  click(t.win, t.$('btn-post-back'));
  click(t.win, t.$('btn-new'));
  eq('쓰기 화면이 뜬다', t.$('view-write').hidden, false);

  t.$('w-title').value = '도장실 환기팬 언제 고쳐지나요';
  t.$('w-body').value = '어제부터 소리가 큽니다';
  click(t.win, t.$('btn-write-save'));

  const made = t.win.Store.posts.load().find((p) => p.title === '도장실 환기팬 언제 고쳐지나요');
  ok('글이 저장된다', !!made);
  eq('감추지 않으면 내 아이디가 들어간다', made.author, 'W-4821-07');
  eq('감춘 글이 아니다', made.anonymous, false);
  eq('조회수 0으로 시작', made.views, 0);
  eq('댓글은 빈 배열', made.comments.length, 0);
  eq('목록으로 돌아간다', t.$('view-list').hidden, false);
  has('목록에 새 글이 있다', text(t.$('post-list')), '도장실 환기팬');

  /* --- 제목 없이 올리려면 막는다 --- */
  click(t.win, t.$('btn-new'));
  const countBefore = t.win.Store.posts.load().length;
  click(t.win, t.$('btn-write-save'));
  eq('제목이 없으면 올라가지 않는다', t.win.Store.posts.load().length, countBefore);
}

/* =================================================================
   마이페이지 — 숨기는 경로가 없는가
   ================================================================= */
{
  const t = open('my');
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  // 내 정보 — ★ 외국인등록번호·여권번호 없음
  const meText = text(t.$('me-list'));
  has('식별번호', meText, 'W-4821-07');
  has('사업장', meText, '대성정밀');
  has('공정', meText, '프레스');
  has('내 언어', meText, '크메르어');
  const card = t.$('me-list').closest('.card');
  has('★ 받지 않는다는 것을 적는다', text(card), '외국인등록번호와 여권번호는 받지 않습니다');
  ok('★ 화면에 그런 항목이 없다', !/등록번호\s*[:：]|여권번호\s*[:：]/.test(meText));

  // 받은 교육
  const rows = [...t.$('history-list').querySelectorAll('.course-card')];
  eq('받은 교육 1건', rows.length, 1);
  has('완료로 보인다', text(rows[0]), t.win.I18N.t('state.done', 'km'));
  has('점수도 보인다', text(rows[0]), '100점');

  /* --- 통과하지 못한 것도 그대로 보이고, 다시 할 길을 준다 --- */
  const t2 = open('my', {
    before(win) {
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
        r.quiz = { score: 33, passed: false, answers: [1, 0, 0], at: '2026-08-20T00:00:00.000Z',
          attempt: 1, firstPassed: false };
      });
    },
  });
  const row2 = t2.$('history-list').querySelector('.course-card');
  has('★ 통과하지 못한 것도 숨기지 않는다', text(row2), t2.win.I18N.t('state.retry', 'km'));
  has('점수도 그대로', text(row2), '33점');
  has('다시 할 길을 준다', row2.innerHTML, 'learn.html');

  // ★ 증빙 — 숨기는 경로가 없다
  const proofCard = t.$('btn-print').closest('.card');
  has('★ 빼고 뽑는 기능이 없다고 적는다',
    text(proofCard), t.win.I18N.t('my.proofWhy', 'km'));

  const proofRows = [...t.$('proof-rows').querySelectorAll('tr')];
  eq('증빙에 받은 교육 전부', proofRows.length, 1);
  has('증빙 제목', text(t.$('proof')), '수강 증빙');
  has('★ 빼고 뽑을 수 없다고 문서에 적는다',
    text(t.$('proof-foot')), '빼고 뽑을 수 없습니다');
  has('법적 책임을 대신하지 않는다', text(t.$('proof-foot')), '법적 책임을 대신하지 않습니다');

  // 신고 이력 — 익명이라 내 것만 못 본다
  has('★ 왜 내 것만 볼 수 없는지 설명한다',
    text(t.$('reports-why')), '"내가 낸 것" 만 골라 볼 수 없습니다');
  ok('★ 신고 목록에 식별번호가 없다',
    !/W-\d{4}-\d{2}/.test(text(t.$('reports-list'))));

  // 인쇄
  let printed = 0;
  t.win.print = () => { printed++; };
  click(t.win, t.$('btn-print'));
  eq('브라우저 인쇄를 부른다', printed, 1);
  /* 쓰는 키 — 증빙에 손댈 수 있는 경로가 없어야 한다

     ★ 원래 이 검사는 "아무것도 쓰지 않는다" 였다. 지키려던 것은 그게 아니라
       "증빙 사본을 만들지 않는다" 다 — 사본이 없으니 고칠 경로도 없다.
       C8(내 언어 바꾸기)이 accounts 에 쓰게 되면서 원칙 쪽으로 좁혔다.
       내 언어는 앞으로 받을 교육의 언어이지 이미 받은 기록이 아니다. */
  const fs = require('fs');
  const code = fs.readFileSync('C:/Users/byeonsoyun/2026-ax-ton/2026-ax-ton/src/worker/my.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const writes = [...new Set((code.match(/Store\.(\w+)\.(?:save|update)\s*\(/g) || [])
    .map((s) => s.split('.')[1]))].sort();
  eq('★ 마이페이지가 쓰는 키는 accounts 와 prefs 뿐이다', writes.join(','), 'accounts,prefs');

  ok('★ 기록에 쓰는 경로가 없다 (progress · courses · reports · setup)',
    !/Store\.(progress|courses|reports|setup)\.(?:save|update)\s*\(/.test(code));

  ok('★ accounts 는 lang 값만 고친다 — 모양은 넓히지 않는다',
    !/\bacc\.(userId|pw|role|name|title|siteName|processId)\s*=/.test(code));
}

/* =================================================================
   규칙 검사 — 노동자 화면 4개
   ================================================================= */
{
  const fs = require('fs');
  const base = 'C:/Users/byeonsoyun/2026-ax-ton/2026-ax-ton/src/worker/';
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

  ['home', 'report', 'talk', 'my'].forEach((name) => {
    const html = fs.readFileSync(base + name + '.html', 'utf8');
    const js = fs.readFileSync(base + name + '.js', 'utf8');
    const visible = html.replace(/<!--[\s\S]*?-->/g, '');

    ok(name + ': 외부 주소 없음', !/(src|href)\s*=\s*["']https?:/i.test(html));
    ok(name + ': 절대경로 없음', !/(src|href)\s*=\s*["']\//.test(html));
    ok(name + ': innerHTML 안 씀', !/innerHTML/.test(strip(js)));
    ok(name + ': localStorage 직접 호출 안 함', !/localStorage/.test(strip(js)));
    ok(name + ': "면책" 없음', !/면책/.test(visible + strip(js)));
    ok(name + ': 껍데기 안내 없음', !/아직 만들지 않은 화면/.test(html));
    ok(name + ': <img> 없음', !/<img/i.test(html));
  });

  // ★ report.js 가 저장할 때 사람과 이어지는 값을 쓰지 않는지 (코드 수준)
  const reportJs = strip(fs.readFileSync(base + 'report.js', 'utf8'));
  const writeBlock = reportJs.slice(reportJs.indexOf('Store.reports.update'),
    reportJs.indexOf('if (!result.ok)'));
  ok('★★ 신고 저장 블록에 user 나 me.id 가 없다',
    !/user\.|me\.id|userId|workerId|author/.test(writeBlock), writeBlock.slice(0, 300));
}


/* =================================================================
   마이페이지 — 문항별 복기 (C4)
   ================================================================= */
{
  /* c-press 를 33점으로 떨어뜨린다. answers [1,0,0] — 2·3번 문항이 틀렸다.
     seed 의 c-press 문항은 q1 pinch(끼임) · q2 pinch · q3 shock(감전) 이다. */
  const t = open('my', {
    before(win) {
      win.Store.progress.update((list) => {
        const r = list.find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
        r.quiz = { score: 33, passed: false, answers: [1, 0, 0], at: '2026-08-20T00:00:00.000Z',
          attempt: 1, firstPassed: false };
      });
    },
  });

  const stuck = t.$('history-list').querySelector('.stuck');
  ok('★ 미통과한 교육에 복기가 붙는다', !!stuck);
  has('여기서 막혔다고 적는다', text(stuck), '여기서 막혔습니다');

  const items = [...stuck.querySelectorAll('.stuck-list li')];
  /* q1 과 q2 는 둘 다 끼임이다. 맞힌 q1 까지 들어가면 끼임이 두 번 나온다. */
  eq('★ 맞힌 1번 문항은 나오지 않는다',
    items.filter((li) => text(li).includes('끼임')).length, 1);

  const all = items.map((li) => text(li)).join(' | ');
  has('★ 위험유형이 글자로 보인다', all, '감전');
  ok('★ 픽토그램이 함께 보인다 (색·글자만으로 구분하지 않는다)',
    items.every((li) => !!li.querySelector('.ico') && li.querySelector('.ico').textContent.trim()),
    all);
  ok('★ 틀렸다는 것을 배지로도 적는다', all.includes(t.win.I18N.t('state.wrong', 'km')), all);

  has('★ 노동자의 실패가 아니라고 적는다', text(stuck), '교육의 실패로 기록됩니다');

  /* 문항 문구는 내 언어로 나온다 — Store.qtext 를 거친다.
     seed 의 c-press q2 는 크메르어 번역이 있다. */
  has('★ 문항 문구가 크메르어로 나온다', text(stuck), 'ម៉ាស៊ីន');

  /* ★ q3 은 seed 에 번역이 일부러 없다. 없으면 한국어로 내려간다 (A1 규칙).
       조용히 비우면 무엇을 틀렸는지 알 수 없는 빈 줄이 된다. */
  has('★ 번역 없는 문항은 한국어로 내려간다', text(stuck), '보호구를 연결하세요');

  // 통과한 교육에는 붙지 않는다 — 복기가 성적표가 되면 안 된다
  const passed = open('my');
  ok('★ 통과한 교육에는 복기가 없다', !passed.$('history-list').querySelector('.stuck'));
}

/* =================================================================
   마이페이지 — 내 언어 바꾸기 (C8)
   ================================================================= */
{
  const t = open('my');
  const box = t.$('pick-mylang');
  ok('언어 고르는 칸이 있다', !!box);

  const chips = [...box.querySelectorAll('input[name="mylang"]')];
  eq('언어 6개가 다 나온다', chips.length, 6);
  eq('★ 지금 내 언어가 골라져 있다',
    chips.filter((c) => c.checked).map((c) => c.value).join(','), 'km');

  /* ★ 한국어를 못 읽는 사람이 자기 언어를 찾을 수 있어야 한다.
       모국어 글자가 앞에 온다. */
  has('★ 모국어 글자로 적혀 있다', text(box), 'Tiếng Việt');
  has('한국어 이름도 거든다', text(box), '베트남어');

  // 베트남어로 바꾼다
  const vi = chips.find((c) => c.value === 'vi');
  vi.checked = true;
  vi.dispatchEvent(new t.win.Event('change', { bubbles: true }));

  const acc = t.win.Store.findBy(t.win.Store.accounts.load(), 'userId', 'W-4821-07');
  eq('★ accounts 에 저장된다', acc.lang, 'vi');
  eq('★ 다른 필드는 그대로다 — 모양을 넓히지 않는다', acc.processId, 'p-press');
  eq('비밀번호도 그대로', acc.pw, '1234');
  has('바뀌었다고 알린다', text(t.$('toast')), '베트남어');
  has('★ 화면의 내 언어도 함께 바뀐다', text(t.$('me-list')), '베트남어');

  /* ★ 언어를 바꿔도 이미 받은 교육의 기록은 그대로다.
       progress 는 그때 들은 언어를 스스로 갖고 있다 (learn.js 가 row.lang 을 적는다).
       여기가 무너지면 언어를 바꾸는 것으로 증빙을 고칠 수 있게 된다. */
  const row = t.win.Store.progress.load()
    .find((x) => x.workerId === 'W-4821-07' && x.courseId === 'c-press');
  eq('★ 지난 기록의 언어는 안 바뀐다', row.lang, 'km');
  has('★ 증빙도 그때 언어로 남는다', text(t.$('proof-rows')), '크메르어');
}

/* =================================================================
   기능7 소통 — 내 글 수정·삭제 (C3)

   ★ 여기서 지켜야 하는 것은 "고칠 수 있는가" 가 아니라
     "감춘 글은 아무도 — 본인도 — 손댈 수 없는가" 다.
   ================================================================= */

/* 글 목록에서 제목으로 찾아 연다 */
function openPostByTitle(t, title) {
  const item = [...t.$('post-list').querySelectorAll('.post-item')]
    .find((li) => text(li).includes(title));
  if (item) click(t.win, item.querySelector('.post-open'));
  return item;
}

{
  /* seed: po-1 은 W-4821-07 이 이름을 밝히고 쓴 글, po-2 는 익명 글 */
  const t = open('talk');

  /* --- 내 글 --- */
  openPostByTitle(t, '프레스 교대');
  const mine = t.$('p-mine');
  has('★ 내 글에 고치기가 있다', text(mine), '고치기');
  has('★ 내 글에 지우기가 있다', text(mine), '지우기');

  /* --- 익명 글 — 본인도 손댈 수 없다 --- */
  click(t.win, t.$('btn-post-back'));
  openPostByTitle(t, '도장실 마스크');
  const anon = t.$('p-mine');
  ok('★ 감춘 글에는 고치기·지우기가 없다',
    !text(anon).includes('고치기') && !text(anon).includes('지우기'), text(anon));
  has('★ 왜 못 하는지 적는다', text(anon),
    '누가 썼는지 저장하지 않으므로');
  has('★ 본인도 못 한다고 적는다', text(anon), '본인도 고치거나 지울 수 없습니다');
}

{
  /* --- 남의 글에는 아무것도 안 붙는다 --- */
  const t = open('talk', {
    before(win) {
      win.Store.posts.update((list) => {
        const p = list.find((x) => x.id === 'po-1');
        p.author = 'W-4821-11';        // 다른 사람 글로 바꾼다
      });
    },
  });
  openPostByTitle(t, '프레스 교대');
  eq('★ 남의 글에는 버튼도 안내도 없다', text(t.$('p-mine')), '');
}

{
  /* --- 고치기 --- */
  const t = open('talk');
  openPostByTitle(t, '프레스 교대');
  click(t.win, [...t.$('p-mine').querySelectorAll('button')]
    .find((b) => text(b).includes('고치기')));

  eq('쓰기 화면으로 간다', t.$('view-write').hidden, false);
  has('★ 새로 쓰는 것이 아니라고 적는다', text(t.$('t-write')), '고치기');
  eq('원래 제목이 채워져 있다', t.$('w-title').value, '프레스 교대 시간 바뀐 것 맞나요?');
  ok('원래 내용도 채워져 있다', t.$('w-body').value.length > 0);

  t.$('w-title').value = '프레스 교대 시간 (확인했습니다)';
  click(t.win, t.$('btn-write-save'));

  const all = t.win.Store.posts.load();
  eq('★ 글이 늘지 않는다 — 고친 것이지 새로 쓴 것이 아니다', all.length, 2);

  const edited = all.find((p) => p.id === 'po-1');
  eq('제목이 바뀐다', edited.title, '프레스 교대 시간 (확인했습니다)');
  eq('★ 글쓴이는 그대로다', edited.author, 'W-4821-07');
  ok('고친 시각이 남는다', !!edited.editedAt);
  eq('★ 댓글은 그대로 남는다', edited.comments.length, 1);
  eq('★ 조회수도 그대로다', edited.views, all.find((p) => p.id === 'po-1').views);

  eq('고친 글 화면으로 돌아온다', t.$('view-post').hidden, false);
  has('고쳤다는 표시가 보인다', text(t.$('p-meta')), '고침');
}

{
  /* --- 고치다 그만두고 새로 쓰면 새 글이어야 한다
       ★ 옛 글을 덮어쓰면 남의 눈에는 글이 사라진 것으로 보인다.
         endEdit() 이 그만두기와 새로 쓰기 두 곳에 다 있다 — 한쪽만 남아도
         결과는 지켜진다. 검사는 방식이 아니라 그 결과를 본다. --- */
  const t = open('talk');
  openPostByTitle(t, '프레스 교대');
  click(t.win, [...t.$('p-mine').querySelectorAll('button')]
    .find((b) => text(b).includes('고치기')));
  click(t.win, t.$('btn-write-cancel'));

  click(t.win, t.$('btn-new'));
  eq('★ 그만두면 칸이 비워진다', t.$('w-title').value, '');
  has('★ 다시 새로 쓰기가 된다', text(t.$('t-write')), '새로 쓰기');

  t.$('w-title').value = '완전히 새 글';
  click(t.win, t.$('btn-write-save'));

  const all = t.win.Store.posts.load();
  eq('★ 새 글로 늘어난다 — 옛 글을 덮어쓰지 않는다', all.length, 3);
  ok('옛 글이 그대로 있다',
    !!all.find((p) => p.title === '프레스 교대 시간 바뀐 것 맞나요?'));
}

{
  /* --- 지우기 --- */
  const t = open('talk');
  t.win.confirm = () => true;
  openPostByTitle(t, '프레스 교대');
  click(t.win, [...t.$('p-mine').querySelectorAll('button')]
    .find((b) => text(b).includes('지우기')));

  const all = t.win.Store.posts.load();
  eq('글이 지워진다', all.length, 1);
  ok('그 글만 지워진다', !all.find((p) => p.id === 'po-1'));
  eq('목록으로 돌아간다', t.$('view-list').hidden, false);

  /* 되돌릴 수 없는 일이라 먼저 물어본다 */
  const t2 = open('talk');
  let asked = '';
  t2.win.confirm = (m) => { asked = m; return false; };
  openPostByTitle(t2, '프레스 교대');
  click(t2.win, [...t2.$('p-mine').querySelectorAll('button')]
    .find((b) => text(b).includes('지우기')));
  has('★ 먼저 물어본다', asked, '되돌릴 수 없습니다');
  has('★ 댓글도 사라진다고 알린다', asked, '댓글도 함께 사라집니다');
  eq('★ 아니라고 하면 안 지운다', t2.win.Store.posts.load().length, 2);
}

{
  /* --- 고치면서 이름을 감추면 되돌릴 수 없다 --- */
  const t = open('talk');
  openPostByTitle(t, '프레스 교대');
  click(t.win, [...t.$('p-mine').querySelectorAll('button')]
    .find((b) => text(b).includes('고치기')));

  pick(t.win, t.$('pick-anon'), 'anon', 'yes');
  has('★ 누르기 전에 되돌릴 수 없다고 적는다', text(t.$('w-anonwarn')), '되돌릴 수 없고');

  let asked = '';
  t.win.confirm = (m) => { asked = m; return true; };
  click(t.win, t.$('btn-write-save'));
  has('★ 저장할 때 한 번 더 물어본다', asked, '되돌릴 수 없고');

  const edited = t.win.Store.posts.load().find((p) => p.id === 'po-1');
  eq('★ 아이디가 지워진다 — 표시만 감추는 것이 아니다', edited.author, '');
  eq('감춘 글이 된다', edited.anonymous, true);

  /* 이제는 본인도 못 고친다 */
  has('★ 그 뒤로는 손댈 수 없다', text(t.$('p-mine')), '본인도 고치거나 지울 수 없습니다');
  ok('고치기 버튼이 사라진다', !text(t.$('p-mine')).includes('고치기'), text(t.$('p-mine')));
}

/* =================================================================
   홈 — 오늘의 문구 넘겨 보기 (C5)
   ================================================================= */
{
  /* 음성을 들어 보려면 가짜 speechSynthesis 가 필요하다 — jsdom 에는 없다.
     test-smoke.js 의 fakeSpeech 와 같은 모양이고, 여기서는 "정상으로 읽는"
     브라우저만 있으면 된다. */
  const spoken = [];
  const t = open('home', {
    before(win) {
      win.speechSynthesis = {
        cancel() {},
        getVoices() { return [{ lang: 'ko-KR' }, { lang: 'km-KH' }]; },
        addEventListener() {}, removeEventListener() {},
        speak(u) {
          spoken.push(String(u.text));
          if (u.onstart) u.onstart();
          if (u.onend) u.onend();
        },
      };
      win.SpeechSynthesisUtterance = function (text) { this.text = text; };
    },
  });

  const nav = t.$('today-nav');
  ok('★ 넘겨 볼 것이 있으면 버튼이 보인다', nav.hidden === false);
  has('지금 자리를 알려 준다', text(t.$('today-pos')), '/');

  const first = text(t.$('today-text'));
  const pos1 = text(t.$('today-pos'));
  spoken.length = 0;

  click(t.win, t.$('today-next'));
  const second = text(t.$('today-text'));
  ok('★ 다음 문구로 바뀐다', second !== first, first + ' → ' + second);
  ok('자리 표시도 바뀐다', text(t.$('today-pos')) !== pos1);
  ok('★ 넘기면 그 문구를 읽어 준다', spoken.length > 0, JSON.stringify(spoken));
  eq('★ 읽는 것이 지금 보이는 바로 그 문구다', spoken[spoken.length - 1], second);

  click(t.win, t.$('today-prev'));
  eq('★ 되돌아오면 원래 문구다', text(t.$('today-text')), first);

  /* 끝에서 막히지 않는다 — 막다른 끝은 고장으로 보인다 */
  const total = Number(text(t.$('today-pos')).split('/')[1].trim());
  for (let i = 0; i < total; i++) click(t.win, t.$('today-next'));
  eq('★ 한 바퀴 돌면 제자리로 온다', text(t.$('today-text')), first);
}

{
  /* 볼 것이 하나뿐이면 버튼을 아예 두지 않는다 —
     눌러도 아무 일이 없는 버튼은 글을 못 읽는 사람에게 고장이다.

     ★ update 의 콜백에서 무엇을 return 하면 그 값이 저장소를 통째로 덮는다.
       처음에 boolean 을 돌려줬다가 라이브러리가 통째로 날아갔고,
       "문구 0개" 상태를 "문구 1개" 로 착각해서 검사가 엉뚱하게 통과했다. */
  const t = open('home', {
    before(win) {
      win.Store.library.update((list) => {
        list.forEach((p) => { if (p.id !== 'ph-1') p.status = 'waiting'; });
      });
    },
  });

  const okCount = t.win.Store.library.load()
    .filter((p) => t.win.Store.phraseOk(p, 'km')).length;
  eq('먼저 — 검수를 지난 문구가 정말 하나뿐인가', okCount, 1);

  eq('★ 하나뿐이면 넘기기 버튼이 없다', t.$('today-nav').hidden, true);
  eq('자리 표시도 비운다', text(t.$('today-pos')), '');
  ok('★ 그래도 그 문구는 보인다 (빈 배너가 아니다)',
    !text(t.$('today-text')).includes('준비되지 않았습니다'), text(t.$('today-text')));
}

{
  /* ★ 다시 그려도 "번역 준비 중" 배지가 쌓이지 않는다.
       예전에는 배지를 listen 옆에 새로 끼워 넣어서 render 할 때마다 늘었다. */
  const t = open('home', {
    before(win) {
      // 크메르어 번역이 없는 문구만 남긴다 → 배지가 뜨는 상태
      win.Store.library.update((list) => {
        list.forEach((p) => {
          if (p.translations) delete p.translations.km;
        });
      });
    },
  });
  has('번역이 없으면 배지를 띄운다', text(t.$('today-note')), t.win.I18N.t('learn.transPending', 'km'));

  click(t.win, t.$('today-next'));
  click(t.win, t.$('today-prev'));
  click(t.win, t.$('today-next'));

  const badges = t.win.document.querySelectorAll('#today .badge-wait');
  eq('★ 여러 번 넘겨도 배지는 하나뿐이다', badges.length, 1);
}

/* =================================================================
   마이페이지 — 글자 크기 (B3 · PRD §9.4)

   ★ 여기서 지켜야 하는 것은 "바뀌는가" 가 아니라
     "글자가 안 보이는 사람이 스스로 키울 수 있는가" 다.

   ★ 고를 때마다 칩을 다시 그린다. 그래서 매번 다시 찾아야 한다 —
     옛 요소를 붙잡고 있으면 화면에서 떨어져 나간 것에 대고 누르는 셈이다.
   ================================================================= */

function fontChip(t, code) {
  return [...t.$('pick-myfont').querySelectorAll('input[name="myfont"]')]
    .find((c) => c.value === code);
}
function pickFont(t, code) {
  const c = fontChip(t, code);
  c.checked = true;
  c.dispatchEvent(new t.win.Event('change', { bubbles: true }));
}

{
  const t = open('my');
  const box = t.$('pick-myfont');
  ok('글자 크기 고르는 칸이 있다', !!box);

  eq('세 가지를 고를 수 있다',
    box.querySelectorAll('input[name="myfont"]').length, 3);
  eq('★ 지금 크기가 골라져 있다', fontChip(t, 'normal').checked, true);

  /* ★ 칸에 적힌 글자가 실제로 그 크기다.
       "작게 / 보통 / 크게" 를 읽어야 고를 수 있으면,
       글자가 안 보여서 여기 온 사람에게는 아무 도움이 안 된다. */
  const demos = [...box.querySelectorAll('.font-demo')];
  eq('칩마다 미리보기가 붙는다', demos.length, 3);
  ok('★ 칩마다 크기가 다르게 표시된다',
    new Set(demos.map((d) => d.className)).size === 3,
    demos.map((d) => d.className).join(' | '));
  has('글자로도 적는다', text(box), '크게');

  pickFont(t, 'large');
  eq('★ 저장된다', t.win.Store.prefs.load().fontScale, 'large');
  eq('★ 새로고침을 기다리지 않고 지금 바로 커진다',
    t.win.document.documentElement.getAttribute('data-font'), 'large');
  has('바뀌었다고 알린다', text(t.$('toast')), '크게');
  has('이 기기에서 유지된다고 알린다', text(t.$('toast')), '기기');
  eq('다시 그려도 고른 것이 남는다', fontChip(t, 'large').checked, true);

  pickFont(t, 'normal');
  eq('보통으로 되돌아간다', t.win.Store.prefs.load().fontScale, 'normal');
  eq('★ 보통이면 표시를 뗀다',
    t.win.document.documentElement.getAttribute('data-font'), null);
}

{
  /* ★ 화면이 그려지기 전에 적용된다.
       ui.js(문서 끝)에서 하면 기본 크기로 한 번 그려졌다가 커진다 —
       저시력 사용자에게는 그 한 번이 "안 보이는 화면" 이다.
       store.js 가 <head> 에서 붙이므로, 저장된 값이 있는 채로 store.js 가
       읽히면 화면 스크립트 없이도 붙어 있어야 한다.

     하네스는 store.js 를 먼저 돌리고 나서 before() 를 부르므로,
     값을 넣은 뒤 store.js 를 한 번 더 돌려서 "그 상황" 을 만든다. */
  const t = open('my');
  t.win.Store.prefs.save({ fontScale: 'large' });
  t.win.document.documentElement.removeAttribute('data-font');

  t.run('assets/store.js');
  eq('★ store.js 를 읽는 것만으로 크기가 붙는다',
    t.win.document.documentElement.getAttribute('data-font'), 'large');
}

{
  /* 저장소가 막힌 브라우저에서도 화면은 떠야 한다 —
     여기서 던지면 store.js 가 통째로 멈추고 아무것도 안 뜬다 */
  const t = open('my');
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
}

/* =================================================================
   기능7 소통 — 관리자 답글 구분 (C7)

   ★ 지켜야 하는 것 셋
     ① 공식 답변이 동료 의견처럼 보이지 않는가
     ② 감춘 댓글이 공식으로 새어 나가지 않는가 (익명이 깨지는 통로)
     ③ 담당자가 들어와서 돌아갈 수 있는가
   ================================================================= */

const asAdmin = (opts = {}) =>
  open('talk', Object.assign({ login: 'kim@daesung.co.kr', role: 'admin' }, opts));

{
  /* --- 노동자 눈으로 본다. seed 의 po-1 에는 kim 의 댓글이 하나 있다 --- */
  const t = open('talk');
  openPostByTitle(t, '프레스 교대');

  const items = [...t.$('p-comments').querySelectorAll('.comment-item')];
  ok('댓글이 있다', items.length > 0);

  const official = items.filter((li) => li.getAttribute('data-official') === 'yes');
  eq('★ 담당자 댓글이 공식 답변으로 표시된다', official.length, 1);
  has('글자로도 적는다 — 색만으로 구분하지 않는다', text(official[0]), t.win.I18N.t('talk.official', 'km'));
  has('누가 한 말인지 드러난다', text(official[0]), '김현수');
  ok('★ 아이디가 아니라 이름으로 보인다',
    !text(official[0]).includes('kim@daesung.co.kr'), text(official[0]));

  /* 노동자에게는 담당자 안내가 뜨지 않는다 */
  eq('노동자에게는 담당자 안내가 없다', t.$('admin-here').hidden, true);
  eq('★ 노동자에게는 글쓰기 버튼이 그대로 있다', t.$('btn-new').hidden, false);
}

{
  /* --- ★ 감춘 댓글은 절대 공식이 아니다 ---
       감춘 것을 들춰서 역할을 붙이면 그 순간 익명이 깨진다.
       author 에 담당자 아이디가 남아 있어도 anonymous 면 공식이 아니다. */
  const t = open('talk', {
    before(win) {
      win.Store.posts.update((list) => {
        list[0].comments.push({
          author: 'kim@daesung.co.kr', anonymous: true,
          body: '이건 감추고 단 댓글입니다', createdAt: '2026-08-16T00:00:00.000Z',
        });
      });
    },
  });
  openPostByTitle(t, '프레스 교대');

  const hidden = [...t.$('p-comments').querySelectorAll('.comment-item')]
    .find((li) => text(li).includes('감추고 단 댓글'));
  ok('그 댓글이 보인다', !!hidden);
  ok('★ 감춘 댓글에는 공식 표시가 붙지 않는다',
    hidden.getAttribute('data-official') !== 'yes', text(hidden));
  has('★ 이름도 감춘 채로 남는다', text(hidden), '이름 감춤');
  ok('★ 아이디가 새어 나가지 않는다',
    !text(hidden).includes('kim@daesung.co.kr') && !text(hidden).includes('김현수'),
    text(hidden));
}

{
  /* --- 담당자로 들어왔을 때 --- */
  const t = asAdmin();
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  const note = t.$('admin-here');
  eq('★ 담당자로 보고 있다고 화면에 적는다', note.hidden, false);
  has('답글이 공식 답변이 된다고 알린다', text(note), '공식 답변');
  has('★ 이름을 감출 수 없다고 미리 알린다', text(note), '이름을 감출 수 없습니다');

  /* ★ 돌아갈 길 — 아래 탭바는 전부 노동자 화면이라 누르면 튕긴다 */
  const back = note.querySelector('.back-link');
  ok('★ 돌아가는 링크가 있다', !!back);
  eq('담당자 첫 화면으로 간다', back.getAttribute('href'), '../admin/dashboard.html');
  eq('★ 노동자 탭바를 감춘다', t.win.document.querySelector('.tabbar').hidden, true);
  ok('탭바가 없으니 아래 여백도 뗀다',
    !t.win.document.body.className.includes('has-tabbar'), t.win.document.body.className);

  /* ★ 관리자는 글을 쓰지 않는다 — 여기는 노동자가 묻는 자리다 */
  eq('★ 글쓰기 버튼이 보이지 않는다', t.$('btn-new').hidden, true);
}

{
  /* --- 담당자가 답글을 단다 --- */
  const t = asAdmin();
  openPostByTitle(t, '프레스 교대');

  /* ★ 이름 감추기 칩을 아예 두지 않는다. 왜 없는지도 적는다 —
       버튼만 조용히 없으면 고장으로 보인다 (C3 에서 배운 것) */
  const canon = t.$('pick-canon');
  eq('★ 담당자에게는 이름 감추기 칩이 없다',
    canon.querySelectorAll('input[name="canon"]').length, 0);
  has('★ 왜 없는지 적는다', text(canon), '이름을 감출 수 없습니다');
  has('이유까지 적는다', text(canon), '누구의 말인지');

  t.$('c-body').value = '설비팀에 확인했습니다. 다음 주 월요일에 고칩니다.';
  click(t.win, t.$('btn-comment'));

  const post = t.win.Store.posts.load().find((p) => p.id === 'po-1');
  const added = post.comments[post.comments.length - 1];
  has('답글이 저장된다', added.body, '설비팀에 확인했습니다');
  eq('★ 감추지 않은 채로 저장된다', added.anonymous, false);
  eq('★ 누가 답했는지 남는다', added.author, 'kim@daesung.co.kr');

  /* 화면에서도 바로 공식 답변으로 보인다 */
  const mine = [...t.$('p-comments').querySelectorAll('.comment-item')]
    .find((li) => text(li).includes('설비팀에 확인했습니다'));
  eq('★ 단 즉시 공식 답변으로 표시된다', mine.getAttribute('data-official'), 'yes');
}

{
  /* --- 역할은 accounts 에서 찾는다. 댓글에 적어 두지 않는다 ---
       적어 두면 계정 역할이 바뀐 뒤 옛 댓글이 거짓말을 한다. */
  const t = asAdmin();
  openPostByTitle(t, '프레스 교대');
  t.$('c-body').value = '역할을 댓글에 적지 않습니다';
  click(t.win, t.$('btn-comment'));

  const post = t.win.Store.posts.load().find((p) => p.id === 'po-1');
  const added = post.comments[post.comments.length - 1];
  ok('★ 댓글에 role 같은 필드를 저장하지 않는다',
    !('role' in added) && !('official' in added), JSON.stringify(added));

  /* 계정이 노동자로 바뀌면 그 댓글은 더 이상 공식이 아니다 */
  const t2 = open('talk', {
    before(win) {
      win.Store.posts.update((list) => {
        list[0].comments.push({
          author: 'kim@daesung.co.kr', anonymous: false,
          body: '역할이 바뀌기 전의 답글', createdAt: '2026-08-16T01:00:00.000Z',
        });
      });
      win.Store.accounts.update((list) => {
        const acc = list.find((a) => a.userId === 'kim@daesung.co.kr');
        acc.role = 'worker';
      });
    },
  });
  openPostByTitle(t2, '프레스 교대');
  const stale = [...t2.$('p-comments').querySelectorAll('.comment-item')]
    .find((li) => text(li).includes('역할이 바뀌기 전의 답글'));
  ok('★ 역할이 바뀌면 옛 댓글도 함께 따라간다',
    stale.getAttribute('data-official') !== 'yes', text(stale));
}

/* =================================================================
   홈 — 목업에서 옮겨 온 것 (B4)

   ★ 여기 있는 문장들은 기획에서 온 것이다. 화면을 고치다 조용히
     빠지면 이 제품이 무엇을 주장하는 물건인지가 화면에서 사라진다.
   ================================================================= */
{
  const t = open('home');
  const main = text(t.win.document.querySelector('main'));

  /* ★ 이 제품이 서 있는 자리 */
  has('★ 검증을 통과해야 완료라고 적는다', main, t.win.I18N.t('home.mustPass', 'km'));
  has('★ 수강만으로는 완료가 아니라고 적는다', main, t.win.I18N.t('home.notJustAttend', 'km'));

  /* ★ 검수되지 않은 번역을 어떻게 다루는지 노동자 쪽에서도 말한다 */
  has('★ 검수 안 된 번역은 안전 지시로 쓰지 않는다고 적는다', main, t.win.I18N.t('home.unreviewedNotUsed', 'km'));

  /* 오늘의 문구가 검수를 지난 것임을 화면에 적는다 */
  has('★ 오늘의 문구에 검수 완료를 적는다', text(t.$('today-note')), t.win.I18N.t('home.reviewedOk', 'km'));

  /* 메뉴 배지 — 들어가기 전에 무엇이 기다리는지 */
  const cells = [...t.$('bigmenu').querySelectorAll('.bigmenu-cell')];
  const byHref = (h) => cells.find((c) => c.querySelector('a').getAttribute('href') === h);
  has('★ 신고가 익명이라는 것을 누르기 전에 말한다',
    text(byHref('report.html')), t.win.I18N.t('home.anonAccept', 'km'));
  has('마이페이지에서 증빙을 뽑을 수 있다고 알린다',
    text(byHref('my.html')), t.win.I18N.t('home.proofPrint', 'km'));
  ok('★ 남은 교육 수를 배지로 알려 준다',
    [t.win.I18N.t('home.coursesLeft', 'km'), t.win.I18N.t('state.allDone', 'km')]
      .some((w) => text(byHref('learn.html')).includes(w)),
    text(byHref('learn.html')));

  /* ★ 배지를 붙였으면 소리에도 넣는다.
       배지만 붙이고 소리에서 빼면 글을 못 읽는 사람에게는 없는 정보다. */
  const spoken = [];
  const t2 = open('home', {
    before(win) {
      win.speechSynthesis = {
        cancel() {},
        /* 이 노동자는 크메르어다. 한국어 음성만 주면 UI.speak 이 (규칙대로)
           소리를 내지 않아, 여기서 보려던 '배지도 읽어 주는가' 를 못 본다.
           음성이 없을 때의 동작은 test-voicefallback.js 가 따로 본다. */
        getVoices() { return [{ lang: 'km-KH' }, { lang: 'ko-KR' }]; },
        addEventListener() {}, removeEventListener() {},
        speak(u) { spoken.push(String(u.text)); if (u.onstart) u.onstart(); if (u.onend) u.onend(); },
      };
      win.SpeechSynthesisUtterance = function (text) { this.text = text; };
    },
  });
  const reportCell = [...t2.$('bigmenu').querySelectorAll('.bigmenu-cell')]
    .find((c) => c.querySelector('a').getAttribute('href') === 'report.html');
  click(t2.win, reportCell.querySelector('.btn-audio'));
  has('★ 배지 내용도 소리로 읽어 준다', spoken.join(' '), t2.win.I18N.t('home.anonAccept', 'km'));
  ok('★ 아이콘은 읽지 않는다',
    !spoken.join(' ').includes('🕶') && !spoken.join(' ').includes('●'),
    JSON.stringify(spoken));
}

{
  /* 아직 아무 교육도 없으면 배지를 억지로 만들지 않는다 */
  const t = open('home', { before(win) { win.Store.courses.save([]); } });
  const learn = [...t.$('bigmenu').querySelectorAll('.bigmenu-cell')]
    .find((c) => c.querySelector('a').getAttribute('href') === 'learn.html');
  ok('★ 받을 교육이 없으면 "0개 남음" 같은 말을 지어내지 않는다',
    !text(learn).includes(t.win.I18N.t('home.coursesLeft', 'km')), text(learn));
}

/* =================================================================
   홈 — 재교육 지시가 노동자에게 닿는가 (D2)

   ★ 담당자가 "보냈다" 고 보는데 노동자 화면에 안 뜨면 그건 없는 기능이다.
   ★ 담당자가 남긴 말은 한국어다. 못 읽는 말을 아무 표시 없이 두면
     그냥 못 본 것이 된다.
   ================================================================= */

/* seed 의 or-1 은 W-4821-11(도장·인도네시아어) 에게 내려진 지시다 */
const asWorker11 = (opts = {}) => open('home', Object.assign({ login: 'W-4821-11' }, opts));

{
  const t = asWorker11();
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));

  eq('★ 받은 지시가 홈에 뜬다', t.$('order-card').hidden, false);
  const item = t.$('order-list').querySelector('.order-item');
  ok('지시가 하나 있다', !!item);
  has('어느 교육인지 보인다', text(item), '도장');
  has('담당자가 남긴 말이 보인다', text(item), '환기팬');

  /* ★ 한국어라는 것을 적는다 */
  has('★ 한국어로 남긴 말이라고 적는다', text(item), t.win.I18N.t('home.koreanNote', 'id'));

  /* 글자를 한 자도 안 읽어도 무슨 일인지 알 수 있어야 한다 */
  ok('★ 소리로 들을 수 있다', !!item.querySelector('.btn-audio'));
  ok('★ 그림이 함께 있다', !!iconName(item.querySelector('.pict')));

  const go = item.querySelector('a[href="learn.html"]');
  ok('★ 다시 들으러 가는 큰 버튼이 있다', !!go, text(item));
  ok('큰 버튼이다 — 장갑 낀 손으로 누른다',
    go.className.includes('btn-primary'), go.className);
}

{
  /* ★ 남의 지시는 안 뜬다 — 같은 공정 · 같은 교육이어도.
       seed 의 or-1 은 다른 공정(도장)이라 교육 필터에 우연히 걸린다.
       그것만 보면 "내 것만 거른다" 를 지우고도 검사가 통과한다.
       그래서 같은 공정 사람(W-4821-03 · 프레스)에게 내려진
       같은 교육(c-press) 지시로 본다. */
  const t = open('home', {                       // W-4821-07 · 프레스
    before(win) {
      win.Store.orders.save([{
        id: 'or-other', workerId: 'W-4821-03', courseId: 'c-press',
        note: '이건 다른 사람에게 내려진 지시입니다',
        at: '2026-08-20T00:00:00.000Z', by: 'kim@daesung.co.kr', canceledAt: null,
      }]);
    },
  });
  eq('★ 같은 공정 · 같은 교육이어도 남의 지시는 안 보인다',
    t.$('order-card').hidden, true);
  ok('★ 남의 메모가 화면에 새어 나오지 않는다',
    !text(t.win.document.querySelector('main')).includes('다른 사람에게 내려진'),
    text(t.$('order-list')));
}

{
  /* ★ 지시 뒤에 통과하면 저절로 사라진다 — 해소를 따로 저장하지 않는다 */
  const t = asWorker11({
    before(win) {
      win.Store.progress.update((list) => {
        const row = list.find((r) => r.workerId === 'W-4821-11' && r.courseId === 'c-paint');
        row.quiz = { score: 100, passed: true, answers: [1, 1],
          at: '2026-08-20T00:00:00.000Z', attempt: 2, firstPassed: false };
      });
    },
  });
  eq('★ 지시 뒤에 통과하면 지시가 사라진다', t.$('order-card').hidden, true);
  eq('★ 그래도 지시 기록 자체는 남아 있다', t.win.Store.orders.load().length, 1);
}

{
  /* ★ 지시보다 앞선 통과로는 사라지지 않는다 */
  const t = asWorker11({
    before(win) {
      win.Store.progress.update((list) => {
        const row = list.find((r) => r.workerId === 'W-4821-11' && r.courseId === 'c-paint');
        row.quiz = { score: 100, passed: true, answers: [1, 1],
          at: '2026-08-01T00:00:00.000Z', attempt: 2, firstPassed: false };
      });
    },
  });
  eq('★ 지시 전에 통과한 기록으로는 안 사라진다', t.$('order-card').hidden, false);
}

{
  /* 거둔 지시는 안 뜬다 */
  const t = asWorker11({
    before(win) {
      win.Store.orders.update((list) => {
        list[0].canceledAt = '2026-08-20T00:00:00.000Z';
      });
    },
  });
  eq('★ 거둔 지시는 노동자 화면에서 사라진다', t.$('order-card').hidden, true);
}

{
  /* 지시가 없으면 빈 칸을 만들지 않는다 */
  const t = asWorker11({ before(win) { win.Store.orders.save([]); } });
  eq('★ 지시가 없으면 칸을 통째로 감춘다', t.$('order-card').hidden, true);
}

report('노동자 화면 4개 — 홈 · 신고 · 소통 · 마이');
