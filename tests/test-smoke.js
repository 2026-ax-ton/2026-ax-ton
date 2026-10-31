/* 회귀 검사 — ui.js · seed.js 를 고쳤으니 11개 화면 전부 오류 없이 뜨는지 본다.
   다른 세 분 담당 화면이 내 변경으로 깨지면 안 된다. */
const { boot, ok, eq, has, report, iconName, SRC } = require('./harness');

const PAGES = [
  ['worker/home.html',      'worker/home.js',      'W-4821-07'],
  ['worker/learn.html',     'worker/learn.js',     'W-4821-07'],
  ['worker/quiz.html',      'worker/quiz.js',      'W-4821-07'],
  ['worker/report.html',    'worker/report.js',    'W-4821-07'],
  ['worker/talk.html',      'worker/talk.js',      'W-4821-07'],
  ['worker/my.html',        'worker/my.js',        'W-4821-07'],
  ['admin/setup.html',      'admin/setup.js',      'kim@daesung.co.kr'],
  ['admin/dashboard.html',  'admin/dashboard.js',  'kim@daesung.co.kr'],
  ['admin/content.html',    'admin/content.js',    'kim@daesung.co.kr'],
  ['admin/proof.html',      'admin/proof.js',      'kim@daesung.co.kr'],
  ['admin/library.html',    'admin/library.js',    'oper@safety.kr'],
];

PAGES.forEach(([html, js, login]) => {
  let t;
  try {
    t = boot(html, {
      login,
      role: login.includes('@') ? (login.startsWith('oper') ? 'operator' : 'admin') : 'worker',
      page: js,
    });
  } catch (e) {
    ok(`${html} 이 뜬다`, false, e.message);
    return;
  }
  ok(`${html} 오류 0건`, t.errors.length === 0, t.errors.join(' | '));
  ok(`${html} 상단 머리띠가 채워진다`,
    (t.$('head-site') || {}).textContent !== '',
    JSON.stringify((t.$('head-site') || {}).textContent));
});

/* -------------------------------------------------------------------
   ui.js 에 더한 것이 기존 함수를 건드리지 않았는지
   ------------------------------------------------------------------- */
{
  const t = boot('worker/learn.html', { login: 'W-4821-07' });
  const UI = t.win.UI;
  const before = ['$', '$$', 'el', 'badge', 'okBadge', 'waitBadge', 'stopBadge', 'neutralBadge',
    'phraseBadge', 'chip', 'checkedValues', 'pickedValue', 'fillSelect', 'toast',
    'emptyRow', 'itemRow', 'fillAdminBar', 'fillWorkerBar', 'markCurrentTab',
    'warnIfBlocked', 'formatDate'];
  ok('원래 있던 UI 함수 21개가 그대로 있다',
    before.every((k) => typeof UI[k] === 'function'),
    JSON.stringify(before.filter((k) => typeof UI[k] !== 'function')));

  const added = ['speak', 'stopSpeak', 'audioButton', 'hasVoice', 'onVoicesReady', 'voiceNote',
    'voiceNoteKey', 'voiceSilent', 'voiceFallback', 'notifyVoice'];
  ok('음성 함수 10개가 새로 들어왔다',
    added.every((k) => typeof UI[k] === 'function'),
    JSON.stringify(added.filter((k) => typeof UI[k] !== 'function')));

  // jsdom 에는 speechSynthesis 가 없다 — 없는 환경에서 죽지 않아야 한다
  let threw = null;
  try {
    UI.speak({ text: '시험', lang: 'km' });
    UI.stopSpeak();
    UI.hasVoice('km');
    UI.onVoicesReady(() => {});
  } catch (e) { threw = e.message; }
  ok('음성이 없는 환경에서도 예외를 던지지 않는다', threw === null, threw);
  /* ★ jsdom 에는 speechSynthesis 가 아예 없다 — "기능이 없는 브라우저" 와 같은 상태다.
     문제만 알리고 끝내지 않는다. 빠져나갈 길을 함께 준다.

     ★ 검사에 한국어를 박지 않는다 (test-i18n.js 와 같은 규칙).
       화면에 나오는 글자는 이 사람의 언어(크메르어)다. 한국어로 견주면
       번역을 고칠 때마다 검사가 깨지고, 그러면 번역을 막는 검사가 된다.
       빠져나갈 길이 있는지는 사전의 한국어 원문에서 본다 — 원문은
       번역돼도 바뀌지 않으므로 이 단정은 썩지 않는다. */
  const I = t.win.I18N;
  eq('음성을 못 쓰면 그 사실을 그 사람의 언어로 말한다',
    UI.voiceNote('km'), I.t('voice.blocked', 'km'));
  ok('★ 한국어 원문이 그대로 나오지 않는다 (번역이 실제로 쓰인다)',
    UI.voiceNote('km') !== I.t('voice.blocked', 'ko'));
  has('★ 빠져나갈 길까지 알려 준다', I.t('voice.blocked', 'ko'), '다른 브라우저');
  eq('음성을 못 쓰는 상태로 본다', UI.voiceBlocked(), true);
}

/* -------------------------------------------------------------------
   seed.js 데이터 계약 — 키의 모양이 유지되는지
   ------------------------------------------------------------------- */
{
  const t = boot('worker/learn.html', { login: 'W-4821-07' });
  const S = t.win.Store;

  eq('accounts 6개', S.accounts.load().length, 6);   // 한국인 노동자 W-4821-31 이 늘었다
  eq('설비 3대', S.setup.load().equipments.length, 3);
  eq('안전 문구 6개', S.library.load().length, 6);
  eq('교육 2개', S.courses.load().length, 2);
  eq('수강 이력 3건', S.progress.load().length, 3);
  eq('신고 2건', S.reports.load().length, 2);
  eq('게시글 2건', S.posts.load().length, 2);

  /* 9·10번째 키 (덩어리 2에서 늘렸다) */
  eq('재교육 지시 1건', S.orders.load().length, 1);
  const order = S.orders.load()[0];
  ok('지시가 사람과 교육을 가리킨다',
    !!order.workerId && !!order.courseId, JSON.stringify(order));
  ok('★ 지시에 "완료" 필드가 없다 — 해소는 progress 로 판정한다',
    !('doneAt' in order) && !('done' in order), JSON.stringify(order));

  /* ★ prefs 는 기기 설정이라 예시 데이터가 건드리지 않는다.
       채운다고 저시력 사용자가 키워 놓은 글자가 되돌아가면 안 된다. */
  eq('글자 크기 기본값', S.prefs.load().fontScale, 'normal');
  ok('글자 크기 후보가 셋', S.FONT_SCALES.length === 3, JSON.stringify(S.FONT_SCALES));

  /* ★ 내 언어 음성이 이 기기에 없을 때의 기본은 "소리 안 냄" 이다.
       뜻이 닿지 않는 소리가 나면 사람은 "들었다" 고 생각하고 넘어간다.
       기본을 'ko' 로 되돌리면 이 기능이 있는 이유가 사라진다. */
  eq('★ 음성 되돌림 기본값은 소리 안 냄', S.prefs.load().voiceFallback, 'silent');
  eq('후보가 둘 (silent · ko)', S.VOICE_FALLBACKS.join(','), 'silent,ko');

  S.prefs.save({ fontScale: 'large' });
  S.prefs.save({ fontScale: 'large' });
  t.win.Seed.fill();
  eq('★ 예시 데이터를 채워도 글자 크기는 그대로다', S.prefs.load().fontScale, 'large');

  ok('★ 이상한 값은 기본값으로 되돌린다',
    (S.prefs.save({ fontScale: 'huge' }), S.prefs.load().fontScale === 'normal'),
    S.prefs.load().fontScale);

  ok('★ 음성 되돌림도 이상한 값은 기본값으로 되돌린다',
    (S.prefs.save({ voiceFallback: 'en' }), S.prefs.load().voiceFallback === 'silent'),
    S.prefs.load().voiceFallback);

  // progress 의 기존 필드가 그대로인지 (P3·P4 가 읽는 모양)
  const rows = S.progress.load();
  ok('progress 기존 필드 유지',
    rows.every((r) => ['workerId', 'courseId', 'lang', 'learnedAt', 'quiz'].every((k) => k in r)));
  const done = rows.filter((r) => r.quiz);
  ok('quiz 기존 네 필드 유지',
    done.every((r) => ['score', 'passed', 'answers', 'at'].every((k) => k in r.quiz)));
  ok('quiz 에 attempt · firstPassed 가 더해졌다',
    done.every((r) => 'attempt' in r.quiz && 'firstPassed' in r.quiz));

  // 최초 통과율을 계산할 수 있는지 — P3 대시보드가 이 값으로 그린다
  const firstPass = done.filter((r) => r.quiz.firstPassed).length;
  eq('최초 통과 1건 / 검증 2건 → 50%', Math.round((firstPass / done.length) * 100), 50);

  // 신고는 익명이어야 한다
  const reports = S.reports.load();
  ok('★ reports 에 신고자를 식별할 값이 없다',
    reports.every((r) => !('workerId' in r) && !('author' in r) && !('userId' in r)),
    JSON.stringify(reports.map(Object.keys)));

  /* 오역 문구는 사용 중지여야 한다.
     ★ ph-3 은 인도네시아어 번역만 뜻이 뒤집혔다. 그 언어만 내려가고
       한국어·크메르어는 계속 나간다 — 문구 전체를 내리면 크메르어 노동자도
       이 안전 지시를 못 듣고, 그것은 오역보다 나은 상태가 아니다. */
  const ph3 = S.library.load().find((p) => p.id === 'ph-3');
  eq('★ 뜻이 뒤집힌 인도네시아어는 나가지 않는다', S.phraseOk(ph3, 'id'), false);
  eq('★ 크메르어는 계속 나간다', S.phraseOk(ph3, 'km'), true);
  eq('한국어 원문도 계속 나간다', S.phraseOk(ph3, 'ko'), true);
  eq('신고에 어느 언어인지 남아 있다', ph3.flags[0].lang, 'id');
}

/* -------------------------------------------------------------------
   내보내기 / 불러오기 — 기기 사이를 옮길 때 무엇이 빠지는가

   ★ 서버가 없으므로 이것이 기기 사이를 옮기는 유일한 통로다
     (docs/09-handover.md · CLAUDE.md). 그런데 여기서 조용히 빠지는 칸이
     있으면, 옮긴 사람은 없어진 줄도 모른다. 실제로 orders(재교육 지시)가
     빠져 있었고 어떤 검사도 그것을 보지 않았다.

   ★ prefs 는 빠지는 것이 맞다 — 글자 크기와 음성 되돌림은 계정이 아니라
     그 기기의 설정이다. "빠졌다" 와 "일부러 뺐다" 를 검사가 갈라 놓는다.
   ------------------------------------------------------------------- */
{
  const t = boot('admin/setup.html', { login: 'kim@daesung.co.kr', page: 'admin/setup.js' });
  const S = t.win.Store;

  const orderId = S.orders.load()[0].id;      // 예시 데이터의 재교육 지시
  const dumped = JSON.parse(S.exportAll());

  /* 초기화(ALL)가 지우는 칸과 내보내기(PAIRS)가 담는 칸이 어긋나면
     "지워지긴 하는데 백업에는 없는" 데이터가 생긴다. */
  const CARRIED = ['accounts', 'session', 'setup', 'library',
                   'courses', 'progress', 'reports', 'posts', 'orders'];
  CARRIED.forEach((key) => {
    ok('내보내기가 ' + key + ' 를 담는다', dumped[key] !== undefined,
      Object.keys(dumped).join(', '));
  });
  ok('★ prefs 는 일부러 담지 않는다 (그 기기의 설정이다)',
    dumped.prefs === undefined, Object.keys(dumped).join(', '));

  eq('★★ 재교육 지시가 내보내기에 담긴다', (dumped.orders || []).length, 1);

  /* 되불러왔을 때 살아 오는가 — 담기기만 하고 안 돌아오면 같은 사고다 */
  S.orders.save([]);
  eq('지웠으니 지금은 없다', S.orders.load().length, 0);

  const back = S.importAll(JSON.stringify(dumped));
  ok('불러오기가 성공한다', back.ok === true, JSON.stringify(back));
  eq('★★ 되불러오면 재교육 지시가 살아 온다', S.orders.load().length, 1);
  /* ★ 여기서 undefined 끼리 견주면 빠져 있어도 통과한다.
       그래서 내보내기 전에 붙들어 둔 id 와 견준다. */
  eq('지시의 내용도 그대로다', (S.orders.load()[0] || {}).id, orderId);
}

/* -------------------------------------------------------------------
   로그인 화면 — 첫 방문에 예시 데이터를 자동으로 채우는가 (V1)

   배포 주소에 QR 로 들어온 사람은 "예시 데이터 채우기" 버튼을 누를 수 없다.
   그렇다고 쓰던 데이터를 덮어쓰면 담당자가 등록한 사업장이 날아간다.
   두 가지가 동시에 참이어야 해서 둘 다 본다.
   ------------------------------------------------------------------- */
{
  // 빈 브라우저 — 저장된 것이 하나도 없는 상태로 연다
  const t = boot('index.html', { seed: false, page: 'assets/login.js' });

  ok('index.html 오류 0건', t.errors.length === 0, t.errors.join(' | '));
  eq('★ 첫 방문이면 계정이 채워진다', t.win.Store.accounts.load().length, 6);
  eq('시연 계정 목록에 6개가 그려진다',
    t.$('demo-accounts').querySelectorAll('li.demo-account').length, 6);
  eq('★ 채웠으면 채웠다고 화면에 적는다', t.$('seed-auto').hidden, false);
  ok('아직 로그인 화면에 머문다 (자동으로 넘어가지 않는다)',
    t.nav.length === 0, t.nav.join(' | '));

  // 다른 키도 함께 채워졌는가 — 계정만 있고 사업장이 없으면 로그인 직후 빈 화면이다
  eq('사업장도 함께 채워진다', t.win.Store.setup.load().site.name, '대성정밀');
  eq('안전 문구도 함께 채워진다', t.win.Store.library.load().length, 6);
}

{
  /* 이미 쓰던 브라우저 — 담당자가 사업장 이름을 고쳐 둔 상태.
     ★ 여기서 덮어쓰면 새로고침할 때마다 담당자의 등록이 예시로 되돌아간다. */
  const t = boot('index.html', {
    page: 'assets/login.js',
    before: (win) => {
      win.Store.setup.update((s) => { s.site.name = '한빛금속'; });
    },
  });

  eq('★ 쓰던 데이터를 덮어쓰지 않는다', t.win.Store.setup.load().site.name, '한빛금속');
  eq('덮어쓰지 않았으면 채웠다고 말하지도 않는다', t.$('seed-auto').hidden, true);
  eq('계정은 그대로 6개', t.win.Store.accounts.load().length, 6);
}

/* -------------------------------------------------------------------
   외부 요청 0건 — src 전체
   ------------------------------------------------------------------- */
{
  const fs = require('fs');
  const path = require('path');

  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

  const files = walk(SRC);
  const offenders = [];

  files.filter((f) => /\.(html|js|css)$/.test(f)).forEach((f) => {
    const body = fs.readFileSync(f, 'utf8');
    const rel = path.relative(SRC, f).replace(/\\/g, '/');
    // 주석 안의 URL(문서 참조)은 요청이 아니다. 실제로 불러오는 형태만 본다.
    if (/(?:src|href)\s*=\s*["']https?:/i.test(body)) offenders.push(rel + ' — 외부 src/href');
    if (/@import\s+url\(\s*["']?https?:/i.test(body)) offenders.push(rel + ' — 외부 @import');
    /* ★ sw.js 만 fetch 예외다 (E1).
       Service Worker 의 fetch(req) 는 남의 서버를 부르는 것이 아니라,
       브라우저가 이미 보내려던 같은 오리진 요청을 그대로 흘려보내는 것이다.
       이것을 막으면 오프라인 캐시가 성립하지 않는다.
       예외를 열었으니 아래에서 "같은 오리진만 가로채는지" 를 따로 본다 —
       통째로 빼면 나중에 sw.js 에 CDN 호출을 넣어도 통과한다. */
    /* ★ assets/net.js 가 두 번째 fetch 예외다 (2026-11-01, T11 · C06 D-030).
       **브라우저에서 우리 서버를 부르는 자리는 이 파일 하나다** — 로그인(T11)이
       생기면서 둘이 될 뻔해 한 곳으로 모았다. 제3자 요청이 아니다.
       예외를 열었으니 아래에서 따로 본다: 부르는 주소가 `/api` 와 우리 배포
       주소뿐인지, 그리고 **노동자 화면에는 실리지 않는지.**
       통째로 빼면 나중에 CDN 호출을 넣어도 통과한다. */
    const netRule = (rel === 'sw.js' || rel === 'assets/net.js')
      ? /\b(XMLHttpRequest|WebSocket|EventSource)\s*\(/
      : /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/;
    if (netRule.test(body)) offenders.push(rel + ' — 네트워크 호출');
    if (/^\s*(import|export)\s/m.test(body) && f.endsWith('.js')) offenders.push(rel + ' — ES 모듈');
  });

  ok('src 전체에 제3자 요청이 0건이다', offenders.length === 0, offenders.join(' | '));

  /* ── 예외를 연 만큼 좁게 본다 ──────────────────────────────────── */

  /* 1) 서버를 부르는 자리(net.js)가 쓰는 주소는 같은 출처 /api 와 우리 배포 주소뿐이다 */
  {
    const net = fs.readFileSync(path.join(SRC, 'assets/net.js'), 'utf8');
    const foreign = (net.match(/https?:\/\/[^\s'"`)]+/g) || [])
      .filter((u) => u.indexOf('https://2026-ax-ton.vercel.app') !== 0);
    eq('★ 서버를 부르는 자리가 쓰는 주소는 우리 배포 주소뿐이다', foreign.join(', '), '');
    ok('★ 공급사(Gemini)를 브라우저에서 직접 부르지 않는다 — 키가 새면 끝이다',
      !/googleapis|generativelanguage/.test(net));
    ok('★ 토큰을 주소가 아니라 헤더로 보낸다 (주소는 로그에 남는다)',
      /Authorization/.test(net) && !/token=/.test(net));

    const agent = fs.readFileSync(path.join(SRC, 'assets/agent.js'), 'utf8');
    ok('★ 에이전트는 같은 출처 /api 를 부른다',
      /['"]\/api\/translate['"]/.test(agent) && /['"]\/api\/backtranslate['"]/.test(agent));
    ok('★ 에이전트는 이제 직접 부르지 않는다 (net.js 를 거친다)',
      !/fetch\s*\(/.test(agent) && /Net\.post\(/.test(agent));
    ok('★ 공급사(Gemini)를 에이전트도 직접 부르지 않는다',
      !/googleapis|generativelanguage/.test(agent));
  }

  /* 2) ★★ 노동자 화면은 여전히 요청 0건이고 에이전트를 싣지 않는다 */
  ['home', 'learn', 'quiz', 'report', 'talk', 'my'].forEach((name) => {
    const html = fs.readFileSync(path.join(SRC, 'worker/' + name + '.html'), 'utf8');
    const js = fs.readFileSync(path.join(SRC, 'worker/' + name + '.js'), 'utf8');
    ok('노동자 ' + name + ': 에이전트를 싣지 않는다 (운영자 전용이다)',
      html.indexOf('agent.js') === -1);
    /* ★★ 서버를 부르는 자리조차 싣지 않는다 — 그래서 "요청 0건" 이 약속이 아니라 사실이다 */
    ok('노동자 ' + name + ': net.js 를 싣지 않는다 (서버를 부를 수단 자체가 없다)',
      html.indexOf('net.js') === -1);
    ok('노동자 ' + name + ': 네트워크 호출이 0건이다',
      !/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(js));
  });

  /* sw.js 는 fetch 예외를 받았다. 그 대가로 여기서 더 조인다. */
  {
    const swSrc = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
    const swUrls = swSrc.match(/https?:\/\/[^\s'")]+/g) || [];
    ok('sw.js 에 외부 주소가 0건이다', swUrls.length === 0, swUrls.join(', '));
    ok('★ sw.js 는 같은 오리진만 가로챈다 (fetch 예외를 받은 이유)',
      swSrc.indexOf('self.location.origin') !== -1);
  }

  // 주석은 규칙을 적어 둔 곳이라 위반이 아니다. 코드만 남기고 본다.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

  const jsFiles = files.filter((f) => f.endsWith('.js'));
  const inner = jsFiles.filter((f) => /innerHTML/.test(stripComments(fs.readFileSync(f, 'utf8'))))
    .map((f) => path.relative(SRC, f));
  ok('innerHTML 을 쓰는 파일이 없다', inner.length === 0, inner.join(', '));

  const direct = jsFiles
    .filter((f) => !/assets[\\/]store\.js$/.test(f))
    .filter((f) => /localStorage/.test(stripComments(fs.readFileSync(f, 'utf8'))))
    .map((f) => path.relative(SRC, f));
  ok('store.js 밖에서 localStorage 를 직접 부르지 않는다', direct.length === 0, direct.join(', '));
}

/* -------------------------------------------------------------------
   ★ 음성이 조용히 실패하지 않는가

   2026-08-25 폰 확인에서 나온 것 — 카카오톡 안에서 열리는 브라우저는
   speechSynthesis 가 있다고 대답하고, 목소리 목록도 주고, speak() 도 받아 놓고
   아무 소리도 내지 않는다. 그런데 현장에서 교육 링크를 보내는 가장 흔한 방법이
   카톡이다. 조용히 실패하면 글자를 못 읽는 사람은 아무것도 못 받은 채
   이해도 검증을 통과한다.

   그래서 브라우저 이름을 넘겨짚지 않고 실제 결과를 본다. 여기서 그 세 가지
   브라우저를 흉내 내서, 각각에 대해 화면이 무엇을 말하는지 본다.
   ------------------------------------------------------------------- */

/* mode: 'dead'  아무 신호도 안 준다 (카카오톡 안 브라우저)
         'alive' 정상으로 읽는다 (삼성 인터넷·크롬)
         'error' 못 읽겠다고 대답한다 */
function fakeSpeech(mode) {
  return {
    spoken: [],
    cancel() {},
    getVoices() { return [{ lang: 'ko-KR' }, { lang: 'km-KH' }]; },
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      this.spoken.push(u);
      if (mode === 'alive') { if (u.onstart) u.onstart(); if (u.onend) u.onend(); }
      if (mode === 'error') { if (u.onerror) u.onerror({ error: 'synthesis-failed' }); }
      // 'dead' 는 아무것도 하지 않는다 — 그게 이 검사의 핵심이다
    },
  };
}

function bootWithSpeech(mode) {
  return boot('worker/home.html', {
    login: 'W-4821-07',
    page: 'worker/home.js',
    before: (win) => {
      win.speechSynthesis = fakeSpeech(mode);
      win.SpeechSynthesisUtterance = function (text) { this.text = text; };
    },
  });
}

{
  /* ★ speechSynthesis 가 아예 없는 브라우저.
     "있다고 대답해 놓고 안 내는" 경우만 챙기고 이쪽을 빼면,
     글자를 못 읽는 사람은 여기서 또 조용히 아무것도 못 받는다.
     (아무것도 주입하지 않는다 — jsdom 이 그 상태다) */
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  eq('★ 음성 기능이 없으면 처음부터 못 쓰는 것으로 본다', t.win.UI.voiceBlocked(), true);
  const btn = t.win.document.querySelector('.btn-audio');
  ok('노동자 홈에 음성 버튼이 있다', !!btn);
  eq('★ 버튼이 처음부터 음소거 그림이다', iconName(btn), 'speaker-off');
  ok('★ 색만으로 구분하지 않는다', btn ? btn.classList.contains('is-mute') : false);
  eq('★ 화면에도 그 사람의 언어로 이유를 적는다',
    t.win.UI.voiceNote('km'), t.win.I18N.t('voice.blocked', 'km'));
}

{
  // 정상으로 읽는 브라우저에서는 아무 경고도 하지 않는다
  const t = bootWithSpeech('alive');
  t.win.UI.voiceWait(10);
  t.win.document.body.click();
  t.win.UI.speak({ text: '시험', lang: 'km' });
  eq('정상 브라우저는 문제 없음으로 본다', t.win.UI.voiceBlocked(), false);
  eq('정상 브라우저에서는 안내를 띄우지 않는다', t.win.UI.voiceNote('km'), '');
}

{
  // 못 읽겠다고 대답하는 브라우저 — 바로 알아챈다
  const t = bootWithSpeech('error');
  t.win.UI.voiceWait(10);
  t.win.document.body.click();
  t.win.UI.speak({ text: '시험', lang: 'km' });
  eq('★ 못 읽겠다고 하면 바로 알아챈다', t.win.UI.voiceBlocked(), true);
  eq('무엇을 하면 되는지 그 사람의 언어로 알려 준다',
    t.win.UI.voiceNote('km'), t.win.I18N.t('voice.blocked', 'km'));
}

{
  /* 저절로 읽는 것은 판정하지 않는다.
     멀쩡한 브라우저도 화면이 뜨자마자 나는 소리는 막는다.
     그것까지 "이 브라우저는 고장" 이라고 적으면 거짓말이 된다. */
  const t = bootWithSpeech('dead');
  t.win.UI.voiceWait(10);
  t.win.UI.speak({ text: '시험', lang: 'km' });   // 아무도 누르지 않았다
  eq('★ 누르지도 않았는데 고장이라고 하지 않는다', t.win.UI.voiceBlocked(), false);
}

/* =================================================================
   설비 앞 QR → 로그인 → 그 교육 (D1)

   ★ 여기가 뚫리면 QR 은 "로그인 화면으로 가는 그림" 이 된다.
     찍은 사람은 어느 설비를 찍었는지 잃고, 목록에서 찾아야 한다.
     글을 못 읽는 사람에게는 거기서 끝이다.
   ================================================================= */
{
  /* 로그인 안 한 채로 QR 주소를 열었을 때 어디로 보내는가.
     화면 스크립트는 돌리지 않는다 — 실제 브라우저는 여기서 이미 떠난다. */
  const t = boot('worker/learn.html?course=c-press', { seed: false });

  eq('★ 가려던 자리를 그대로 집어낸다',
    t.win.Auth.wantedPath(), 'worker/learn.html?course=c-press');

  const url = t.win.Auth.loginUrl();
  has('로그인 화면으로 보낸다', url, 'index.html');
  has('★ 어디로 가려던 것인지 함께 넘긴다', url, 'next=');
  has('★ 어느 교육인지도 남는다', decodeURIComponent(url), 'course=c-press');
  has('한 칸 위로 올라간다 (절대경로를 쓰지 않는다)', url, '../index.html');
}

{
  /* 로그인 화면 자체에서는 붙일 것이 없다 */
  const t = boot('index.html', { seed: false });
  eq('★ 로그인 화면에서는 next 를 만들지 않는다', t.win.Auth.wantedPath(), '');
  eq('그냥 로그인 화면', t.win.Auth.loginUrl(), 'index.html');
}

{
  /* 로그인하면 그리로 이어진다 */
  const t = boot('index.html?next=' + encodeURIComponent('worker/learn.html?course=c-press'),
    { page: 'assets/login.js' });

  t.$('login-id').value = 'W-4821-07';
  t.$('login-pw').value = '1234';
  t.$('form-login').dispatchEvent(new t.win.Event('submit', { bubbles: true, cancelable: true }));

  has('★ 로그인 뒤 찍은 그 교육으로 간다', t.nav.join(' | '), 'worker/learn.html?course=c-press');
}

{
  /* 이미 로그인돼 있으면 바로 그리로 */
  const t = boot('index.html?next=' + encodeURIComponent('worker/learn.html?course=c-press'),
    { login: 'W-4821-07', page: 'assets/login.js' });
  has('★ 이미 로그인돼 있으면 바로 간다', t.nav.join(' | '), 'course=c-press');
}

{
  /* ★ 남의 역할 화면으로는 보내지 않는다 */
  const t = boot('index.html?next=' + encodeURIComponent('admin/dashboard.html'),
    { login: 'W-4821-07', page: 'assets/login.js' });
  has('★ 노동자를 관리자 화면으로 보내지 않는다', t.nav.join(' | '), 'worker/home.html');
  ok('대시보드로 안 간다', t.nav.join(' | ').indexOf('dashboard') === -1, t.nav.join(' | '));
}

{
  /* ★★ 넘어온 값을 그대로 믿지 않는다.
       믿으면 링크 하나로 아무 데나 보낼 수 있게 된다. */
  const auth = boot('index.html', { page: 'assets/login.js', login: 'W-4821-07' }).win.Auth;

  const bad = [
    'https://example.com/',
    '//example.com/',
    'http://example.com',
    '../../etc/passwd',
    'worker/../admin/dashboard.html',
    'javascript:alert(1)',
    'index.html',
    'worker/home.html; drop',
  ];
  const survived = bad.filter((v) => auth.safeNext(v) !== '');
  ok('★ 우리 화면 경로가 아닌 값은 전부 버린다', survived.length === 0, survived.join(' | '));

  eq('우리 화면은 받는다', auth.safeNext('worker/learn.html?course=c-press'),
    'worker/learn.html?course=c-press');
  eq('쿼리 없는 것도 받는다', auth.safeNext('admin/dashboard.html'), 'admin/dashboard.html');
  eq('빈 값은 빈 값', auth.safeNext(''), '');
}

/* =================================================================
   PC / 모바일 두 벌 레이아웃 (D3)

   ★ jsdom 은 화면을 그리지 않는다. 그래서 "보기 좋은가" 는 여기서 못 본다.
     대신 **지켜야 하는 규칙이 CSS 에 실제로 있는지**를 글로 확인한다.
     특히 취약 항목이 PC 에서 반으로 줄어들지 않는가 — 그것이 줄면
     정보 위계가 뒤바뀌고, 담당자는 이수율만 보고 교육을 안 고친다.
   ================================================================= */
{
  const fs2 = require('fs');
  const path2 = require('path');
  const SRC2 = require('./harness').SRC;
  const read2 = (p) => fs2.readFileSync(path2.join(SRC2, p), 'utf8');

  const adminCss = read2('admin/admin.css');
  const workerCss = read2('worker/worker.css');

  /* @media (min-width: 1024px) { ... } 안쪽만 떼어 낸다 */
  function mediaBlock(css, query) {
    const at = css.indexOf(query);
    if (at === -1) return '';
    let depth = 0, start = -1;
    for (let i = at; i < css.length; i++) {
      if (css[i] === '{') { depth++; if (depth === 1) start = i + 1; }
      else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(start, i); }
    }
    return '';
  }

  const pc = mediaBlock(adminCss, '@media (min-width: 1024px)');
  ok('★ 관리자 화면에 넓은 화면용 규칙이 있다', pc.length > 0);

  /* ★★ 이 검사가 D3 에서 가장 중요하다 */
  const feature = /\.card\.feature\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(pc);
  ok('★★ PC 에서도 취약 항목은 한 줄 전체를 쓴다 (반으로 줄지 않는다)',
    feature, pc.slice(0, 200));

  has('★ 두 칸으로 나눈다', pc, 'grid-template-columns');
  has('★ 하단 탭바가 세로 메뉴가 된다', pc, '.tabbar.fixed');
  has('아래 탭바가 없으니 아래 여백을 줄인다', pc, 'padding-bottom');

  /* ★ 노동자 화면은 두 벌로 만들지 않는다 — 폰이 본체다 */
  const workerWide = mediaBlock(workerCss, '@media (min-width: 900px)');
  ok('노동자 화면에도 넓은 화면 규칙이 있다', workerWide.length > 0);
  has('★ 폰 너비로 가운데 모은다', workerWide, 'max-width');
  ok('★ 노동자 화면을 여러 칸으로 쪼개지 않는다',
    workerWide.indexOf('grid-template-columns') === -1, workerWide.slice(0, 200));

  /* ★ 되돌린 적 있는 그 파일을 다시 가져오지 않았다 (devlog 2026-08-19).
       주석에 이름이 나오는 것은 괜찮다 — 실제로 읽어 들이는지를 본다. */
  const cssFiles = ['assets/style.css', 'assets/style-admin.css', 'assets/app.css',
    'admin/admin.css', 'worker/worker.css'];
  const imported = cssFiles.filter((f) => /@import[^;]*style-pc/.test(read2(f)));
  ok('★ CSS 가 style-pc.css 를 읽어 들이지 않는다', imported.length === 0, imported.join(', '));

  const pages = ['admin/dashboard.html', 'admin/content.html', 'admin/proof.html',
    'admin/setup.html', 'admin/library.html', 'worker/home.html', 'index.html'];
  const linked = pages.filter((f) => /<link[^>]*style-pc/.test(read2(f)));
  ok('★ 화면이 style-pc.css 를 걸지 않는다', linked.length === 0, linked.join(', '));

  /* 터치 타깃 규칙은 좁은 화면에서 그대로다 —
     60px 을 푸는 것은 마우스로 쓰는 넓은 화면 안에서만이어야 한다 */
  const outsideMedia = adminCss.replace(pc, '');
  ok('★ 좁은 화면의 터치 타깃 규칙을 건드리지 않았다',
    outsideMedia.indexOf('min-height: 48px') === -1, 'min-height:48px 가 미디어 쿼리 밖에 있다');
}

/* 아무 신호도 안 주는 브라우저 — 기다려 봐야 알 수 있다.
   기다림이 필요해서 이 묶음의 마무리(report)를 여기 안에서 한다. */
{
  const t = bootWithSpeech('dead');
  t.win.UI.voiceWait(10);

  const before = t.win.document.querySelector('.btn-audio');
  ok('노동자 홈에 음성 버튼이 있다', !!before);
  eq('처음에는 스피커 그림이다', iconName(before), 'speaker');
  eq('누르기 전에는 고장이 아니다', t.win.UI.voiceBlocked(), false);

  if (before) before.click();          // 사람이 손으로 눌렀다

  setTimeout(() => {
    eq('★ 소리가 안 나면 알아챈다 (카카오톡 안 브라우저)', t.win.UI.voiceBlocked(), true);
    eq('★ 조용히 넘어가지 않고 화면에 적는다',
      t.win.UI.voiceNote('km'), t.win.I18N.t('voice.blocked', 'km'));
    has('★ 무엇을 하면 되는지 알려 준다',
      t.win.I18N.t('voice.blocked', 'ko'), '다른 브라우저');

    /* ★ 글자를 못 읽는 사람에게 문장은 닿지 않는다. 그림이 바뀌어야 한다. */
    const after = t.win.document.querySelector('.btn-audio');
    eq('★ 버튼 그림이 음소거로 바뀐다', iconName(after), 'speaker-off');
    ok('색만으로 구분하지 않는다 (표시용 class 도 붙는다)',
      after ? after.classList.contains('is-mute') : false);

    // 화면의 안내 줄이 실제로 채워졌는가 — 화면 코드를 손대지 않고도 따라와야 한다
    const note = t.$('voicenote');
    ok('★ 화면 안내 줄이 저절로 채워진다', note && !note.hidden && note.textContent !== '',
      JSON.stringify(note && note.textContent));

    report('회귀 — 화면 11개 · 데이터 계약 · 코드 규칙 · 음성 실패 감지');
  }, 80);
}
