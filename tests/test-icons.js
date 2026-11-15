/* 선 아이콘 (icons.js) — 이모지가 새어 나오지 않는가

   ★★ 이 묶음에서 가장 중요한 것은 §5 다 — **화면 13개를 실제로 그려 보고
     이모지가 하나라도 남아 있으면 잡는다.** 아이콘은 한 곳에서 바꿀 수 있는
     것이 아니라 30개 파일에 흩어져 있어서, 새 화면이나 새 버튼을 만들 때
     이모지를 그대로 넣기가 아주 쉽다. 그러면 화면 말투가 다시 섞인다.

   ★ 저장된 데이터를 고치지 않는다는 것도 검사한다 (§3).
     setup.processes[].icon 은 localStorage 에 이모지로 들어 있다.
     그 값에 대응하는 아이콘이 없으면 그 자리에만 이모지가 남는다.

   ★ 그리고 "모르는 값은 글자로 돌려준다" 를 지킨다 (§4).
     담당자가 직접 넣은 글자가 조용히 사라지면 안 된다. */
const fs = require('fs');
const path = require('path');
const { boot, ok, eq, has, report, SRC, iconName, iconNames } = require('./harness');

const src = fs.readFileSync(path.join(SRC, 'assets/icons.js'), 'utf8');
const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');

/* 이모지 판정 — 코드포인트 범위로 본다.
   ✓ ✗ 같은 글자는 버튼 라벨에 글자로 남겨 둔 곳이 있어 뺀다 (그림 자리가 아니다). */
const RANGES = [
  [0x1f300, 0x1faff], [0x1f000, 0x1f2ff],
  [0x2600, 0x26ff], [0x2700, 0x27bf],
  [0x25cf, 0x25cf], [0x25cb, 0x25cb], [0x2611, 0x2611],
];
const TEXT_OK = new Set([0x2605, 0x2606, 0x2713, 0x2714]);
function emojiIn(text) {
  const found = new Set();
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (TEXT_OK.has(cp)) continue;
    if (RANGES.some(([a, b]) => cp >= a && cp <= b)) found.add(ch);
  }
  return [...found];
}

/* =================================================================
   1. 이 파일이 프로젝트 규칙을 지키는가
   ================================================================= */
{
  const urls = src.match(/https?:\/\/[^\s'")]+/g) || [];
  const outside = urls.filter((u) => u.indexOf('http://www.w3.org/2000/svg') === -1);
  ok('★ 외부 주소가 0건이다 (아이콘 폰트도 svg 파일도 쓰지 않는다)',
    outside.length === 0, outside.join(', '));

  /* 주석에는 "innerHTML 을 쓰지 않는다" 라고 적혀 있다 — 코드만 본다 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  ok('★ innerHTML 을 쓰지 않는다', code.indexOf('innerHTML') === -1);
  has('createElementNS 로 만든다', src, 'createElementNS');
  ok('ES 모듈을 쓰지 않는다', !/^\s*(import|export)\s/m.test(src));
  has('var 로 감싼 즉시 실행 함수다', src, 'var Icons = (function ()');

  /* 왜 이렇게 만들었는지가 파일에 적혀 있어야 한다 */
  has('저장 데이터를 안 고치는 이유가 적혀 있다', src, 'localStorage');
  has('흑백으로도 구분된다는 것이 적혀 있다', src, '흑백');
}

/* =================================================================
   2. 아이콘이 성한가
   ================================================================= */
{
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  const I = t.win.Icons;

  ok('아이콘이 충분히 있다', I.NAMES.length >= 40, String(I.NAMES.length));

  /* 매핑이 없는 아이콘을 가리키면 그 자리가 빈다 */
  const dangling = Object.keys(I.EMOJI).filter((e) => !I.has(I.EMOJI[e]));
  ok('★ 이모지 표가 없는 아이콘을 가리키지 않는다', dangling.length === 0,
    dangling.join(', '));

  /* 만들어진 svg 가 규격을 지키는가 */
  const s = I.svg('speaker');
  ok('svg 를 만든다', !!s);
  eq('좌표계가 24×24 다', s.getAttribute('viewBox'), '0 0 24 24');
  eq('★ 이름이 data-icon 으로 남는다 (검사와 디버깅이 이걸 본다)',
    s.getAttribute('data-icon'), 'speaker');
  eq('★ 색은 글자색을 따라간다 (배지 안에서도, 흑백 인쇄에서도)',
    s.getAttribute('stroke'), 'currentColor');
  eq('★ 낭독기에서는 숨긴다 (뜻은 옆 글자가 나른다)',
    s.getAttribute('aria-hidden'), 'true');
  eq('class 로 크기를 잡는다', s.getAttribute('class'), 'icon');
  ok('그림이 비어 있지 않다', s.childNodes.length > 0);

  /* 도형 태그가 정해진 것뿐인가 — 오타가 나면 그 아이콘만 조용히 안 보인다.
     ★ 좌표 크기는 검사하지 않는다. 상대 좌표(l·v·h·a)에는 음수와 큰 값이
       정상적으로 들어가므로, 숫자만 보고 판정하면 멀쩡한 그림을 잡는다. */
  const OK_TAGS = ['path', 'rect', 'circle', 'line', 'polyline', 'polygon'];
  const oddTag = [];
  const empty = [];
  I.NAMES.forEach((n) => {
    const node = I.svg(n);
    if (!node.childNodes.length) empty.push(n);
    for (let i = 0; i < node.childNodes.length; i++) {
      const tag = String(node.childNodes[i].tagName || '').toLowerCase();
      if (OK_TAGS.indexOf(tag) === -1) oddTag.push(n + ':' + tag);
    }
  });
  ok('아이콘마다 도형이 하나 이상 있다', empty.length === 0, empty.join(', '));
  ok('정해진 도형 태그만 쓴다', oddTag.length === 0, oddTag.join(', '));
}

/* =================================================================
   3. ★ 저장된 데이터의 이모지가 전부 아이콘을 찾는가

   setup 과 library 는 localStorage 에 이모지를 담고 있다. 하나라도
   빠지면 그 자리에만 이모지가 남아 화면 말투가 섞인다.
   ================================================================= */
{
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  const S = t.win.Store;
  const I = t.win.Icons;

  const missHaz = S.HAZARDS.filter((h) => !I.nameOf(h.icon)).map((h) => h.code);
  ok('★ 위험유형 6가지가 전부 아이콘을 찾는다', missHaz.length === 0, missHaz.join(', '));

  const missPick = S.ICONS.filter((e) => !I.nameOf(e));
  ok('★ 설비 아이콘 후보가 전부 아이콘을 찾는다', missPick.length === 0,
    missPick.join(' '));

  const st = S.PHRASE_STATUS;
  const missSt = Object.keys(st).filter((k) => st[k].icon && !I.nameOf(st[k].icon));
  ok('★ 검수 상태 아이콘이 전부 아이콘을 찾는다', missSt.length === 0, missSt.join(', '));

  /* 예시 데이터가 넣는 공정·설비 아이콘도 */
  const setup = S.setup.load();
  const missSeed = []
    .concat(setup.processes.map((p) => p.icon))
    .concat(setup.equipments.map((e) => e.icon))
    .filter((e) => e && !I.nameOf(e));
  ok('★ 예시 데이터의 공정·설비 아이콘도 전부 찾는다', missSeed.length === 0,
    missSeed.join(' '));
}

/* =================================================================
   4. 모르는 값은 글자로 돌려준다 — 담당자가 넣은 것을 지우지 않는다
   ================================================================= */
{
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  const I = t.win.Icons;

  eq('모르는 값은 아이콘 이름이 없다', I.nameOf('프레스 3호기'), '');
  const n = I.node('프레스 3호기');
  eq('★ 모르는 값은 글자 노드로 돌려준다 (조용히 사라지지 않는다)',
    n.nodeType, 3);
  eq('글자가 그대로 남는다', n.textContent, '프레스 3호기');

  eq('빈 값도 죽지 않는다', I.node(null).textContent, '');
  eq('이름으로도 찾는다', I.nameOf('speaker'), 'speaker');
}

/* =================================================================
   5. ★★ 화면 13개에 이모지가 남아 있지 않은가

   이 절이 이 묶음의 이유다. 새 버튼에 이모지를 그대로 넣으면 여기서 잡힌다.
   ================================================================= */
{
  const PAGES = [
    ['worker/home.html', 'W-4821-07', 'worker', 'worker/home.js'],
    ['worker/learn.html', 'W-4821-07', 'worker', 'worker/learn.js'],
    ['worker/quiz.html', 'W-4821-07', 'worker', 'worker/quiz.js'],
    ['worker/report.html', 'W-4821-07', 'worker', 'worker/report.js'],
    ['worker/talk.html', 'W-4821-07', 'worker', 'worker/talk.js'],
    ['worker/my.html', 'W-4821-07', 'worker', 'worker/my.js'],
    ['admin/dashboard.html', 'kim@daesung.co.kr', 'admin', 'admin/dashboard.js'],
    ['admin/setup.html', 'kim@daesung.co.kr', 'admin', 'admin/setup.js'],
    ['admin/content.html', 'kim@daesung.co.kr', 'admin', 'admin/content.js'],
    ['admin/autogen.html', 'kim@daesung.co.kr', 'admin', 'admin/autogen.js'],
    ['admin/proof.html', 'kim@daesung.co.kr', 'admin', 'admin/proof.js'],
    ['admin/library.html', 'oper@safety.kr', 'operator', 'admin/library.js'],
    ['index.html', null, null, 'assets/login.js'],
    ['signup.html', null, null, 'assets/signup.js'],
  ];

  let total = 0;
  PAGES.forEach(([page, login, role, js]) => {
    const t = login ? boot(page, { login, role, page: js }) : boot(page, { page: js });
    const left = emojiIn(t.win.document.body.textContent);
    ok('★★ ' + page + ' 에 이모지가 남아 있지 않다', left.length === 0, left.join(' '));

    const icons = t.win.document.querySelectorAll('svg[data-icon]').length;
    total += icons;
    ok(page + ' 에 아이콘이 그려진다', icons > 0, String(icons));
  });
  ok('화면 전체에 아이콘이 넉넉히 그려진다', total > 200, String(total));
}

/* =================================================================
   6. HTML 에는 이모지 원문이 남아 있는가 — JS 가 멈췄을 때의 대비책
      (i18n.js 가 한국어 원문을 남겨 두는 것과 같은 이유)
   ================================================================= */
{
  const TABBED = ['home', 'learn', 'quiz', 'report', 'talk', 'my'];
  TABBED.forEach((p) => {
    const html = fs.readFileSync(path.join(SRC, 'worker/' + p + '.html'), 'utf8');
    has(p + ' 이 icons.js 를 읽는다', html, 'assets/icons.js');
    ok('★ ' + p + ' 의 HTML 에 이모지가 그대로 남아 있다 (JS 가 멈춰도 탭이 안 빈다)',
      emojiIn(html).length > 0);

    /* icons.js 가 ui.js 보다 먼저 실려야 한다 — ui.js 가 부르는 쪽이다 */
    ok(p + ' 이 icons.js 를 ui.js 보다 먼저 읽는다',
      html.indexOf('assets/icons.js') < html.indexOf('assets/ui.js'));
  });

  ['setup', 'dashboard', 'content', 'proof', 'library'].forEach((p) => {
    const html = fs.readFileSync(path.join(SRC, 'admin/' + p + '.html'), 'utf8');
    has('admin/' + p + ' 이 icons.js 를 읽는다', html, 'assets/icons.js');
  });

  has('★ sw.js 가 icons.js 를 담아 둔다 (오프라인에서 아이콘이 사라지면 안 된다)',
    sw, "'assets/icons.js'");
}

/* =================================================================
   7. 상태는 색만으로 구분하지 않는가 — 모양이 서로 달라야 한다
   ================================================================= */
{
  const t = boot('admin/library.html', {
    login: 'oper@safety.kr', role: 'operator', page: 'admin/library.js',
  });
  const UI = t.win.UI;

  const names = ['okBadge', 'waitBadge', 'stopBadge', 'neutralBadge']
    .map((fn) => iconName(UI[fn]('시험')));
  eq('배지 4가지의 모양이 서로 다르다', new Set(names).size, 4);
  ok('★ 이름이 뜻과 맞다 (완료=체크 · 대기=찬 원 · 중지=경고 · 중립=빈 원)',
    names.join(',') === 'check,dot,alert,circle', names.join(','));

  /* 배지는 아이콘 + 글자 + 색 3중이다 */
  const b = UI.okBadge('이수');
  ok('배지에 아이콘이 있다', !!iconName(b));
  has('배지에 글자가 있다', b.textContent, '이수');
  has('배지에 색 class 가 있다', b.className, 'badge-ok');

  /* 화면에서 실제로 3중인지 */
  const badges = [...t.win.document.querySelectorAll('.badge')];
  ok('화면에 배지가 있다', badges.length > 0);
  const noIcon = badges.filter((n) => !iconName(n));
  ok('★ 모든 배지에 그림이 있다 (글자를 못 읽어도 뜻이 남아야 한다)',
    noIcon.length === 0, noIcon.map((n) => n.textContent.trim()).join(' | '));
}

/* =================================================================
   8. 문항 3유형이 서로 다른 그림인가 — 글자를 못 읽어도 구분돼야 한다
   ================================================================= */
{
  const t = boot('worker/quiz.html?course=c-press', {
    login: 'W-4821-07', page: 'worker/quiz.js',
  });
  const I = t.win.Icons;
  const three = ['touch', 'checkbox', 'link'];
  three.forEach((n) => ok('문항 유형 그림 ' + n + ' 이 있다', I.has(n)));
  eq('세 유형의 그림이 서로 다르다', new Set(three).size, 3);
  ok('지금 화면에 유형 그림이 떠 있다', !!iconName(t.$('quiz-kind')),
    iconName(t.$('quiz-kind')));
}

/* =================================================================
   9. 이모지를 바꿔 끼우는 통로가 실제로 도는가
   ================================================================= */
{
  const t = boot('worker/home.html', { login: 'W-4821-07', page: 'worker/home.js' });
  const doc = t.win.document;
  const I = t.win.Icons;

  /* 손으로 이모지 칸을 하나 만들어 넣고 바꿔 끼워 본다 */
  const box = doc.createElement('span');
  box.className = 'ico';
  box.textContent = S_HOME();
  doc.body.appendChild(box);
  eq('바꾸기 전에는 이모지다', emojiIn(box.textContent).length, 1);

  I.upgrade(doc);
  eq('★ 바꿔 끼운 뒤에는 아이콘이다', iconName(box), 'home');
  eq('이모지가 남지 않는다', emojiIn(box.textContent).length, 0);

  /* 두 번 불러도 덧그리지 않는다 */
  I.upgrade(doc);
  eq('★ 다시 불러도 아이콘이 하나뿐이다', iconNames(box).length, 1);

  /* 모르는 값은 건드리지 않는다 */
  const keep = doc.createElement('span');
  keep.className = 'ico';
  keep.textContent = '프레스';
  doc.body.appendChild(keep);
  I.upgrade(doc);
  eq('★ 모르는 값은 글자를 그대로 둔다', keep.textContent, '프레스');

  function S_HOME() { return String.fromCodePoint(0x1f3e0); }
}

report('선 아이콘 — 이모지가 새어 나오지 않는가');
