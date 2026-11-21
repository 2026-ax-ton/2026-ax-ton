/* 하단 탭 막대 — **못 들어가는 탭을 보여 주지 않는가** (2026-11-15 사용자 보고)

   무엇이 문제였나
     탭 막대는 관리자 화면 7개에 **똑같은 markup** 으로 박혀 있는데 역할을
     보지 않았다. 그래서
       · 담당자(admin) 에게 「문구」가 보이고 — 누르면 대시보드로 되돌아온다
       · 운영자(operator) 에게 「대시보드」·「교육 콘텐츠」가 보인다
     가드(`Auth.require`)는 제대로 돌고 있었다. 보여 주면 안 되는 것을
     보여 준 것이 문제다. 사용자는 이것을 「문구 탭이 대시보드로 링킹된다」로 봤다.

   이 묶음이 지키는 것
     1. ★★ **보이는 탭은 전부 들어갈 수 있다** — 역할마다 확인한다
     2. ★★ **들어갈 수 있는 화면의 탭은 감추지 않는다** (반대쪽 실수)
     3. ★★ `ui.js` 의 `PAGE_ROLES` 가 **각 html 의 `Auth.require(...)` 와 같다**
        — 두 곳이라 한쪽만 고치면 여기서 깨진다
     4. ★ 노동자 탭 막대는 건드리지 않는다 (PAGE_ROLES 에 없는 주소)
     5. ★ 감춘 탭은 **읽어 주는 기계에도 안 보인다** (hidden 속성, CSS 로도 display:none)

   근거: C05 P-2(역할 경계) · A02 §4 · `src/assets/auth.js` require() */

const fs = require('fs');
const path = require('path');
const { boot, ok, eq, report, SRC } = require('./harness');

const ui = fs.readFileSync(path.join(SRC, 'assets/ui.js'), 'utf8');
const css = fs.readFileSync(path.join(SRC, 'assets/app.css'), 'utf8');

/** html 의 Auth.require(...) 를 읽는다 — 화면이 실제로 누구를 들이는가 */
function requiredRoles(page) {
  const html = fs.readFileSync(path.join(SRC, 'admin', page), 'utf8');
  const m = /Auth\.require\(([^)]*)\)/.exec(html);
  if (!m) return null;
  return Function('return [' + m[1].replace(/^\[|\]$/g, '') + ']')().flat();
}

/* =================================================================
   1. ★★ PAGE_ROLES 가 각 html 의 Auth.require 와 같다
   ================================================================= */
{
  const t = boot('admin/dashboard.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/dashboard.js' });
  const MAP = t.win.UI.PAGE_ROLES;
  ok('ui.js 가 PAGE_ROLES 를 내보낸다', !!MAP);

  const pages = fs.readdirSync(path.join(SRC, 'admin')).filter((f) => f.endsWith('.html'));
  eq('관리자 화면 7개를 모두 적었다', Object.keys(MAP).sort().join(','), pages.sort().join(','));

  pages.forEach((page) => {
    const real = requiredRoles(page);
    ok(`★★ ${page} — PAGE_ROLES 가 Auth.require 와 같다 (${real.join('·')})`,
      MAP[page] && MAP[page].slice().sort().join(',') === real.slice().sort().join(','),
      `적힌 것: ${(MAP[page] || []).join(',')} / 실제: ${real.join(',')}`);
  });
}

/* =================================================================
   2. ★★ 역할마다 — 보이는 길은 전부 들어갈 수 있고, 들어갈 수 있는 길은 보인다

   🆕 2026-11-17 — 담당자 화면은 탭 막대가 **그룹 메뉴**로 바뀌었다 (ui.js buildAdminMenu).
   막대일 때는 `hidden` 으로 감췄고, 메뉴는 **아예 그리지 않는다.** 지키는 것은 같다 —
   보이는 것은 전부 들어갈 수 있어야 하고, 들어갈 수 있는 것은 빠지면 안 된다.
   주소에 `#` 이 붙으므로 **파일 이름으로** 맞춘다.
   ================================================================= */
const fileOf = (a) => a.getAttribute('href').split('#')[0];

[
  { role: 'admin', login: 'kim@daesung.co.kr', page: 'admin/dashboard.html', script: 'admin/dashboard.js', label: '담당자' },
  { role: 'operator', login: 'oper@safety.kr', page: 'admin/library.html', script: 'admin/library.js', label: '운영자' }
].forEach((who) => {
  const t = boot(who.page, { login: who.login, role: who.role, page: who.script });
  const MAP = t.win.UI.PAGE_ROLES;
  const tabs = [...t.win.document.querySelectorAll('.tabbar a')];

  ok(`${who.label} — 길이 있다 (탭 막대 또는 그룹 메뉴)`, tabs.length > 0);

  const shown = tabs.filter((a) => !a.hidden).map(fileOf);
  const hidden = tabs.filter((a) => a.hidden).map(fileOf);

  const canOpen = (href) => !MAP[href] || MAP[href].indexOf(who.role) !== -1;

  ok(`★★ ${who.label} — 보이는 길은 전부 들어갈 수 있다 (${[...new Set(shown)].join(' ')})`,
    shown.every(canOpen), '못 들어가는데 보이는 것: ' + shown.filter((h) => !canOpen(h)).join(', '));

  ok(`★★ ${who.label} — 들어갈 수 있는 길을 감추지 않았다`,
    hidden.every((h) => !canOpen(h)), '들어갈 수 있는데 감춘 것: ' + hidden.filter(canOpen).join(', '));

  /* ★ 반대쪽 실수 — 거르다가 들어갈 수 있는 화면이 통째로 사라지면 안 된다.
     `scan.html`(설비 촬영)만 뺀다 — 메뉴에서 바로 가는 곳이 아니라 **설비 등록 안의 한 걸음**이다
     (설비 목록의 [카메라로 찍기] 가 그 설비 id 를 달고 연다). 설비 없이 열면 할 일이 없다. */
  const FLOW_ONLY = ['scan.html'];
  const reachable = Object.keys(MAP).filter((f) => canOpen(f) && FLOW_ONLY.indexOf(f) === -1);
  ok(`★★ ${who.label} — 들어갈 수 있는 화면 ${reachable.length}개가 모두 길에 있다`,
    reachable.every((f) => shown.indexOf(f) !== -1),
    '빠진 것: ' + reachable.filter((f) => shown.indexOf(f) === -1).join(', '));

  /* 지금 화면 표시 — 막대는 링크에, 그룹 메뉴는 그룹 단추에 붙는다 */
  const current = [...t.win.document.querySelectorAll('.tabbar [aria-current="page"]')];
  ok(`${who.label} — 지금 화면이 켜져 있다`, current.length > 0);
});

/* =================================================================
   3. 사용자가 본 그 증상 — 담당자에게 「문구」가 보이지 않는다
   ================================================================= */
{
  const t = boot('admin/dashboard.html', { login: 'kim@daesung.co.kr', role: 'admin', page: 'admin/dashboard.js' });
  const links = [...t.win.document.querySelectorAll('.tabbar a')];
  const lib = links.filter((a) => fileOf(a) === 'library.html');
  ok('★★ 담당자에게 「문구」로 가는 길이 하나도 없다 — 눌러 봐야 대시보드로 되돌아오던 것이다',
    lib.every((a) => a.hidden), '보이는 것: ' + lib.filter((a) => !a.hidden).length + '개');

  const t2 = boot('admin/library.html', { login: 'oper@safety.kr', role: 'operator', page: 'admin/library.js' });
  const links2 = [...t2.win.document.querySelectorAll('.tabbar a')];
  const dash = links2.filter((a) => fileOf(a) === 'dashboard.html');
  ok('★★ 운영자에게 「대시보드」로 가는 길이 없다 (반대쪽도 같은 문제였다)',
    dash.every((a) => a.hidden), '보이는 것: ' + dash.filter((a) => !a.hidden).length + '개');
  const myTab = links2.filter((a) => fileOf(a) === 'library.html');
  ok('운영자의 「문구」 길은 보인다', myTab.length > 0 && myTab.some((a) => !a.hidden));
}

/* =================================================================
   4. ★ 노동자 탭 막대는 건드리지 않는다
   ================================================================= */
{
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  const tabs = [...t.win.document.querySelectorAll('.tabbar a')];
  ok('노동자 탭 막대가 있다', tabs.length > 0);
  ok('★ 노동자 탭은 하나도 감추지 않는다 (PAGE_ROLES 에 없는 주소)',
    tabs.every((a) => !a.hidden), '감춰진 것: ' + tabs.filter((a) => a.hidden).map((a) => a.getAttribute('href')).join(', '));
  ok('오류 없이 뜬다', t.errors.length === 0, t.errors.join(' | '));
}

/* =================================================================
   5. ★ 감춘 탭이 실제로 안 보인다 — CSS 가 hidden 을 이기지 않게
   ================================================================= */
ok('★ .tabbar a[hidden] 에 display:none 을 적었다 (display:flex 가 hidden 을 이긴다)',
  /\.tabbar a\[hidden\]\s*\{[^}]*display:\s*none/.test(css));
ok('markCurrentTab 이 역할을 본다', /Auth\.current\(\)/.test(ui.slice(ui.indexOf('function markCurrentTab'), ui.indexOf('function markCurrentTab') + 700)));

report('하단 탭 막대 — 못 들어가는 탭을 보여 주지 않는다');
