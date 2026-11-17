/* 시연 자리에서 개발용 메모가 보이면 안 된다 (2026-08-30)

   화면 여덟 개의 맨 아래에는 "여기부터 채우시면 됩니다" 칸이 있다.
   남은 일을 적어 둔 개발용 메모다.

   · 지우면 무엇이 남았는지를 잃는다 (test-docs.js 가 그 칸을 지금도 본다)
   · 배포 주소에서 보이면 시연 중에 "아직 안 만든 화면" 으로 읽힌다

   그래서 지우지 않고 자리에 따라 감춘다. 이 묶음은 그 갈림이
   **양쪽 다** 맞는지 본다 — 배포에서 감춰지는 것만 보면 절반이다.
   개발 자리에서도 안 보이게 되면 남은 일을 영영 못 본다. */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { ok, eq, has, report, SRC } = require('./harness');

const ROOT = path.join(SRC, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SCREENS = ['worker/home', 'worker/report', 'worker/talk', 'worker/my'];


/* -------------------------------------------------------------------
   1. 어느 주소가 개발이고 어느 주소가 배포인가

   store.js 만 홀로 돌린다. <head> 첫 줄에서 정해지는 값이라
   화면이 그려지기 전에 이미 붙어 있어야 한다.
   ------------------------------------------------------------------- */

function envAt(url) {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
    { url, runScripts: 'outside-only', virtualConsole: vc });
  dom.window.eval(fs.readFileSync(path.join(SRC, 'assets/store.js'), 'utf8'));
  return {
    attr: dom.window.document.documentElement.getAttribute('data-env'),
    store: dom.window.Store.env,
    isDev: dom.window.Store.isDev,
  };
}

const DEV_URLS = [
  ['localhost',            'http://localhost:8899/index.html'],
  ['127.0.0.1',            'http://127.0.0.1:5500/worker/home.html'],
  ['검사 하네스(.local)',   'https://test.local/worker/home.html'],
  ['★ 브랜치 미리보기',     'https://2026-ax-ton-git-develop-byeonsoyun.vercel.app/worker/home.html'],
];

DEV_URLS.forEach(([label, url]) => {
  const e = envAt(url);
  eq(`개발 자리다 — ${label}`, e.attr, 'dev');
  eq(`Store.isDev 도 같이 참이다 — ${label}`, e.isDev, true);
});

const LIVE_URLS = [
  ['★ 배포 주소',          'https://2026-ax-ton.vercel.app/worker/home.html'],
  ['배포 주소 (하위 경로)', 'https://2026-ax-ton.vercel.app/admin/dashboard.html'],
];

LIVE_URLS.forEach(([label, url]) => {
  const e = envAt(url);
  eq(`배포 자리다 — ${label}`, e.attr, 'live');
  eq(`Store.isDev 가 거짓이다 — ${label}`, e.isDev, false);
});

/* ★ file:// 은 더블클릭 확인 방법 그 자체다. 여기서 메모가 안 보이면
     이 프로젝트에서 가장 빠른 확인 방법을 반쪽으로 만든다. */
{
  const e = envAt('file:///C:/Users/x/2026-ax-ton/src/worker/home.html');
  eq('★ file:// 은 개발 자리다 (더블클릭 확인)', e.attr, 'dev');
}


/* -------------------------------------------------------------------
   2. 몰라도 감추는 쪽으로 기울어 있는가

   ★ 스크립트가 멈추거나 주소를 못 읽는 상황에서 메모가 튀어나오면
     그 자리가 하필 시연이다. 실패의 방향을 한쪽으로 고정해 둔다.
   ------------------------------------------------------------------- */
{
  const css = read('src/assets/app.css');

  ok('★ CSS 기본값이 "감춤" 이다 (.todo { display: none })',
    /\.todo\s*\{\s*display:\s*none;?\s*\}/.test(css));

  ok('★ 다시 보이는 것은 data-env="dev" 일 때뿐이다',
    /html\[data-env="dev"\]\s+\.todo\s*\{[^}]*display:\s*block/.test(css));

  /* 감추는 규칙이 나중에 붙은 규칙에 덮이면 조용히 다시 보인다 */
  const showAll = /(^|\})\s*\.todo\s*\{[^}]*display:\s*(block|flex|grid)/m.test(css);
  ok('★ .todo 를 조건 없이 다시 켜는 규칙이 없다', !showAll);

  const store = read('src/assets/store.js');
  has('★ 모르면 감추는 쪽으로 간다 (catch 에서 live)', store, "return 'live';");
}


/* -------------------------------------------------------------------
   3. 감췄을 뿐 지우지는 않았는가

   감추는 것과 없애는 것은 다르다. 없애면 무엇이 남았는지를 잃는다.
   ------------------------------------------------------------------- */
{
  const missing = SCREENS.filter((f) => !read('src/' + f + '.html').includes('여기부터 채우시면 됩니다'));
  ok('★ 노동자 네 화면에 메모가 그대로 남아 있다 (지운 것이 아니다)',
    missing.length === 0, missing.join(', '));

  /* `class="todo"` 뿐 아니라 `class="todo noprint"` 도 있다 — 목록 안에 있으면 된다 */
  const notGated = SCREENS.filter((f) => !/class="(todo|todo .*?|.*? todo|.*? todo .*?)"/.test(read('src/' + f + '.html')));
  ok('★ 남은 칸이 모두 .todo 로 묶여 있다 (안 묶이면 감춰지지 않는다)',
    notGated.length === 0, notGated.join(', '));
}


/* -------------------------------------------------------------------
   4. 화면에서 실제로 어떻게 되는가

   ★ 규칙만 보면 "CSS 는 맞는데 화면에는 안 걸린" 경우를 놓친다.
     실제 화면 파일을 띄워 <html> 에 표가 붙는지 본다.
     (jsdom 은 외부 CSS 를 계산하지 않으므로 표까지만 본다.)
   ------------------------------------------------------------------- */
{
  const { boot } = require('./harness');
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });

  eq('검사 하네스에서 화면은 개발 자리로 뜬다',
    t.win.document.documentElement.getAttribute('data-env'), 'dev');

  const box = t.win.document.querySelector('.todo');
  ok('메모 칸이 화면에 그대로 있다', !!box);
  ok('메모 칸을 hidden 으로 지워 버리지 않았다 — 감추는 것은 CSS 의 일이다',
    box ? !box.hasAttribute('hidden') : false);
}


/* -------------------------------------------------------------------
   5. 배포 주소가 바뀌면 여기서 걸린다

   ★ 주소를 갈아 끼우고 store.js 를 안 고치면, 새 주소가 "개발" 로 잡혀
     시연에서 메모가 다시 보인다. 문서와 코드를 묶어 둔다.
   ------------------------------------------------------------------- */
{
  const claude = read('CLAUDE.md');
  has('배포 주소가 CLAUDE.md 에 적힌 그대로다', claude, '2026-ax-ton.vercel.app');

  const handover = read('docs/09-handover.md');
  has('★ 인계 문서에 이 갈림이 적혀 있다', handover, 'data-env');
}

report('시연 — 개발용 메모가 배포 주소에서 보이지 않는가');
