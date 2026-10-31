/* 브라우저 없이 실제 DOM 에서 화면 스크립트를 돌리는 공용 하네스.
   프로젝트에는 의존성을 넣지 않는다 — jsdom 은 이 스크래치패드에만 있다. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

/* IMP-1 — 경로를 박지 않는다. 저장소를 어디에 복사해도, CI 에서도 그대로 돈다 */
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function boot(pageRelPath, opts = {}) {
  // ?course=... 같은 쿼리는 URL 에만 붙이고 파일 경로에서는 뗀다
  const [filePart, queryPart] = pageRelPath.split('?');
  const html = fs.readFileSync(path.join(SRC, filePart), 'utf8');
  const errors = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (m) => errors.push(String(m)));

  const dom = new JSDOM(html, {
    url: 'https://test.local/' + filePart + (queryPart ? '?' + queryPart : ''),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });

  const win = dom.window;
  win.scrollTo = () => {};

  /* location.href 대입은 jsdom 이 구현하지 않고 window.location 은 재정의도 막혀 있다.
     그래서 화면 스크립트를 함수로 감싸 인자 이름 location 으로 가린다.
     화면 코드는 이미 IIFE 라서 감싸도 동작이 같다. */
  const nav = [];
  const locShim = {
    protocol: 'https:',
    // QR 은 절대 주소를 만들어야 해서 origin·host 도 필요하다 (D1)
    origin: win.location.origin,
    host: win.location.host,
    hostname: win.location.hostname,
    pathname: win.location.pathname,
    search: win.location.search,
    get href() { return win.location.href; },
    set href(v) { nav.push(v); },
    replace: (v) => nav.push(v),
    assign: (v) => nav.push(v),
  };

  const run = (rel, { shimLocation = false } = {}) => {
    const code = fs.readFileSync(path.join(SRC, rel), 'utf8');
    if (!shimLocation) { win.eval(code); return; }
    win.__locShim = locShim;
    win.eval('(function (location) {\n' + code + '\n}).call(this, window.__locShim);');
  };

  // <head> 의 고정 3줄 순서를 그대로 재현한다
  run('assets/store.js');
  run('assets/auth.js');
  run('assets/i18n.js');   // 노동자 화면 <head> 에 실린다 (UI-1)
  run('assets/seed.js');
  run('assets/icons.js');  // ui.js 보다 먼저 실려야 한다 (선 아이콘)

  if (opts.seed !== false) win.Seed.fill();
  if (opts.login) {
    win.Store.session.save({ userId: opts.login, role: opts.role || 'worker', at: new Date().toISOString() });
  }
  if (opts.before) opts.before(win);

  run('assets/ui.js');
  run('assets/review.js');
  run('assets/diagrams.js');
  run('assets/qr.js');
  if (opts.page) run(opts.page, { shimLocation: true });

  return { dom, win, errors, nav, run, $: (id) => win.document.getElementById(id) };
}

/* 아이콘 이름 — 선 아이콘(icons.js)이 붙었으면 data-icon, 아니면 글자 그대로.

   ★ 검사가 이모지 글자를 단정하면, 그림을 바꾸는 순간 전부 깨진다.
     그런데 깨진 검사가 지키던 것은 "이 자리에 뜻이 맞는 그림이 있는가" 였다.
     이름으로 견주면 그림을 바꿔도 그 뜻이 남는다.
     (test-i18n.js 가 한국어 글자 대신 사전을 견주는 것과 같은 이유다.) */
function iconName(node) {
  if (!node) return '';
  const tag = node.tagName ? String(node.tagName).toLowerCase() : '';
  const svg = tag === 'svg' ? node
    : (node.querySelector ? node.querySelector('svg[data-icon]') : null);
  if (svg) return svg.getAttribute('data-icon') || '';
  return (node.textContent || '').trim();
}

/* 안에 든 아이콘 이름 전부 (칩 여러 개가 든 칸을 볼 때) */
function iconNames(node) {
  if (!node || !node.querySelectorAll) return [];
  return [...node.querySelectorAll('svg[data-icon]')]
    .map((s) => s.getAttribute('data-icon'));
}

// --- 아주 작은 단정 도구 ---
let pass = 0;
const fails = [];

function ok(label, cond, extra) {
  if (cond) { pass++; return true; }
  fails.push(label + (extra ? '  →  ' + extra : ''));
  return false;
}

function eq(label, actual, expected) {
  return ok(label, actual === expected, `기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
}

function has(label, haystack, needle) {
  return ok(label, String(haystack).indexOf(needle) !== -1,
    `"${needle}" 가 없음. 실제: ${JSON.stringify(String(haystack).slice(0, 160))}`);
}

function report(title) {
  console.log(`\n===== ${title} =====`);
  console.log(`통과 ${pass}건, 실패 ${fails.length}건`);
  if (fails.length) {
    fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exitCode = 1;
  }
  return fails.length === 0;
}

module.exports = { boot, ok, eq, has, report, ROOT, SRC, iconName, iconNames };
