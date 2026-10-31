/* 오프라인 우선 동작 (E1) — Service Worker 가 화면을 담아 두는가

   jsdom 은 Service Worker 를 돌리지 않는다. 그래서 여기서 보는 것은 둘이다.

     1. sw.js 를 글로 읽어 규칙이 있는지  (D3 에서 CSS 를 글로 읽은 것과 같다)
     2. navigator.serviceWorker 가 없는 환경(= file:// 와 같은 처지)에서
        화면 13개가 그대로 뜨는지

   ★ 이 묶음에서 가장 중요한 것은 "담을 목록이 실제 파일과 일치하는가" 다.
     새 화면을 만들고 목록에 안 넣으면 그 화면만 오프라인에서 안 열리는데,
     온라인에서는 멀쩡해서 사람 눈으로는 거의 못 잡는다. */
const fs = require('fs');
const path = require('path');
const { boot, ok, eq, has, report, SRC } = require('./harness');

const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
const ui = fs.readFileSync(path.join(SRC, 'assets/ui.js'), 'utf8');

/* =================================================================
   1. ★★ 담을 목록이 src/ 의 실제 파일과 일치하는가
   ================================================================= */
{
  // src/ 를 훑어 화면 파일을 전부 모은다 (sw.js 자신과 문서는 뺀다)
  const walk = (dir, base) => {
    let out = [];
    fs.readdirSync(path.join(SRC, dir || '.'), { withFileTypes: true }).forEach((e) => {
      const rel = base ? base + '/' + e.name : e.name;
      if (e.isDirectory()) { out = out.concat(walk(rel, rel)); return; }
      if (!/\.(html|css|js)$/.test(e.name)) return;   // README.md · .gitkeep 제외
      if (rel === 'sw.js') return;                    // 자신은 담지 않는다
      out.push(rel);
    });
    return out;
  };
  const real = walk('', '').sort();

  // sw.js 의 PRECACHE 배열을 글로 읽는다
  const from = sw.indexOf('var PRECACHE');
  const block = sw.slice(from, sw.indexOf('];', from));
  const listed = (block.match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));

  ok('PRECACHE 목록을 읽었다', listed.length > 0, String(listed.length));
  ok('루트를 담는다 — 주소 끝이 / 인 첫 방문', listed.indexOf('./') !== -1);

  const missing = real.filter((f) => listed.indexOf(f) === -1);
  ok('★★ src/ 의 화면 파일이 전부 담긴다 (하나라도 빠지면 그 화면만 오프라인에서 안 열린다)',
    missing.length === 0, '빠진 것: ' + missing.join(', '));

  const ghost = listed.filter((f) => f !== './' && real.indexOf(f) === -1);
  ok('없는 파일을 담으라고 하지 않는다 (cache.addAll 은 하나만 없어도 통째로 실패한다)',
    ghost.length === 0, '없는데 적힌 것: ' + ghost.join(', '));

  ok('sw.js 자신은 담지 않는다 (담으면 갱신 통로가 막힌다)',
    listed.indexOf('sw.js') === -1);

  // 갈래별 개수 — 위 대조가 먼저 잡지만, 어느 갈래가 비었는지 바로 보이게 세어 둔다
  eq('화면 HTML 13개', listed.filter((f) => /\.html$/.test(f)).length, 13);
  eq('CSS 5개', listed.filter((f) => /\.css$/.test(f)).length, 5);
  eq('JS 23개 (공용 12 · 화면 11)', listed.filter((f) => /\.js$/.test(f)).length, 23);
}

/* =================================================================
   2. sw.js 가 이 프로젝트의 규칙을 지키는가
   ================================================================= */
{
  ok('ES 모듈을 쓰지 않는다', !/^\s*(import|export)\s/m.test(sw));

  // 외부 요청 0건 — 남의 오리진 주소가 코드에 있으면 안 된다
  const urls = sw.match(/https?:\/\/[^\s'")]+/g) || [];
  ok('외부 주소가 0건이다', urls.length === 0, urls.join(', '));

  has('같은 오리진만 가로챈다', sw, 'self.location.origin');
  has('GET 만 담는다', sw, 'req.method !== ');

  /* ★ QR 로 들어오는 주소는 learn.html?course=c-press 라 learn.html 과 키가 다르다.
     이 옵션이 없으면 QR 로 들어온 노동자만 오프라인에서 빈 화면을 본다 —
     설비 앞에서 QR 을 찍는 사람이 정확히 그 경우다. */
  has('★ 쿼리를 무시하고 찾는다 (QR 의 ?course=)', sw, 'ignoreSearch: true');

  has('판이 바뀌면 옛 캐시를 지운다', sw, 'caches.delete');
  has('캐시 이름에 판 번호가 붙는다', sw, 'VERSION');
  ok('★ skipWaiting 을 부르지 않는다 (보던 중에 파일이 갈리면 반쪽 화면이 된다)',
    !/self\.skipWaiting\s*\(/.test(sw));
  ok('남의 캐시는 지우지 않는다', sw.indexOf("indexOf('safety-') === 0") !== -1);
}

/* =================================================================
   3. ★ file:// 를 깨뜨리지 않는가 — 이 프로젝트의 확인 방법 전체다
   ================================================================= */
{
  const from = ui.indexOf('function registerSW');
  const reg = ui.slice(from, ui.indexOf('function offlineReady'));

  ok('registerSW 를 찾았다', from !== -1 && reg.length > 0);
  has('★ https 일 때만 등록한다 (file:// 에서는 부르지 않는다)', reg, "location.protocol !== 'https:'");
  has('navigator.serviceWorker 가 없으면 그만둔다', reg, '!navigator.serviceWorker');
  has('★ try/catch 로 감싼다 (부르는 것만으로 예외가 나는 브라우저가 있다)', reg, 'try {');
  has('등록 실패가 화면을 멈추지 않는다', reg, '.catch(');
  ok('절대경로 /sw.js 를 쓰지 않는다 (file:// 에서 깨진다)', !/['"]\/sw\.js['"]/.test(ui));
  ok('상대경로로 만든다', ui.indexOf("'../'") !== -1 && ui.indexOf("'./'") !== -1);
}

/* =================================================================
   4. 끊긴 것을 조용히 넘기지 않는가
   ================================================================= */
{
  const b = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  const win = b.win;

  ok('화면 스크립트가 오류 없이 돌았다', b.errors.length === 0, b.errors.join(' | '));

  // jsdom 에는 navigator.serviceWorker 가 없다 — file:// 와 같은 처지다
  eq('담긴 것이 없으면 offlineReady 는 거짓', win.UI.offlineReady(), false);

  /* ★ 담기지 않았는데 "오프라인 가능" 이라고 적으면 화면이 거짓말을 한다.
     B4 에서 이 배지를 일부러 뺀 이유가 바로 그것이었다. */
  const okBox = b.$('offline-ok');
  ok('배지 자리가 화면에 있다', okBox !== null);
  ok('★ 담기지 않았으면 "오프라인 가능" 배지를 그리지 않는다', okBox && okBox.hidden === true);
  ok('배지 자리에 글자가 남아 있지 않다', okBox && okBox.textContent === '');

  // 온라인일 때는 띠가 없다
  eq('온라인이면 안내 문장이 비어 있다', win.UI.offlineNote(), '');

  // 끊어 본다
  Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });
  win.UI.renderOffline();

  const bar = win.document.querySelector('.offline-note');
  ok('끊기면 띠가 뜬다', bar !== null && bar.hidden === false);
  has('끊겼다고 말한다', bar ? bar.textContent : '', '인터넷이 끊겼습니다');
  ok('아이콘 + 글자 3중이다 (색만으로 구분하지 않는다)',
    bar !== null && bar.textContent.indexOf('오프라인') !== -1 &&
    bar.querySelector('[aria-hidden="true"]') !== null);

  /* ★ 담기지 않은 채 끊긴 것과, 담긴 채 끊긴 것은 다른 상황이다.
     둘을 같은 문장으로 말하면 한쪽은 거짓말이 된다. */
  has('★ 담기지 않았으면 다음 화면이 안 열릴 수 있다고 말한다',
    bar ? bar.textContent : '', '열리지 않을 수 있습니다');
  ok('아직 담기지 않았는데 "그대로 이어집니다" 라고 하지 않는다',
    bar !== null && bar.textContent.indexOf('그대로 이어집니다') === -1);

  // 담긴 상태로 바꿔 본다
  win.navigator.serviceWorker = { controller: {} };
  eq('controller 가 있으면 offlineReady 는 참', win.UI.offlineReady(), true);
  has('담겼으면 이어진다고 말한다', win.UI.offlineNote(), '그대로 이어집니다');

  // 배지도 그때만 뜬다 — 화면을 다시 그린다
  b.run('worker/home.js', { shimLocation: true });
  const okBox2 = b.$('offline-ok');
  ok('★ 담겼으면 "오프라인 가능" 배지가 뜬다', okBox2 && okBox2.hidden === false);
  has('배지에 글자가 함께 있다 (내 언어로)', okBox2 ? okBox2.textContent : '',
    win.I18N.t('home.offlineOk'));
  has('★ 처음 한 번은 인터넷이 필요하다고 적는다',
    okBox2 ? okBox2.textContent : '', '처음 한 번만 인터넷이 필요합니다');
  ok('배지 아이콘이 aria-hidden 이다 (읽어 주는 데 기호가 섞이지 않는다)',
    okBox2 !== null && okBox2.querySelector('[aria-hidden="true"]') !== null);
}

/* =================================================================
   5. serviceWorker 가 없는 환경에서 13화면이 그대로 뜨는가
      = file:// 로 더블클릭했을 때와 같은 처지
   ================================================================= */
{
  const PAGES = [
    ['index.html', null, null, null],
    ['signup.html', null, null, null],
    ['worker/home.html', 'W-4821-07', 'worker', 'worker/home.js'],
    ['worker/learn.html', 'W-4821-07', 'worker', 'worker/learn.js'],
    ['worker/quiz.html', 'W-4821-07', 'worker', 'worker/quiz.js'],
    ['worker/report.html', 'W-4821-07', 'worker', 'worker/report.js'],
    ['worker/talk.html', 'W-4821-07', 'worker', 'worker/talk.js'],
    ['worker/my.html', 'W-4821-07', 'worker', 'worker/my.js'],
    ['admin/setup.html', 'kim@daesung.co.kr', 'admin', 'admin/setup.js'],
    ['admin/dashboard.html', 'kim@daesung.co.kr', 'admin', 'admin/dashboard.js'],
    ['admin/content.html', 'kim@daesung.co.kr', 'admin', 'admin/content.js'],
    ['admin/proof.html', 'kim@daesung.co.kr', 'admin', 'admin/proof.js'],
    ['admin/library.html', 'oper@safety.kr', 'operator', 'admin/library.js'],
  ];

  PAGES.forEach((row) => {
    const page = row[0], login = row[1], role = row[2], script = row[3];
    const opts = {};
    if (login) { opts.login = login; opts.role = role; }
    if (script) opts.page = script;
    const b = boot(page, opts);
    ok(page + ' 이 serviceWorker 없이도 뜬다', b.errors.length === 0, b.errors.join(' | '));
  });
}

report('오프라인 — 인터넷이 끊겨도 화면이 열리는가 (E1)');
